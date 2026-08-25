-- Ascend Phase 2 Foundation
-- Dedicated Ascend Supabase project: fpspwpmxlnfsegcwqeir
-- Idempotent-ish: safe to run once via Supabase SQL Editor

-- Extensions
create extension if not exists "pgcrypto";

-- =====================================================
-- Helpers: updated_at trigger
-- =====================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================
-- Helper: profile auto-creation on auth.users insert
-- =====================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_avatar_url text;
  v_username text;
  v_base text;
  v_suffix text;
  v_attempt int := 0;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')), '');
  v_avatar_url := nullif(trim(coalesce(new.raw_user_meta_data->>'avatar_url','')), '');

  -- base username from email local part, normalized
  v_base := lower(regexp_replace(coalesce(split_part(new.email,'@','1'), 'user'), '[^a-z0-9_]+', '_', 'g'));
  v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
  v_base := substring(v_base from 1 for 20);
  if v_base is null or length(v_base) < 3 then
    v_base := 'user';
  end if;
  v_suffix := substring(replace(new.id::text,'-','') from 1 for 4);
  v_username := v_base || '_' || v_suffix;
  v_username := lower(substring(v_username from 1 for 30));

  -- Ensure uniqueness with retry (rare collision)
  loop
    begin
      insert into public.profiles (id, display_name, username, avatar_url, bio)
      values (new.id, v_display_name, v_username, v_avatar_url, null);
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 5 then
        -- fallback to uuid-based username
        v_username := 'user_' || substring(replace(new.id::text,'-','') from 1 for 8);
        v_attempt := 0;
      else
        v_username := v_base || '_' || substring(replace(gen_random_uuid()::text,'-','') from 1 for 4);
      end if;
    end;
  end loop;

  return new;
end;
$$;

-- =====================================================
-- Tables: global catalogs first
-- =====================================================

-- phase_templates (global read-only)
create table if not exists public.phase_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text not null,
  order_index int not null,
  description text not null,
  focus_areas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_phase_templates_order on public.phase_templates(order_index);
create index if not exists idx_phase_templates_slug on public.phase_templates(slug);

-- skills (global)
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

-- stats (global)
create table if not exists public.stats (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- achievements (global)
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  criteria jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================
-- User-owned tables
-- =====================================================

-- profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 40),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 300)
);
create index if not exists idx_profiles_username on public.profiles(username);

-- goals
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_goals_user on public.goals(user_id);
create index if not exists idx_goals_status on public.goals(status);

-- phases
create table if not exists public.phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references public.goals(id) on delete set null,
  template_id uuid references public.phase_templates(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  slug text,
  status text not null default 'idle' check (status in ('idle','active','completed')),
  order_index int not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_phases_user on public.phases(user_id);
create index if not exists idx_phases_goal on public.phases(goal_id);
create index if not exists idx_phases_template on public.phases(template_id);
create index if not exists idx_phases_status on public.phases(status);

-- phase_focus_areas
create table if not exists public.phase_focus_areas (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_phase_focus_areas_phase on public.phase_focus_areas(phase_id);

-- milestones
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  sort_order int not null default 0,
  status text not null default 'pending' check (status in ('pending','active','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_milestones_phase on public.milestones(phase_id);

-- quests (denormalize user_id for simple RLS)
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete cascade,
  phase_id uuid references public.phases(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  description text,
  xp_reward int not null default 10 check (xp_reward > 0 and xp_reward <= 1000),
  sort_order int not null default 0,
  is_recurring boolean not null default false,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quests_parent check (milestone_id is not null or phase_id is not null)
);
create index if not exists idx_quests_user on public.quests(user_id);
create index if not exists idx_quests_milestone on public.quests(milestone_id);
create index if not exists idx_quests_phase on public.quests(phase_id);

-- quest_completions
create table if not exists public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  completed_at timestamptz not null default now(),
  xp_awarded int not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_quest_completions_user on public.quest_completions(user_id);
create index if not exists idx_quest_completions_quest on public.quest_completions(quest_id);
create index if not exists idx_quest_completions_completed on public.quest_completions(completed_at);

-- user_skills
create table if not exists public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  level int not null default 1 check (level >= 1 and level <= 100),
  xp int not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, skill_id)
);
create index if not exists idx_user_skills_user on public.user_skills(user_id);

-- user_stats
create table if not exists public.user_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stat_id uuid not null references public.stats(id) on delete cascade,
  value numeric not null default 0 check (value >= 0),
  level int not null default 1 check (level >= 1 and level <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, stat_id)
);
create index if not exists idx_user_stats_user on public.user_stats(user_id);

-- xp_transactions
create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null check (amount <> 0),
  source text not null check (char_length(source) between 1 and 60),
  quest_id uuid references public.quests(id) on delete set null,
  skill_id uuid references public.skills(id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_xp_transactions_user on public.xp_transactions(user_id);
create index if not exists idx_xp_transactions_created on public.xp_transactions(created_at);

-- user_achievements
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, achievement_id)
);
create index if not exists idx_user_achievements_user on public.user_achievements(user_id);

