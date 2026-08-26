-- Ascend Phase 6 — Journey + Achievements
-- Builds on 0001–0005. Additive, idempotent.
--
-- Achievements are persisted server-side and triggered ONLY by real activity:
-- every unlock flows through evaluate_user_achievements(), called from the
-- same SECURITY DEFINER RPCs that record completions (complete_quest,
-- award_phase_xp). Clients get SELECT-only access — no faking progress.

-- =====================================================
-- Allow 'achievement' as an XP ledger source type
-- =====================================================
alter table public.xp_transactions drop constraint if exists xp_transactions_source_type_check;
alter table public.xp_transactions add constraint xp_transactions_source_type_check
  check (source_type in ('quest','milestone','phase','bonus','adjustment','achievement'));

-- =====================================================
-- Catalog + unlocks
-- =====================================================
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  flavor text not null default '',
  icon_key text not null default 'trophy',
  xp_reward int not null default 50 check (xp_reward >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists idx_user_achievements_user
  on public.user_achievements(user_id, unlocked_at desc);
create index if not exists idx_user_achievements_achievement
  on public.user_achievements(achievement_id);

alter table public.achievements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='achievements' and policyname='ach_select_authenticated') then
    create policy ach_select_authenticated on public.achievements for select to authenticated using (true);
  end if;
end $$;

-- Read-only for clients: unlocks are granted exclusively by the definer evaluator
alter table public.user_achievements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_achievements' and policyname='ua_select_own') then
    create policy ua_select_own on public.user_achievements for select to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- =====================================================
-- Align legacy achievements scaffold (pre-existing table with only
-- id/slug/name/description/created_at) to the Phase 6 schema.
-- add column if not exists fills existing rows via defaults; the unique
-- slug index is required by the ON CONFLICT upsert below.
-- =====================================================
alter table public.achievements add column if not exists flavor text not null default '';
alter table public.achievements add column if not exists icon_key text not null default 'trophy';
alter table public.achievements add column if not exists xp_reward int not null default 50;
alter table public.achievements add column if not exists sort_order int not null default 0;
create unique index if not exists achievements_slug_key on public.achievements(slug);

-- =====================================================
-- Seed catalog (exactly the six spec achievements)
-- =====================================================
insert into public.achievements (slug, name, description, flavor, icon_key, xp_reward, sort_order) values
  ('first-step',       'First Step',       'Complete your first quest.',            'Your journey has begun.',              'scroll-text',   50, 0),
  ('knowledge-seeker', 'Knowledge Seeker', 'Complete 10 learning quests.',          'Curiosity compounds.',                 'book-open',    100, 1),
  ('deep-thinker',     'Deep Thinker',     'Complete 20 focused sessions.',         'Depth beats breadth.',                 'brain',        150, 2),
  ('consistency',      'Consistency',      'Build strong momentum.',                'Seven suns, unbroken.',                'flame',        200, 3),
  ('phase-complete',   'Phase Complete',   'Complete your first phase.',            'One chapter closed. Onward.',          'flag',         250, 4),
  ('ascending',        'Ascending',        'Complete three phases.',                'You are becoming someone unrecognizable to your past self.', 'trending-up', 500, 5)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  flavor = excluded.flavor,
  icon_key = excluded.icon_key,
  xp_reward = excluded.xp_reward,
  sort_order = excluded.sort_order;

