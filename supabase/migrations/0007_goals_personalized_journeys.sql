-- Ascend Phase 7 — Goals + Personalized Phase Journeys
-- Builds on 0001–0006. Additive, idempotent.
--
-- Goals become first-class north stars with full spec fields, and every goal
-- can carry its OWN arbitrary-length phase journey (phases.goal_id existed
-- since 0001; this migration adds the blueprint catalog + goal auto-completion
-- that flows upward: quest -> milestone -> phase -> goal).

-- =====================================================
-- Extend goals to full spec
-- =====================================================
alter table public.goals add column if not exists category text not null default 'other'
  check (category in ('career','health','skills','personal','finance','creative','other'));
alter table public.goals add column if not exists priority text not null default 'medium'
  check (priority in ('low','medium','high','critical'));
alter table public.goals add column if not exists target_date date;
alter table public.goals add column if not exists desired_outcome text;
alter table public.goals add column if not exists completed_at timestamptz;

create index if not exists idx_goals_priority on public.goals(user_id, priority);
create index if not exists idx_goals_category on public.goals(user_id, category);

-- Ensure owner CRUD policies exist (0001 creates them; belt-and-suspenders for
-- projects restored from partial states).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='goals' and policyname='goals_select_own') then
    create policy goals_select_own on public.goals for select to authenticated using (auth.uid() = user_id);
    create policy goals_insert_own on public.goals for insert to authenticated with check (auth.uid() = user_id);
    create policy goals_update_own on public.goals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy goals_delete_own on public.goals for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- =====================================================
-- Journey blueprints: curated personalized arcs users can instantiate
-- for any goal. Arbitrary journeys supported — blueprints are just seeds;
-- custom phase lists are accepted by the app action too.
-- =====================================================
create table if not exists public.journey_blueprints (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text,
  description text not null default '',
  phases jsonb not null, -- [{title, objective}]
  created_at timestamptz not null default now()
);

alter table public.journey_blueprints enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='journey_blueprints' and policyname='jb_select_authenticated') then
    create policy jb_select_authenticated on public.journey_blueprints for select to authenticated using (true);
  end if;
end $$;

insert into public.journey_blueprints (slug, name, category, description, phases) values
  ('programming', 'Programming', 'skills',
   'From fundamentals to engineering-grade software.',
   '[
     {"title":"Programming Foundations","objective":"Master syntax, data structures, and daily practice."},
     {"title":"Problem Solving","objective":"Sharpen algorithmic thinking with deliberate challenges."},
     {"title":"Building Projects","objective":"Ship real projects end to end."},
     {"title":"Software Engineering","objective":"Testing, architecture, collaboration, craft."}
   ]'::jsonb),
  ('fitness', 'Fitness', 'health',
   'From base habits to peak performance.',
   '[
     {"title":"Foundation","objective":"Move daily. Build the baseline."},
     {"title":"Consistency","objective":"Show up on schedule, every week."},
     {"title":"Strength","objective":"Progressive overload, measurable gains."},
     {"title":"Performance","objective":"Peak conditioning and skill."}
   ]'::jsonb),
  ('confidence', 'Confidence', 'personal',
   'From self-awareness to leading others.',
   '[
     {"title":"Self Awareness","objective":"Understand your patterns and triggers."},
     {"title":"Communication","objective":"Speak clearly, listen deeply."},
     {"title":"Social Confidence","objective":"Comfort in any room."},
     {"title":"Leadership","objective":"Take responsibility for others."}
   ]'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  phases = excluded.phases;

-- =====================================================
-- Goal auto-completion flows upward from real phase completions:
-- when the LAST incomplete phase of a goal flips to completed,
-- the goal closes. Hooked into award_phase_xp so it runs inside the
-- same secure definer path the app already uses.
-- =====================================================
create or replace function public.award_phase_xp(p_phase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_phase public.phases%rowtype;
  v_amount int;
  v_awarded int := 0;
  v_total bigint := 0;
  v_level int := 1;
  v_new_achievements jsonb := '[]'::jsonb;
  v_goal_completed boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_phase from public.phases where id = p_phase_id and user_id = v_user;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'phase_not_found');
  end if;

  v_amount := greatest(0, coalesce(v_phase.reward_xp, 0));

  begin
    insert into public.xp_transactions
      (user_id, amount, source, source_type, source_id, source_key, description)
    values
      (v_user, v_amount, 'phase_complete:' || v_phase.id::text, 'phase', v_phase.id,
       'phase:' || v_phase.id::text, 'Completed ' || v_phase.title);
    v_awarded := v_amount;
  exception when unique_violation then
    v_awarded := 0;
  end;

  -- Upward flow: quest -> milestone -> PHASE -> GOAL
  if v_phase.goal_id is not null then
    update public.goals g
    set status = 'completed',
        completed_at = now()
    where g.id = v_phase.goal_id
      and g.user_id = v_user
      and g.status <> 'completed'
      and not exists (
        select 1 from public.phases p
        where p.goal_id = g.id
          and p.user_id = v_user
          and p.status <> 'completed'
      );
    v_goal_completed := found;
  end if;

  select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);

  insert into public.user_levels (user_id, level, xp)
  values (v_user, v_level, v_total)
  on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

  v_new_achievements := public.evaluate_user_achievements(v_user);
  if jsonb_array_length(v_new_achievements) > 0 then
    select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
    v_level := public.level_from_xp(v_total);
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_awarded', v_awarded = 0,
    'xp_awarded', v_awarded,
    'xp_total', v_total,
    'level', v_level,
    'xp_to_next', greatest(0, public.xp_for_level(v_level + 1) - v_total),
    'goal_completed', v_goal_completed,
    'unlocked_achievements', v_new_achievements
  );
end;
$$;

revoke execute on function public.award_phase_xp(uuid) from anon;
grant execute on function public.award_phase_xp(uuid) to authenticated;
