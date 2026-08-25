-- Ascend Phase 3 — Phase System
-- Builds on 0001. Additive, idempotent.

-- =====================================================
-- Expand phase_templates for richer journey definitions
-- =====================================================
alter table public.phase_templates add column if not exists objective text;
alter table public.phase_templates add column if not exists difficulty text check (difficulty in ('easy','standard','hard','extreme')) default 'standard';
alter table public.phase_templates add column if not exists reward_xp int not null default 0 check (reward_xp >= 0);
alter table public.phase_templates add column if not exists completion_requirements jsonb not null default '[]'::jsonb;
alter table public.phase_templates add column if not exists final_challenge jsonb;
alter table public.phase_templates add column if not exists color_accent text;

-- =====================================================
-- Expand phases to full spec
-- =====================================================
alter table public.phases add column if not exists objective text;
alter table public.phases add column if not exists phase_number int;
alter table public.phases add column if not exists start_date date;
alter table public.phases add column if not exists target_date date;
alter table public.phases add column if not exists completed_at timestamptz;
alter table public.phases add column if not exists difficulty text check (difficulty in ('easy','standard','hard','extreme')) default 'standard';
alter table public.phases add column if not exists focus_areas jsonb not null default '[]'::jsonb;
alter table public.phases add column if not exists completion_requirements jsonb not null default '[]'::jsonb;
alter table public.phases add column if not exists final_challenge jsonb;
alter table public.phases add column if not exists reward_xp int not null default 0 check (reward_xp >= 0);

-- Backfill phase_number from order_index where null
update public.phases set phase_number = order_index where phase_number is null;

-- Backfill focus_areas from phase_focus_areas if still empty and legacy rows exist (best-effort, not required)
-- (intentionally not migrating old phase_focus_areas rows; they remain queryable via join)

-- =====================================================
-- Migrate phases status: idle -> available, add locked/available/archived
-- =====================================================
do $$
begin
  -- Drop old check if exists
  begin
    alter table public.phases drop constraint if exists phases_status_check;
  exception when others then null;
  end;
  -- Some installs use a generated check name; also try to drop any remaining check on status
  -- Normalize idle -> available before adding new check
  update public.phases set status = 'available' where status = 'idle';
  -- Ensure any null becomes locked
  update public.phases set status = 'locked' where status is null;
end $$;

alter table public.phases add constraint phases_status_check check (status in ('locked','available','active','completed','archived'));

-- Indexes for common queries
create index if not exists idx_phases_user_status on public.phases(user_id, status);
create index if not exists idx_phases_phase_number on public.phases(phase_number);

-- Ensure updated_at trigger still exists (already created in 0001)
drop trigger if exists trg_phases_updated on public.phases;
create trigger trg_phases_updated before update on public.phases for each row execute function public.handle_updated_at();

-- =====================================================
-- Expand milestones for XP + final challenge participation
-- =====================================================
alter table public.milestones add column if not exists xp_reward int not null default 20 check (xp_reward >= 0 and xp_reward <= 1000);
alter table public.milestones add column if not exists requirements jsonb;
alter table public.milestones add column if not exists is_final_challenge boolean not null default false;

create index if not exists idx_milestones_phase_status on public.milestones(phase_id, status);
create index if not exists idx_milestones_final on public.milestones(phase_id, is_final_challenge) where is_final_challenge = true;

-- Ensure updated_at trigger still exists
drop trigger if exists trg_milestones_updated on public.milestones;
create trigger trg_milestones_updated before update on public.milestones for each row execute function public.handle_updated_at();