-- =====================================================
-- Secure evaluator — the ONLY writer of user_achievements
-- Returns the newly unlocked set (for client animation).
-- Idempotent: unique(user_id, achievement_id) + uq_xp_source_key.
-- =====================================================
create or replace function public.evaluate_user_achievements(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest_count int := 0;
  v_intellect_count int := 0;
  v_focus_count int := 0;
  v_best_streak int := 0;
  v_phases_done int := 0;
  v_total bigint := 0;
  v_level int := 1;
  v_unlocked jsonb := '[]'::jsonb;
  r record;
begin
  if p_user is null then
    return v_unlocked;
  end if;

  select count(*) into v_quest_count from public.quest_completions where user_id = p_user;

  select count(*) into v_intellect_count
  from public.quest_completions qc
  join public.quests q on q.id = qc.quest_id
  where qc.user_id = p_user and q.category = 'intellect';

  -- A "focused session" = any completed quest lasting >= 25 minutes
  select count(*) into v_focus_count
  from public.quest_completions qc
  join public.quests q on q.id = qc.quest_id
  where qc.user_id = p_user and coalesce(q.estimated_duration, 0) >= 25;

  select coalesce(max(streak), 0) into v_best_streak from public.momentum where user_id = p_user;

  select count(*) into v_phases_done from public.phases where user_id = p_user and status = 'completed';

  for r in
    select a.* from public.achievements a
    where not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p_user and ua.achievement_id = a.id
    )
    and case a.slug
      when 'first-step'       then v_quest_count >= 1
      when 'knowledge-seeker' then v_intellect_count >= 10
      when 'deep-thinker'     then v_focus_count >= 20
      when 'consistency'      then v_best_streak >= 7
      when 'phase-complete'   then v_phases_done >= 1
      when 'ascending'        then v_phases_done >= 3
      else false
    end
  loop
    insert into public.user_achievements (user_id, achievement_id)
    values (p_user, r.id)
    on conflict (user_id, achievement_id) do nothing;

    -- One XP payout per achievement ever (unique index blocks races/repeats)
    begin
      insert into public.xp_transactions
        (user_id, amount, source, source_type, source_id, source_key, description)
      values
        (p_user, r.xp_reward, 'achievement:' || r.slug, 'achievement', r.id,
         'achievement:' || r.slug, 'Achievement: ' || r.name);
    exception when unique_violation then
      null;
    end;

    v_unlocked := v_unlocked || jsonb_build_object(
      'slug', r.slug,
      'name', r.name,
      'description', r.description,
      'flavor', r.flavor,
      'xp_reward', r.xp_reward
    );
  end loop;

  -- Refresh level snapshot when new XP was granted
  if jsonb_array_length(v_unlocked) > 0 then
    select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = p_user;
    v_level := public.level_from_xp(v_total);
    insert into public.user_levels (user_id, level, xp)
    values (p_user, v_level, v_total)
    on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;
  end if;

  return v_unlocked;
end;
$$;

revoke execute on function public.evaluate_user_achievements(uuid) from anon;
grant execute on function public.evaluate_user_achievements(uuid) to authenticated;

