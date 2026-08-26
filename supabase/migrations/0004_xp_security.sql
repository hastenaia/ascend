-- Ascend Phase 4 (hardening) — Server-side-only XP integrity
-- Builds on 0003. Additive + idempotent.
--
-- Problem: 0001 granted authenticated users INSERT/UPDATE/DELETE on
-- xp_transactions, quest_completions and momentum. Any signed-in client could
-- mint arbitrary XP, fake completions, or inflate streaks straight through
-- PostgREST, bypassing complete_quest entirely.
--
-- Fix: those tables become read-only for clients. Every write now flows through
-- SECURITY DEFINER functions (complete_quest from 0003, award_phase_xp below).

-- =====================================================
-- Lock down the XP ledger: SELECT-only for owners
-- =====================================================
drop policy if exists xp_insert_own on public.xp_transactions;
drop policy if exists xp_update_own on public.xp_transactions;
drop policy if exists xp_delete_own on public.xp_transactions;

-- Completion log feeds dashboard counts — read-only for clients
drop policy if exists qc_insert_own on public.quest_completions;
drop policy if exists qc_update_own on public.quest_completions;
drop policy if exists qc_delete_own on public.quest_completions;

-- Momentum score/streak are derived server-side in complete_quest
drop policy if exists momentum_insert_own on public.momentum;
drop policy if exists momentum_update_own on public.momentum;
drop policy if exists momentum_delete_own on public.momentum;

-- =====================================================
-- Secure phase-completion XP (mirrors complete_quest guarantees)
-- Idempotent: unique index uq_xp_source_key on (user_id, source_key)
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
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Validate phase exists AND belongs to caller
  select * into v_phase from public.phases where id = p_phase_id and user_id = v_user;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'phase_not_found');
  end if;

  v_amount := greatest(0, coalesce(v_phase.reward_xp, 0));

  -- One payout per phase ever (unique index blocks races + repeat farming)
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

  -- Level snapshot from lifetime XP (single source of truth)
  select coalesce(sum(amount), 0) into v_total from public.xp_transactions where user_id = v_user;
  v_level := public.level_from_xp(v_total);

  insert into public.user_levels (user_id, level, xp)
  values (v_user, v_level, v_total)
  on conflict (user_id) do update set level = excluded.level, xp = excluded.xp;

  return jsonb_build_object(
    'ok', true,
    'already_awarded', v_awarded = 0,
    'xp_awarded', v_awarded,
    'xp_total', v_total,
    'level', v_level,
    'xp_to_next', greatest(0, public.xp_for_level(v_level + 1) - v_total)
  );
end;
$$;

revoke execute on function public.award_phase_xp(uuid) from anon;
grant execute on function public.award_phase_xp(uuid) to authenticated;