-- momentum
create table if not exists public.momentum (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  score int not null default 0 check (score >= 0),
  streak int not null default 0 check (streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);
create index if not exists idx_momentum_user_date on public.momentum(user_id, date);

-- reflections
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase_id uuid references public.phases(id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reflections_user on public.reflections(user_id);
create index if not exists idx_reflections_phase on public.reflections(phase_id);

-- experiments
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  hypothesis text,
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_experiments_user on public.experiments(user_id);

-- experiment_entries
create table if not exists public.experiment_entries (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists idx_experiment_entries_experiment on public.experiment_entries(experiment_id);
create index if not exists idx_experiment_entries_user on public.experiment_entries(user_id);

-- =====================================================
-- Triggers: updated_at
-- =====================================================
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.handle_updated_at();

drop trigger if exists trg_goals_updated on public.goals;
create trigger trg_goals_updated before update on public.goals for each row execute function public.handle_updated_at();

drop trigger if exists trg_phases_updated on public.phases;
create trigger trg_phases_updated before update on public.phases for each row execute function public.handle_updated_at();

drop trigger if exists trg_milestones_updated on public.milestones;
create trigger trg_milestones_updated before update on public.milestones for each row execute function public.handle_updated_at();

drop trigger if exists trg_quests_updated on public.quests;
create trigger trg_quests_updated before update on public.quests for each row execute function public.handle_updated_at();

drop trigger if exists trg_user_skills_updated on public.user_skills;
create trigger trg_user_skills_updated before update on public.user_skills for each row execute function public.handle_updated_at();

drop trigger if exists trg_user_stats_updated on public.user_stats;
create trigger trg_user_stats_updated before update on public.user_stats for each row execute function public.handle_updated_at();

drop trigger if exists trg_momentum_updated on public.momentum;
create trigger trg_momentum_updated before update on public.momentum for each row execute function public.handle_updated_at();

drop trigger if exists trg_reflections_updated on public.reflections;
create trigger trg_reflections_updated before update on public.reflections for each row execute function public.handle_updated_at();

drop trigger if exists trg_experiments_updated on public.experiments;
create trigger trg_experiments_updated before update on public.experiments for each row execute function public.handle_updated_at();

-- =====================================================
-- Trigger: auto-create profile on auth.users insert
-- =====================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================
-- Seed: phase_templates (exactly 6, idempotent)
-- =====================================================
insert into public.phase_templates (slug, title, subtitle, order_index, description, focus_areas) values
('foundation','PHASE 01 — FOUNDATION','Build the base','1','Establish core habits, clarify your goal, and create a stable starting point. Foundation is about consistency over intensity.',
  '["Habit formation","Goal clarity","Environment design","Baseline fitness"]'::jsonb),
('discipline','PHASE 02 — DISCIPLINE','Forge consistency','2','Develop disciplined execution through structured routines, accountability, and focused effort.',
  '["Routine mastery","Time blocking","Accountability","Deep work"]'::jsonb),
('growth','PHASE 03 — GROWTH','Expand capacity','3','Push beyond comfort, acquire new skills, and increase your capability through deliberate practice.',
  '["Skill acquisition","Challenge exposure","Feedback loops","Resilience"]'::jsonb),
('mastery','PHASE 04 — MASTERY','Refine and excel','4','Refine your craft toward mastery with precision, reflection, and high standards.',
  '["Deliberate practice","Precision","Reflection","Excellence"]'::jsonb),
('expansion','PHASE 05 — EXPANSION','Scale your impact','5','Expand influence, lead others, and scale what you have built beyond yourself.',
  '["Leadership","Systems thinking","Influence","Scale"]'::jsonb),
('legacy','PHASE 06 — LEGACY','Create what lasts','6','Define and build your legacy — work that endures and inspires beyond the current phase.',
  '["Vision","Contribution","Sustainability","Legacy"]'::jsonb)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  order_index = excluded.order_index,
  description = excluded.description,
  focus_areas = excluded.focus_areas;

-- Seed global stats (optional but useful)
insert into public.stats (slug, name, description) values
('focus','Focus','Deep work & clarity'),
('discipline','Discipline','Consistency & follow-through'),
('resilience','Resilience','Recovery & grit')
on conflict (slug) do nothing;

-- Seed global skills (minimal)
insert into public.skills (slug, name, description) values
('deep-work','Deep Work','Sustained focused effort'),
('consistency','Consistency','Showing up daily'),
('reflection','Reflection','Learning from experience')
on conflict (slug) do nothing;

-- =====================================================
-- Row Level Security: enable + policies
-- =====================================================

-- Enable RLS
alter table public.phase_templates enable row level security;
alter table public.skills enable row level security;
alter table public.stats enable row level security;
alter table public.achievements enable row level security;
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.phases enable row level security;
alter table public.phase_focus_areas enable row level security;
alter table public.milestones enable row level security;
alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.user_skills enable row level security;
alter table public.user_stats enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.momentum enable row level security;
alter table public.reflections enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_entries enable row level security;

-- Drop existing policies if re-running
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Global templates/catalogs: authenticated read only
create policy phase_templates_select_authenticated on public.phase_templates for select to authenticated using (true);
create policy skills_select_authenticated on public.skills for select to authenticated using (true);
create policy stats_select_authenticated on public.stats for select to authenticated using (true);
create policy achievements_select_authenticated on public.achievements for select to authenticated using (true);

-- profiles: owner only
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_delete_own on public.profiles for delete to authenticated using (auth.uid() = id);

-- goals
create policy goals_select_own on public.goals for select to authenticated using (auth.uid() = user_id);
create policy goals_insert_own on public.goals for insert to authenticated with check (auth.uid() = user_id);
create policy goals_update_own on public.goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goals_delete_own on public.goals for delete to authenticated using (auth.uid() = user_id);

-- phases
create policy phases_select_own on public.phases for select to authenticated using (auth.uid() = user_id);
create policy phases_insert_own on public.phases for insert to authenticated with check (auth.uid() = user_id);
create policy phases_update_own on public.phases for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy phases_delete_own on public.phases for delete to authenticated using (auth.uid() = user_id);

-- phase_focus_areas: via parent phase ownership
create policy pfa_select_own on public.phase_focus_areas for select to authenticated using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));
create policy pfa_insert_own on public.phase_focus_areas for insert to authenticated with check (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));
create policy pfa_update_own on public.phase_focus_areas for update to authenticated using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid())) with check (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));
create policy pfa_delete_own on public.phase_focus_areas for delete to authenticated using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));