-- =====================================================
-- Seed: update phase_templates with full Phase 3 payloads
-- Idempotent via ON CONFLICT (slug)
-- =====================================================
insert into public.phase_templates (slug, title, subtitle, order_index, description, objective, difficulty, reward_xp, focus_areas, completion_requirements, final_challenge, color_accent)
values
('foundation','PHASE 01 — FOUNDATION','Build the base',1,
 'Establish core habits, clarify your goal, and create a stable starting point. Foundation is about consistency over intensity.',
 'Build a stable foundation.',
 'standard', 300,
 '["routine","consistency","planning","learning","physical activity","self-awareness"]'::jsonb,
 '["Create a basic routine","Complete learning sessions","Complete physical activities","Build momentum","Complete reflection","Complete final challenge"]'::jsonb,
 '{"title":"Foundation Challenge","description":"Complete a 5-day momentum streak and reflect on what you built.","xp_reward":200,"status":"locked"}'::jsonb,
 'violet'
),
('discipline','PHASE 02 — DISCIPLINE','Forge consistency',2,
 'Develop disciplined execution through structured routines, accountability, and focused effort.',
 'Build consistency and follow-through.',
 'standard', 400,
 '["focus","time management","reducing distractions","completing difficult tasks","routine"]'::jsonb,
 '["Establish deep work blocks","Reduce distraction triggers","Complete difficult tasks","Maintain routine"]'::jsonb,
 '{"title":"Discipline Challenge","description":"Complete a focused 7-day execution sprint without missing a critical quest.","xp_reward":250,"status":"locked"}'::jsonb,
 'indigo'
),
('growth','PHASE 03 — GROWTH','Expand capacity',3,
 'Push beyond comfort, acquire new skills, and increase your capability through deliberate practice.',
 'Develop physical, intellectual, emotional, and practical abilities.',
 'hard', 500,
 '["intellect","physical development","emotional intelligence","communication","learning","creativity","practical skills"]'::jsonb,
 '["Learn a new skill","Apply it in a real task","Document growth","Seek feedback"]'::jsonb,
 '{"title":"Growth Challenge","description":"Ship a tangible artifact that proves new capability.","xp_reward":300,"status":"locked"}'::jsonb,
 'emerald'
),
('mastery','PHASE 04 — MASTERY','Refine and excel',4,
 'Refine your craft toward mastery with precision, reflection, and high standards.',
 'Deepen the skills that matter most.',
 'hard', 600,
 '["deliberate practice","precision","reflection","excellence","feedback"]'::jsonb,
 '["Define mastery criteria","Practice with precision","Reflect and iterate","Demonstrate excellence"]'::jsonb,
 '{"title":"Mastery Challenge","description":"Deliver a mastery-level outcome judged against a high bar.","xp_reward":350,"status":"locked"}'::jsonb,
 'amber'
),
('expansion','PHASE 05 — EXPANSION','Scale your impact',5,
 'Expand influence, lead others, and scale what you have built beyond yourself.',
 'Apply personal growth to real life.',
 'extreme', 700,
 '["leadership","systems thinking","influence","scale","collaboration"]'::jsonb,
 '["Lead a small initiative","Build a system that scales","Measure impact"]'::jsonb,
 '{"title":"Expansion Challenge","description":"Lead or launch something that extends beyond yourself.","xp_reward":400,"status":"locked"}'::jsonb,
 'sky'
),
('legacy','PHASE 06 — LEGACY','Create what lasts',6,
 'Define and build your legacy — work that endures and inspires beyond the current phase.',
 'Build something meaningful and contribute beyond yourself.',
 'extreme', 800,
 '["vision","contribution","sustainability","legacy","mentorship"]'::jsonb,
 '["Define legacy vision","Contribute meaningful work","Make it sustainable"]'::jsonb,
 '{"title":"Legacy Challenge","description":"Create and share work that lasts beyond this phase.","xp_reward":500,"status":"locked"}'::jsonb,
 'rose'
)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  order_index = excluded.order_index,
  description = excluded.description,
  objective = excluded.objective,
  difficulty = excluded.difficulty,
  reward_xp = excluded.reward_xp,
  focus_areas = excluded.focus_areas,
  completion_requirements = excluded.completion_requirements,
  final_challenge = excluded.final_challenge,
  color_accent = excluded.color_accent;

-- Keep legacy global seeds (stats/skills) untouched
