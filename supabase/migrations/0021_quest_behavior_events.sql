-- Ascend 0021 — Quest behavior event ledger (P1)
-- Builds on 0001..0020. Idempotent.
--
-- The quest counters (postponed_count / last_postponed_at / skipped_count /
-- last_skipped_at) record only the LATEST state. P1 needs event history to:
--   * attribute postpones/skips/adapts to a specific week (weekly review)
--   * measure average postpone delay (meta.days)
--   * preserve why/when a quest was rescaled (adaptation history)
--
-- quest_behavior_events is SELECT-only for owners. All writes flow through the
-- SECURITY DEFINER RPC record_quest_behavior, which validates ownership and
-- keeps counters + events in sync in one transaction.

create table if not exists public.quest_behavior_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  kind text not null check (kind in ('postpone', 'skip', 'adapt', 'evidence')),
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_qbe_user_occurred on public.quest_behavior_events(user_id, occurred_at desc);
create index if not exists idx_qbe_user_quest on public.quest_behavior_events(user_id, quest_id, occurred_at desc);

alter table public.quest_behavior_events enable row level security;

drop policy if exists qbe_select_own on public.quest_behavior_events;
create policy qbe_select_own on public.quest_behavior_events
  for select to authenticated using (auth.uid() = user_id);

-- =====================================================
-- record_quest_behavior: single write path for behavior events
-- Validates ownership, syncs counters, appends history atomically.
-- =====================================================
create or replace function public.record_quest_behavior(
  p_quest_id uuid,
  p_kind text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_kind not in ('postpone', 'skip', 'adapt', 'evidence') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  -- Validate quest exists AND belongs to caller
  if not exists (
    select 1 from public.quests where id = p_quest_id and user_id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'quest_not_found');
  end if;

  -- Keep the counters in sync with the ledger (single transaction).
  -- Only the plan date logic (one-time postpone) is left to the server action.
  if p_kind = 'postpone' then
    update public.quests
       set postponed_count = postponed_count + 1,
           last_postponed_at = now()
     where id = p_quest_id;
  elsif p_kind = 'skip' then
    update public.quests
       set skipped_count = skipped_count + 1,
           last_skipped_at = now()
     where id = p_quest_id;
  end if;

  insert into public.quest_behavior_events (user_id, quest_id, kind, meta)
  values (v_user, p_quest_id, p_kind, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

grant execute on function public.record_quest_behavior(uuid, text, jsonb) to authenticated;