-- milestones
create policy milestones_select_own on public.milestones for select to authenticated using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));
create policy milestones_insert_own on public.milestones for insert to authenticated with check (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));
create policy milestones_update_own on public.milestones for update to authenticated using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid())) with check (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));
create policy milestones_delete_own on public.milestones for delete to authenticated using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));

-- quests
create policy quests_select_own on public.quests for select to authenticated using (auth.uid() = user_id);
create policy quests_insert_own on public.quests for insert to authenticated with check (auth.uid() = user_id);
create policy quests_update_own on public.quests for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy quests_delete_own on public.quests for delete to authenticated using (auth.uid() = user_id);

-- quest_completions
create policy qc_select_own on public.quest_completions for select to authenticated using (auth.uid() = user_id);
create policy qc_insert_own on public.quest_completions for insert to authenticated with check (auth.uid() = user_id);
create policy qc_update_own on public.quest_completions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy qc_delete_own on public.quest_completions for delete to authenticated using (auth.uid() = user_id);

-- user_skills
create policy us_select_own on public.user_skills for select to authenticated using (auth.uid() = user_id);
create policy us_insert_own on public.user_skills for insert to authenticated with check (auth.uid() = user_id);
create policy us_update_own on public.user_skills for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy us_delete_own on public.user_skills for delete to authenticated using (auth.uid() = user_id);

