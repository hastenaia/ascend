-- 0027_harden_coach_history.sql
-- Phase 4 — Harden coach_messages: client may only insert role='user', assistant via trusted RPC.
--
-- Before: 0026 allowed authenticated to INSERT role='assistant' directly (cm_insert_assistant),
-- letting a browser forge coaching history that later prompts trust.
--
-- After:
--   * DROP cm_insert_assistant (authenticated direct insert for assistant)
--   * KEEP cm_insert_user (authenticated may insert role='user' only)
--   * CREATE FUNCTION append_coach_assistant_message(p_content text) SECURITY DEFINER
--     that inserts role='assistant' for auth.uid(). Server (Next route + Edge) route
--     assistant inserts through this RPC. Browser can still call RPC, but direct
--     table forgery is blocked and the RPC is auditable/rate-limitable.
--   * FORCE RLS already enabled on coach_messages in 0026; re-assert.

-- 1) Remove the permissive assistant insert policy for authenticated
drop policy if exists cm_insert_assistant on public.coach_messages;
drop policy if exists cm_insert_own on public.coach_messages; -- legacy name

-- Re-assert that only role='user' is insertable directly by the client
drop policy if exists cm_insert_user on public.coach_messages;
create policy cm_insert_user on public.coach_messages
  for insert to authenticated with check (auth.uid() = user_id and role = 'user');

-- Ensure other policies remain (select/delete)
-- (re-assert idempotently; 0026 already did, but keep for standalone safety)
drop policy if exists cm_select_own on public.coach_messages;
create policy cm_select_own on public.coach_messages
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists cm_delete_own on public.coach_messages;
create policy cm_delete_own on public.coach_messages
  for delete to authenticated using (auth.uid() = user_id);

-- 2) Trusted RPC for assistant inserts
create or replace function public.append_coach_assistant_message(p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trimmed text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_trimmed := left(trim(coalesce(p_content, '')), 6000);
  if char_length(v_trimmed) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty_content');
  end if;

  -- Enforce reasonable bounds (mirrors history.ts MAX_CONTENT = 6000)
  if char_length(v_trimmed) > 6000 then
    v_trimmed := left(v_trimmed, 6000);
  end if;

  insert into public.coach_messages (user_id, role, content)
  values (v_user, 'assistant', v_trimmed);

  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke execute on function public.append_coach_assistant_message(text) from public, anon;
grant execute on function public.append_coach_assistant_message(text) to authenticated;

-- 3) Re-force RLS (idempotent)
alter table public.coach_messages enable row level security;
alter table public.coach_messages force row level security;
