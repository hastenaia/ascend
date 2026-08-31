-- Ascend 0022 — Shared AI memory + audit ledger (P2.0)
-- Builds on 0001..0021. Idempotent.
--
-- P2.0 introduces the reusable AI plumbing foundation for all future domains
-- (goals, phases, quests, habits, journal, learning, business, finance, market,
-- unified coach). It ships exactly TWO tables:
--
--   ai_memory — long-term AI memory. Stores ONLY concise, user-approved
--               summaries (never raw journal entries, transactions, passwords,
--               keys, or tokens). `approved` gates what the model may see;
--               `revoked` soft-deletes; hard delete is user-triggered.
--
--   ai_events  — append-only audit ledger. Records that an AI proposal was
--                generated / approved / applied / rejected, with sanitized
--                summaries only (no prompt content, no secrets).
--
-- Both are SELECT-only for owners. All writes flow through the SECURITY
-- DEFINER RPCs below (record_ai_event, save_ai_memory, revoke_ai_memory,
-- delete_ai_memory), which validate auth.uid() ownership. The AI model has NO
-- direct path to Supabase — it returns proposals; deterministic server code
-- persists them after user approval.

-- ------------------------------------------------
-- ai_memory
-- ------------------------------------------------
create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  summary text not null check (char_length(summary) between 1 and 1000),
  importance smallint not null default 1 check (importance between 1 and 5),
  source_ref jsonb not null default '{}'::jsonb,
  approved boolean not null default false,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_memory_user_kind on public.ai_memory(user_id, kind, created_at desc);

alter table public.ai_memory enable row level security;

-- Owner can read their own non-revoked notes only. Writes via RPC only.
drop policy if exists ai_memory_select_own on public.ai_memory;
create policy ai_memory_select_own on public.ai_memory
  for select to authenticated using (auth.uid() = user_id and revoked = false);

-- Owner sees their own (now including revoked) rows for the future
-- management page so they can undelete/revoke or hard-delete.
drop policy if exists ai_memory_select_own_all on public.ai_memory;
create policy ai_memory_select_own_all on public.ai_memory
  for select to authenticated using (auth.uid() = user_id and revoked = true);

-- ------------------------------------------------
-- ai_events (append-only audit ledger)
-- ------------------------------------------------
create table if not exists public.ai_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  action text not null check (action in ('proposed', 'approved', 'applied', 'rejected')),
  proposal jsonb not null default '{}'::jsonb,
  source_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_events_user on public.ai_events(user_id, created_at desc);

alter table public.ai_events enable row level security;

-- SELECT-only. No INSERT/UPDATE/DELETE policies exist: writes are RPC-only.
drop policy if exists ai_events_select_own on public.ai_events;
create policy ai_events_select_own on public.ai_events
  for select to authenticated using (auth.uid() = user_id);

-- =====================================================
-- record_ai_event: single write path for the audit ledger
-- Validates ownership; stores a sanitized proposal summary only.
-- =====================================================
create or replace function public.record_ai_event(
  p_kind text,
  p_action text,
  p_proposal jsonb default '{}'::jsonb,
  p_source_ref jsonb default '{}'::jsonb
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

  if p_action not in ('proposed', 'approved', 'applied', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  insert into public.ai_events (user_id, kind, action, proposal, source_ref)
  values (v_user, p_kind, p_action, coalesce(p_proposal, '{}'::jsonb), coalesce(p_source_ref, '{}'::jsonb))
  returning id into v_id;

  -- Bound stored payloads to keep the ledger lean and safe.
  update public.ai_events
     set proposal = jsonb_strip_nulls(
       (select jsonb_object_agg(k, case when jsonb_typeof(v) = 'string' then left(v #>> '{}', 500) else v end)
          from jsonb_each(proposal) as e(k, v))
     )
   where id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- =====================================================
-- save_ai_memory: upsert a concise summary owned by the caller
-- Idempotent when p_id is supplied. Validates size + ownership.
-- =====================================================
create or replace function public.save_ai_memory(
  p_kind text,
  p_summary text,
  p_importance smallint default 1,
  p_source_ref jsonb default '{}'::jsonb,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_summary text := trim(coalesce(p_summary, ''));
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if v_summary = '' or char_length(v_summary) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_summary');
  end if;

  if p_importance < 1 or p_importance > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_importance');
  end if;

  if p_id is not null then
    -- Update only if the row belongs to the caller.
    if not exists (select 1 from public.ai_memory where id = p_id and user_id = v_user) then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    update public.ai_memory
       set kind = p_kind,
           summary = v_summary,
           importance = p_importance,
           source_ref = coalesce(p_source_ref, '{}'::jsonb),
           updated_at = now()
     where id = p_id
     returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  insert into public.ai_memory (user_id, kind, summary, importance, source_ref, approved)
  values (v_user, p_kind, v_summary, p_importance, coalesce(p_source_ref, '{}'::jsonb), false)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- =====================================================
-- mark_ai_memory_approved: user approves a note for model use
-- =====================================================
create or replace function public.mark_ai_memory_approved(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.ai_memory where id = p_id and user_id = v_user and not revoked) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update public.ai_memory
     set approved = true, updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- =====================================================
-- revoke_ai_memory: soft-delete (stops being served to the model)
-- =====================================================
create or replace function public.revoke_ai_memory(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.ai_memory where id = p_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update public.ai_memory
     set revoked = true, approved = false, updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- =====================================================
-- delete_ai_memory: hard-delete (full erasure on user request)
-- =====================================================
create or replace function public.delete_ai_memory(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.ai_memory where id = p_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  delete from public.ai_memory where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- =====================================================
-- Grants — these functions are the ONLY write paths
-- =====================================================
grant execute on function public.record_ai_event(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.save_ai_memory(text, text, smallint, jsonb, uuid) to authenticated;
grant execute on function public.mark_ai_memory_approved(uuid) to authenticated;
grant execute on function public.revoke_ai_memory(uuid) to authenticated;
grant execute on function public.delete_ai_memory(uuid) to authenticated;
