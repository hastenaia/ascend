-- Ascend FIX — restore stat/skill granting inside complete_quest
-- Root cause: 0006 rebuilt complete_quest from the pre-Phase-5 body to add
-- achievements and silently dropped the Phase 5 stat/skill blocks; 0008
-- carried that regression forward. Quest completions since the 0006 cutover
-- awarded XP/levels/momentum/achievements but wrote nothing to stat_history,
-- skill_xp_log, or the user_stats/user_skills snapshots.
--
-- This migration:
--   1. Recreates complete_quest as the CURRENT live behavior (recovery-safe
--      momentum upsert, achievements, unlocked_achievements payload) WITH the
--      Phase 5 stat/skill grants restored verbatim (source-keyed, idempotent).
--   2. Backfills every missed completion into the ledgers using the same
--      unique source keys -> zero double-counting by construction.
--   3. Rebuilds snapshots from the ledgers (authoritative).
--
-- No schema changes. Idempotent end-to-end.

-- =====================================================
-- Backfill part A: category-weighted stat journal rows
-- (weights mirror CATEGORY_STAT_WEIGHTS in src/lib/stats.ts)
-- =====================================================
with txs as (
  select x.id tx_id, x.user_id, x.amount, x.source_key, x.description,
         coalesce(q.category, 'general') cat
  from public.xp_transactions x
  join public.quests q on q.id = x.quest_id
  where x.source_type = 'quest'
),
weights(cat, stat_slug, weight) as (values
  ('physical','physical',1.00),
  ('discipline','discipline',0.70),('discipline','mental',0.30),
  ('reflection','mental',0.70),('reflection','emotional-intelligence',0.30),
  ('intellect','intellect',0.60),('intellect','knowledge',0.40),
  ('craft','knowledge',0.50),('craft','career',0.30),('craft','mental',0.20),
  ('work','career',0.60),('work','discipline',0.40),
  ('general','social',0.40),('general','emotional-intelligence',0.35),('general','mental',0.25)
),
points as (
  select t.user_id, s.id stat_id, round(t.amount * w.weight)::int delta,
         t.tx_id, t.description, t.source_key || ':stat:' || s.slug sk
  from txs t join weights w on w.cat = t.cat join public.stats s on s.slug = w.stat_slug
  where round(t.amount * w.weight) > 0
)
insert into public.stat_history (user_id, stat_id, delta, source_type, source_id, description, source_key)
select user_id, stat_id, delta, 'quest', tx_id, left(coalesce(description, ''), 120), sk
from points p
where not exists (select 1 from public.stat_history h where h.user_id = p.user_id and h.source_key = p.sk);

-- Backfill part B: linked skills (leaf full XP, parent branch half)
with txs as (
  select x.user_id, x.amount, x.source_key, x.id tx_id, q.linked_skill
  from public.xp_transactions x
  join public.quests q on q.id = x.quest_id
  where x.source_type = 'quest' and q.linked_skill is not null
),
targets as (
  select user_id, linked_skill skill_id, amount delta, source_key || ':skill:self' sk, tx_id from txs
  union all
  select t.user_id, p.id, ceil(t.amount * 0.5)::int, t.source_key || ':skill:parent' sk, t.tx_id
  from txs t
  join public.skills leaf on leaf.id = t.linked_skill
  join public.skills p on p.id = leaf.parent_id
  where ceil(t.amount * 0.5) > 0
)
insert into public.skill_xp_log (user_id, skill_id, delta, source_type, source_key)
select user_id, skill_id, delta, 'quest', sk
from targets
where not exists (select 1 from public.skill_xp_log l where l.user_id = targets.user_id and l.skill_id = targets.skill_id and l.source_key = targets.sk);

-- Snapshots = ledger sums (authoritative)
insert into public.user_stats (user_id, stat_id, value)
select h.user_id, h.stat_id, sum(h.delta)::numeric
from public.stat_history h group by h.user_id, h.stat_id
on conflict (user_id, stat_id) do update set value = excluded.value, updated_at = now();

insert into public.user_skills (user_id, skill_id, xp)
select l.user_id, l.skill_id, sum(l.delta)::int
from public.skill_xp_log l group by l.user_id, l.skill_id
on conflict (user_id, skill_id) do update set xp = excluded.xp, updated_at = now();

-- =====================================================
-- complete_quest v6 — live behavior + RESTORED stat/skill grants
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
  r record;
  v_pts int;
  v_parent uuid;
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

  ---------------------------------------------------------------
  -- RESTORED (Phase 5): stats + skills — only when XP was earned.
  -- Source-keyed journal rows make repeats impossible to double-count.
  ---------------------------------------------------------------
  if v_xp_awarded > 0 then
    -- Stats: weighted journal rows, snapshot recomputed per touched stat
    for r in
      select w.stat_slug, w.weight
      from (values
        ('physical','physical',1.00),
        ('discipline','discipline',0.70),('discipline','mental',0.30),
        ('reflection','mental',0.70),('reflection','emotional-intelligence',0.30),
        ('intellect','intellect',0.60),('intellect','knowledge',0.40),
        ('craft','knowledge',0.50),('craft','career',0.30),('craft','mental',0.20),
        ('work','career',0.60),('work','discipline',0.40),
        ('general','social',0.40),('general','emotional-intelligence',0.35),('general','mental',0.25)
      ) as w(cat, stat_slug, weight)
      where w.cat = v_quest.category
    loop
      v_pts := round(v_xp_awarded * r.weight);
      if v_pts > 0 then
        insert into public.stat_history (user_id, stat_id, delta, source_type, source_id, description, source_key)
        select v_user, s.id, v_pts, 'quest', v_quest.id, left(v_quest.title, 120), v_period_key || ':stat:' || s.slug
        from public.stats s where s.slug = r.stat_slug
        on conflict do nothing;

        insert into public.user_stats (user_id, stat_id, value)
        select v_user, s.id,
          (select coalesce(sum(h.delta), 0)::numeric from public.stat_history h where h.user_id = v_user and h.stat_id = s.id)
        from public.stats s where s.slug = r.stat_slug
        on conflict (user_id, stat_id) do update set value = excluded.value, updated_at = now();
      end if;
    end loop;

    -- Linked skill: full XP to leaf, half to parent branch (journal + snapshot)
    if v_quest.linked_skill is not null and exists (select 1 from public.skills k where k.id = v_quest.linked_skill) then
      insert into public.skill_xp_log (user_id, skill_id, delta, source_type, source_key)
      values (v_user, v_quest.linked_skill, v_xp_awarded, 'quest', v_period_key || ':skill:self')
      on conflict do nothing;

      select parent_id into v_parent from public.skills where id = v_quest.linked_skill;
      if v_parent is not null then
        insert into public.skill_xp_log (user_id, skill_id, delta, source_type, source_key)
        values (v_user, v_parent, ceil(v_xp_awarded * 0.5)::int, 'quest', v_period_key || ':skill:parent')
        on conflict do nothing;
      end if;

      insert into public.user_skills (user_id, skill_id, xp)
      select l.user_id, l.skill_id, l.v from
        (select skill_id, sum(delta)::int v from public.skill_xp_log
         where user_id = v_user and skill_id in (v_quest.linked_skill, coalesce(v_parent, v_quest.linked_skill))
         group by skill_id) l
      on conflict (user_id, skill_id) do update set xp = excluded.xp, updated_at = now();
    end if;
  end if;

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
