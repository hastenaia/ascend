-- 0023_goal_intelligence.sql
-- P2.1 Stage 3: secure apply-path for an approved goal decomposition proposal.
--
-- Adds ONE SECURITY DEFINER RPC, `public.apply_decomposition_goal(...)`, that
-- atomically creates phases + milestones + quests from a fully validated
-- payload. It is the ONLY write path for applying a decomposition; the server
-- action (`applyGoalDecompositionAction`) re-validates the proposal before
-- calling it, and this function re-enforces every invariant itself so that a
-- direct RPC call with a forged payload is still safe.
--
-- Security model (mirrors 0022_ai_memory.sql):
--   * caller MUST be an authenticated, owned goal (`auth.uid()` = goals.user_id)
--   * every created row is pinned to `auth.uid()` (no cross-user insertion)
--   * `search_path = public` only; SECURITY DEFINER but never trusts the caller
--   * no existing phases/milestones/quests are ever deleted or reprioritized,
--     and goal status is never changed
--   * duplicate protection: a goal that already has ANY phase is rejected
--       (a goal can only ever be decomposed once, matching createGoalJourneyAction)
--
-- Atomicity:
--   * the ENTIRE payload is validated BEFORE the first write, so any invalid
--     part returns an error with zero row changes
--   * a constraint failure during insertion propagates as an exception, which
--     rolls back the whole RPC call (plpgsql function = single statement)
--
-- XP derivation: quest xp_reward is derived deterministically from the
-- validated difficulty, never accepted from the caller, so an invalid
-- "xp / difficulty" combination cannot be expressed in the payload.

-- Optional but cheap: support parallel/retry dedupe and help Postgres picking
-- indexes for ownership checks. It is strictly additive.
create index if not exists idx_phases_goal_user on public.phases(goal_id, user_id);

