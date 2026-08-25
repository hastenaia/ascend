-- Ascend Phase 4 — Quests + XP + Levels
-- Builds on 0001/0002. Additive, idempotent.

-- =====================================================
-- Level formula (SQL mirror of src/lib/levels.ts)
-- xp_for_level(L) = cumulative XP required to REACH level L
-- =====================================================
create or replace function public.xp_for_level(p_level int)
returns bigint
language sql
immutable
as $$
  select case when p_level <= 1 then 0 else round(25 * power(p_level - 1, 2.35))::bigint end
$$;

create or replace function public.level_from_xp(p_xp bigint)
returns int
language sql
immutable
as $$
  select greatest(1, least(200, coalesce((
    select max(l) from generate_series(1, 200) l where public.xp_for_level(l) <= p_xp
  ), 1)))
$$;

-- =====================================================
-- Extend quests to full spec
-- =====================================================
alter table public.quests add column if not exists category text not null default 'general'
  check (category in ('intellect','physical','discipline','reflection','craft','work','general'));
alter table public.quests add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy','medium','hard','challenge'));
alter table public.quests add column if not exists estimated_duration int
  check (estimated_duration is null or (estimated_duration between 5 and 480));
alter table public.quests add column if not exists due_date date;
alter table public.quests add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none','daily','weekly'));
alter table public.quests add column if not exists linked_skill uuid references public.skills(id) on delete set null;
alter table public.quests add column if not exists completed_at timestamptz;

-- Backfill: completed quests get completed_at; legacy is_recurring -> recurrence
update public.quests set completed_at = updated_at where status = 'completed' and completed_at is null;
update public.quests set recurrence = 'daily' where is_recurring = true and recurrence = 'none';

create index if not exists idx_quests_user_status on public.quests(user_id, status);
create index if not exists idx_quests_user_due on public.quests(user_id, due_date);
create index if not exists idx_quests_recurrence on public.quests(user_id, recurrence) where recurrence <> 'none';

drop trigger if exists trg_quests_updated on public.quests;
create trigger trg_quests_updated before update on public.quests for each row execute function public.handle_updated_at();

-- =====================================================
-- Harden xp_transactions: source_type/source_id/source_key
-- source_key gives DB-level duplicate/farming prevention via unique index
-- =====================================================
alter table public.xp_transactions add column if not exists source_type text
  check (source_type in ('quest','milestone','phase','bonus','adjustment'));
alter table public.xp_transactions add column if not exists source_id uuid;
alter table public.xp_transactions add column if not exists source_key text;

-- Backfill legacy rows
update public.xp_transactions set
  source_type = 'phase',
  source_key = source
where source_type is null and source like 'phase_complete:%';

update public.xp_transactions set
  source_type = case when quest_id is not null then 'quest' else 'bonus' end,
  source_id = quest_id
where source_type is null;

-- One XP award per user per logical source event (e.g. quest:<id> or quest:<id>:<day>)
create unique index if not exists uq_xp_source_key
  on public.xp_transactions(user_id, source_key)
  where source_key is not null;

create index if not exists idx_xp_source_type on public.xp_transactions(user_id, source_type);

-- =====================================================
-- user_levels snapshot (authoritative value derives from xp_transactions)
-- =====================================================
create table if not exists public.user_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  level int not null default 1 check (level >= 1 and level <= 200),
  xp bigint not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_levels_user on public.user_levels(user_id);

drop trigger if exists trg_user_levels_updated on public.user_levels;
create trigger trg_user_levels_updated before update on public.user_levels for each row execute function public.handle_updated_at();

alter table public.user_levels enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_levels' and policyname='ul_select_own') then
    create policy ul_select_own on public.user_levels for select to authenticated using (auth.uid() = user_id);
    create policy ul_insert_own on public.user_levels for insert to authenticated with check (auth.uid() = user_id);
    create policy ul_update_own on public.user_levels for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy ul_delete_own on public.user_levels for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- Initialize snapshots for existing users from their transaction history
insert into public.user_levels (user_id, level, xp)
select u.id,
       public.level_from_xp(coalesce(sum(x.amount), 0)),
       coalesce(sum(x.amount), 0)
from auth.users u
left join public.xp_transactions x on x.user_id = u.id
where not exists (select 1 from public.user_levels ul where ul.user_id = u.id)
group by u.id
on conflict (user_id) do nothing;

-- =====================================================
-- Atomic + secure quest completion RPC
-- Flow: validate user -> validate quest -> duplicate check ->
--       complete -> award XP -> update milestone -> momentum -> level snapshot
-- security definer bypasses RLS internally; every step re-checks ownership.
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
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Validate quest exists AND belongs to caller (row lock prevents races)
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
      'streak', (select streak from public.momentum where user_id = v_user and date = v_today limit 1)
    );
  end if;

  -- Period-scoped dedupe key: recurring quests award once per day/week
  v_period_key := case
    when v_quest.recurrence = 'daily' then 'quest:' || v_quest.id::text || ':' || to_char(v_today, 'YYYY-MM-DD')
    when v_quest.recurrence = 'weekly' then 'quest:' || v_quest.id::text || ':w' || to_char(v_today, 'IYYY-"W"IW')
    else 'quest:' || v_quest.id::text
  end;

  -- Mark one-time quests completed (recurring stay active)
  if v_quest.recurrence = 'none' then
    update public.quests set status = 'completed', completed_at = now() where id = v_quest.id;
  end if;

  -- Log the completion event
  insert into public.quest_completions (user_id, quest_id, xp_awarded)
  values (v_user, v_quest.id, v_quest.xp_reward);

  -- Award XP; unique index on (user_id, source_key) blocks repeat farming
  begin
    insert into public.xp_transactions (user_id, amount, source, source_type, source_id, source_key, description)
    values (v_user, v_quest.xp_reward, 'quest:' || v_quest.id::text, 'quest', v_quest.id, v_period_key, v_quest.title);
    v_xp_awarded := v_quest.xp_reward;
  exception when unique_violation then
    v_xp_awarded := 0; -- already awarded in this window
  end;

  -- Milestone auto-complete when all of its quests are done (never downgrades)
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

  -- Momentum: daily score by difficulty + streak continuation
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

  -- Level snapshot from lifetime XP (single source of truth)
  select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);
  v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);

  insert into public.user_levels (user_id, level, xp)
  values (v_user, v_level, v_total)
  on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'xp_awarded', v_xp_awarded,
    'xp_total', v_total,
    'level', v_level,
    'xp_to_next', v_next_needed,
    'milestone_updated', v_milestone_updated,
    'streak', v_new_streak
  );
end;
$$;

revoke execute on function public.complete_quest(uuid) from anon;
grant execute on function public.complete_quest(uuid) to authenticated;
