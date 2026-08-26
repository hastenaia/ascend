-- Ascend Phase 8 — Momentum + Recovery + Structured Reflections
-- Builds on 0001–0007. Additive, idempotent.

-- =====================================================
-- Recovery support on the daily activity ledger
-- recovery_kinds tracks which wellness actions were logged that day
-- ('rest' | 'light' | 'reflection' | 'planning')
-- =====================================================
alter table public.momentum add column if not exists recovery boolean not null default false;
alter table public.momentum add column if not exists recovery_kinds text[] not null default '{}';

-- =====================================================
-- Structured phase reflections: the four questions asked at completion.
-- `body` stays the canonical joined text so existing readers keep working.
-- =====================================================
alter table public.reflections add column if not exists learnings text;
alter table public.reflections add column if not exists worked text;
alter table public.reflections add column if not exists didnt_work text;
alter table public.reflections add column if not exists change_plan text;

-- =====================================================
-- log_recovery(kind): sustainable-consistency credit for rest, lighter
-- days, reflection, and planning. Server-authoritative (definer) because
-- client writes to momentum were revoked in 0004.
-- One ledger row per day (unique); kinds accumulate across the day.
-- =====================================================
create or replace function public.log_recovery(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := current_date;
  v_kind text;
  v_row public.momentum%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_kind := lower(btrim(coalesce(p_kind, '')));
  if v_kind not in ('rest','light','reflection','planning') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  -- Gentle credit: a fresh recovery day starts small; stacking kinds adds a little
  insert into public.momentum (user_id, date, score, streak, recovery, recovery_kinds)
  values (v_user, v_today, 6, 0, true, array[v_kind])
  on conflict (user_id, date) do update set
    score = public.momentum.score + 2,
    recovery = true,
    recovery_kinds = case
      when v_kind = any(public.momentum.recovery_kinds) then public.momentum.recovery_kinds
      else public.momentum.recovery_kinds || v_kind
    end
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'date', v_today,
    'recovery_kinds', to_jsonb(v_row.recovery_kinds),
    'score', v_row.score
  );
end;
$$;

revoke execute on function public.log_recovery(text) from anon;
grant execute on function public.log_recovery(text) to authenticated;

-- =====================================================
-- complete_quest v5: preserve recovery metadata when quest days upsert
-- (existing conflict branch only touched score before — keep flags intact
-- explicitly now that columns exist).
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

  -- Recovery metadata preserved on conflict (a quest on top of a rest day
  -- keeps its wellness credit — sustainable consistency, not punishment).
  insert into public.momentum (user_id, date, score, streak)
  values (v_user, v_today, v_score, 0)
  on conflict (user_id, date) do update set score = public.momentum.score + excluded.score;

  select coalesce(streak, 0) into v_prev_streak from public.momentum where user_id = v_user and date = v_today - 1;
  select coalesce(streak, 0) into v_cur_streak from public.momentum where user_id = v_user and date = v_today;

  v_new_streak := greatest(v_cur_streak, case when v_prev_streak > 0 then v_prev_streak + 1 else 1 end);

  update public.momentum
  set streak = v_new_streak
  where user_id = v_user and date = v_today and streak < v_new_streak;

  select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);
  v_next_needed := greatest(0, public.xp_for_level(v_level + 1) - v_total);

  insert into public.user_levels (user_id, level, xp)
  values (v_user, v_level, v_total)
  on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

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