create or replace function public.apply_decomposition_goal(
  p_goal_id uuid,
  p_phases jsonb,
  p_quests jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_goal public.goals%rowtype;
  v_phase_id uuid;
  v_new_id uuid;
  v_phase jsonb;
  v_milestone jsonb;
  v_quest jsonb;
  v_title text;
  v_obj text;
  v_diff text;
  v_phase_order int := 0;
  v_order int := 0;
  v_xp int := 0;
  v_total_milestones int := 0;
  v_quests_count int := 0;
  v_phases_count int := 0;
  v_milestones_count int := 0;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_goal_id is null then
    return jsonb_build_object('ok', false, 'error', 'goal_not_found');
  end if;

  -- Ownership + eligibility, with a row lock so two concurrent applications
  -- cannot both pass the duplicate check.
  select * into v_goal
  from public.goals
  where id = p_goal_id and user_id = v_user
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'goal_not_found');
  end if;

  if v_goal.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'goal_not_eligible');
  end if;

  if exists (
    select 1 from public.phases where goal_id = p_goal_id and user_id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'goal_already_decomposed');
  end if;

  ----------------------------------------------------------------
  -- 1) Validate the ENTIRE payload before any write (atomic reject).
  ----------------------------------------------------------------
  if p_phases is null or jsonb_typeof(p_phases) <> 'array'
     or p_quests is null or jsonb_typeof(p_quests) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;
  if jsonb_array_length(p_phases) < 1 or jsonb_array_length(p_phases) > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phase_count');
  end if;
  if jsonb_array_length(p_quests) > 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_quest_count');
  end if;

  for v_phase in select * from jsonb_array_elements(p_phases) loop
    v_title := nullif(trim(coalesce(v_phase->>'title', '')), '');
    if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 120 then
      return jsonb_build_object('ok', false, 'error', 'invalid_phase_title');
    end if;
    v_obj := coalesce(v_phase->>'objective', '');
    if char_length(v_obj) > 300 then
      return jsonb_build_object('ok', false, 'error', 'phase_objective_too_long');
    end if;

    if v_phase ? 'milestones' then
      if jsonb_typeof(v_phase->'milestones') <> 'array' then
        return jsonb_build_object('ok', false, 'error', 'invalid_milestones');
      end if;
      if jsonb_array_length(v_phase->'milestones') > 4 then
        return jsonb_build_object('ok', false, 'error', 'invalid_milestone_count');
      end if;
      v_total_milestones := v_total_milestones + jsonb_array_length(v_phase->'milestones');
      for v_milestone in select * from jsonb_array_elements(v_phase->'milestones') loop
        v_title := nullif(trim(coalesce(v_milestone->>'title', '')), '');
        if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 120 then
          return jsonb_build_object('ok', false, 'error', 'invalid_milestone_title');
        end if;
      end loop;
    end if;
  end loop;

  if v_total_milestones = 0 and jsonb_array_length(p_quests) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_decomposition');
  end if;

  for v_quest in select * from jsonb_array_elements(p_quests) loop
    v_title := nullif(trim(coalesce(v_quest->>'title', '')), '');
    if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 150 then
      return jsonb_build_object('ok', false, 'error', 'invalid_quest_title');
    end if;
    if coalesce(v_quest->>'category', '') not in
       ('intellect', 'physical', 'discipline', 'reflection', 'craft', 'work', 'general') then
      return jsonb_build_object('ok', false, 'error', 'invalid_quest_category');
    end if;
    if coalesce(v_quest->>'difficulty', '') not in ('easy', 'medium', 'hard', 'challenge') then
      return jsonb_build_object('ok', false, 'error', 'invalid_quest_difficulty');
    end if;
    if char_length(coalesce(v_quest->>'description', '')) > 500 then
      return jsonb_build_object('ok', false, 'error', 'quest_description_too_long');
    end if;
  end loop;

  ----------------------------------------------------------------
  -- 2) Insert phases + their milestones.
  ----------------------------------------------------------------
  v_phase_order := 0;
  for v_phase in select * from jsonb_array_elements(p_phases) loop
    v_phase_order := v_phase_order + 1;
    v_title := trim(v_phase->>'title');
    v_obj := coalesce(v_phase->>'objective', '');

    insert into public.phases
      (user_id, goal_id, title, objective, status, order_index, phase_number,
       start_date, reward_xp, focus_areas, completion_requirements, final_challenge)
    values
      (v_user, p_goal_id, v_title, nullif(v_obj, ''),
       case when v_phase_order = 1 then 'active' else 'locked' end,
       v_phase_order, v_phase_order,
       case when v_phase_order = 1 then current_date else null end,
       100, '[]'::jsonb, '[]'::jsonb, null)
    returning id into v_phase_id;
    v_phases_count := v_phases_count + 1;

    -- Core milestones: proposed milestone titles, or a default core-work one.
    v_order := 0;
    if v_phase ? 'milestones'
       and jsonb_typeof(v_phase->'milestones') = 'array'
       and jsonb_array_length(v_phase->'milestones') > 0 then
      for v_milestone in select * from jsonb_array_elements(v_phase->'milestones') loop
        insert into public.milestones
          (phase_id, title, description, sort_order, status, xp_reward, is_final_challenge)
        values
          (v_phase_id, trim(v_milestone->>'title'), null, v_order, 'pending', 40, false)
        returning id into v_new_id;
        v_milestones_count := v_milestones_count + 1;
        v_order := v_order + 1;
      end loop;
    else
      insert into public.milestones
        (phase_id, title, description, sort_order, status, xp_reward, is_final_challenge)
      values
        (v_phase_id, left(v_title, 109) || ': core work', nullif(v_obj, ''),
         v_order, 'pending', 40, false)
      returning id into v_new_id;
      v_milestones_count := v_milestones_count + 1;
      v_order := v_order + 1;
    end if;

    -- Final challenge milestone (kept < 120 chars even for long phase titles).
    insert into public.milestones
      (phase_id, title, description, sort_order, status, xp_reward, is_final_challenge)
    values
      (v_phase_id, left(v_title, 110) || ' Challenge',
       'Prove mastery of ' || lower(v_title) || ' before moving on.',
       v_order, 'pending', 150, true)
    returning id into v_new_id;
    v_milestones_count := v_milestones_count + 1;
  end loop;

  ----------------------------------------------------------------
  -- 3) Insert quests (standalone; XP derived from validated difficulty).
  ----------------------------------------------------------------
  v_order := 0;
  for v_quest in select * from jsonb_array_elements(p_quests) loop
    v_diff := v_quest->>'difficulty';
    v_xp := case v_diff
      when 'easy' then 10
      when 'medium' then 25
      when 'hard' then 50
      when 'challenge' then 100
      else 25
    end;

    insert into public.quests
      (user_id, phase_id, milestone_id, title, description, xp_reward, sort_order,
       status, category, difficulty, recurrence)
    values
      (v_user, null, null, trim(v_quest->>'title'),
       nullif(trim(coalesce(v_quest->>'description', '')), ''),
       v_xp, v_order, 'active', v_quest->>'category', v_diff, 'none')
    returning id into v_new_id;
    v_quests_count := v_quests_count + 1;
    v_order := v_order + 1;
  end loop;

  ----------------------------------------------------------------
  -- 4) Done.
  ----------------------------------------------------------------
  return jsonb_build_object(
    'ok', true,
    'phases_created', v_phases_count,
    'milestones_created', v_milestones_count,
    'quests_created', v_quests_count
  );
end;
$$;

revoke execute on function public.apply_decomposition_goal(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.apply_decomposition_goal(uuid, jsonb, jsonb) to authenticated;