-- user_stats
create policy ust_select_own on public.user_stats for select to authenticated using (auth.uid() = user_id);
create policy ust_insert_own on public.user_stats for insert to authenticated with check (auth.uid() = user_id);
create policy ust_update_own on public.user_stats for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ust_delete_own on public.user_stats for delete to authenticated using (auth.uid() = user_id);

-- xp_transactions
create policy xp_select_own on public.xp_transactions for select to authenticated using (auth.uid() = user_id);
create policy xp_insert_own on public.xp_transactions for insert to authenticated with check (auth.uid() = user_id);
create policy xp_update_own on public.xp_transactions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy xp_delete_own on public.xp_transactions for delete to authenticated using (auth.uid() = user_id);

-- user_achievements
create policy ua_select_own on public.user_achievements for select to authenticated using (auth.uid() = user_id);
create policy ua_insert_own on public.user_achievements for insert to authenticated with check (auth.uid() = user_id);
create policy ua_update_own on public.user_achievements for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ua_delete_own on public.user_achievements for delete to authenticated using (auth.uid() = user_id);

-- momentum
create policy momentum_select_own on public.momentum for select to authenticated using (auth.uid() = user_id);
create policy momentum_insert_own on public.momentum for insert to authenticated with check (auth.uid() = user_id);
create policy momentum_update_own on public.momentum for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy momentum_delete_own on public.momentum for delete to authenticated using (auth.uid() = user_id);

-- reflections
create policy reflections_select_own on public.reflections for select to authenticated using (auth.uid() = user_id);
create policy reflections_insert_own on public.reflections for insert to authenticated with check (auth.uid() = user_id);
create policy reflections_update_own on public.reflections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy reflections_delete_own on public.reflections for delete to authenticated using (auth.uid() = user_id);

-- experiments
create policy experiments_select_own on public.experiments for select to authenticated using (auth.uid() = user_id);
create policy experiments_insert_own on public.experiments for insert to authenticated with check (auth.uid() = user_id);
create policy experiments_update_own on public.experiments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy experiments_delete_own on public.experiments for delete to authenticated using (auth.uid() = user_id);

-- experiment_entries
create policy ee_select_own on public.experiment_entries for select to authenticated using (auth.uid() = user_id);
create policy ee_insert_own on public.experiment_entries for insert to authenticated with check (auth.uid() = user_id);
create policy ee_update_own on public.experiment_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ee_delete_own on public.experiment_entries for delete to authenticated using (auth.uid() = user_id);