-- =====================================================
-- Hook into complete_quest (v4): surface unlocks in response
-- =====================================================
create or replace function public.complete_quest(p_quest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_quest public.quests%rowtype;
  v_xp_awarded int := 0;
  v_already boolean := false;
  v_milestone_updated boolean := false;
  v_period_key text;
  v_score int;
  v_prev_streak int := 0;
  v_cur_streak int := 0;
  v_new_streak int := 1;
  v_today date := current_date;
  v_total bigint := 0;
  v_level int := 1;
  v_next_needed bigint := 0;
  v_new_achievements jsonb := '[]'::jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_quest from public.quests where id = p_quest_id and user_id = v_user for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'quest_not_found');
  end if;

  if v_quest.status = 'completed' or v_quest.status = 'archived' then
    if v_quest.status = 'archived' then
      return jsonb_build_object('ok', false, 'error', 'quest_archived');
    end if;
    v_already := true;
  end if;

  if v_already then
    select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
    return jsonb_build_object(
      'ok', true,
      'already_completed', true,
      'xp_awarded', 0,
      'xp_total', v_total,
      'level', public.level_from_xp(v_total),
      'xp_to_next', greatest(0, public.xp_for_level(public.level_from_xp(v_total) + 1) - v_total),
      'milestone_updated', false,
      'streak', (select streak from public.momentum where user_id = v_user and date = v_today limit 1),
      'unlocked_achievements', v_new_achievements
    );
  end if;

  v_period_key := case
    when v_quest.recurrence = 'daily' then 'quest:' || v_quest.id::text || ':' || to_char(v_today, 'YYYY-MM-DD')
    when v_quest.recurrence = 'weekly' then 'quest:' || v_quest.id::text || ':w' || to_char(v_today, 'IYYY-"W"IW')
    else 'quest:' || v_quest.id::text
  end;

  if v_quest.recurrence = 'none' then
    update public.quests set status = 'completed', completed_at = now() where id = v_quest.id;
  end if;

  insert into public.quest_completions (user_id, quest_id, xp_awarded)
  values (v_user, v_quest.id, v_quest.xp_reward);

  begin
    insert into public.xp_transactions (user_id, amount, source, source_type, source_id, source_key, description)
    values (v_user, v_quest.xp_reward, 'quest:' || v_quest.id::text, 'quest', v_quest.id, v_period_key, v_quest.title);
    v_xp_awarded := v_quest.xp_reward;
  exception when unique_violation then
    v_xp_awarded := 0;
  end;

  if v_quest.milestone_id is not null then
    update public.milestones m
    set status = 'completed'
    where m.id = v_quest.milestone_id
      and m.status <> 'completed'
      and exists (select 1 from public.quests q where q.milestone_id = m.id)
      and not exists (
        select 1 from public.quests q
        where q.milestone_id = m.id and q.status = 'active'
      );
    v_milestone_updated := found;
  end if;

  v_score := case v_quest.difficulty
    when 'easy' then 5 when 'hard' then 15 when 'challenge' then 25 else 10
  end;

  insert into public.momentum (user_id, date, score, streak)
  values (v_user, v_today, v_score, 0)
  on conflict (user_id, date) do update set score = public.momentum.score + excluded.score;

  select coalesce(streak, 0) into v_prev_streak from public.momentum where user_id = v_user and date = v_today - 1;
  select coalesce(streak, 0) into v_cur_streak from public.momentum where user_id = v_user and date = v_today;

  v_new_streak := greatest(v_cur_streak, case when v_prev_streak > 0 then v_prev_streak + 1 else 1 end);

  update public.momentum
  set streak = v_new_streak
  where user_id = v_user and date = v_today and streak < v_new_streak;

  -- Level snapshot from lifetime XP
  select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);
  v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);

  insert into public.user_levels (user_id, level, xp)
  values (v_user, v_level, v_total)
  on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

  -- Achievements triggered by this real activity (may grant bonus XP + bump level)
  v_new_achievements := public.evaluate_user_achievements(v_user);
  if jsonb_array_length(v_new_achievements) > 0 then
    select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
    v_level := public.level_from_xp(v_total);
    v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'xp_awarded', v_xp_awarded,
    'xp_total', v_total,
    'level', v_level,
    'xp_to_next', v_next_needed,
    'milestone_updated', v_milestone_updated,
    'streak', v_new_streak,
    'unlocked_achievements', v_new_achievements
  );
end;
$$;

revoke execute on function public.complete_quest(uuid) from anon;
grant execute on function public.complete_quest(uuid) to authenticated;

-- =====================================================
-- Hook into award_phase_xp (v2): PHASE_COMPLETE / ASCENDING triggers
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
    'unlocked_achievements', v_new_achievements
  );
end;
$$;

revoke execute on function public.award_phase_xp(uuid) from anon;
grant execute on function public.award_phase_xp(uuid) to authenticated;

-- =====================================================
-- Backfill: users who ALREADY meet criteria get their unlocks
-- (and XP) through the exact production code path.
-- =====================================================
do $$
declare
  u record;
begin
  for u in select id from auth.users
  loop
    perform public.evaluate_user_achievements(u.id);
  end loop;
end $$;
