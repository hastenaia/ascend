-- Ascend Phase 9 — AI Coach conversation history
-- Builds on 0001–0008. Additive, idempotent.
--
-- The chat route (server-only) persists both sides of the conversation so the
-- coach keeps context across sessions. Users may read/clear their own history;
-- assistant messages are written by the route under the caller's identity.

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 6000),
  created_at timestamptz not null default now()
);

create index if not exists idx_coach_messages_user_created
  on public.coach_messages(user_id, created_at desc);

alter table public.coach_messages enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coach_messages' and policyname='cm_select_own') then
    create policy cm_select_own on public.coach_messages for select to authenticated using (auth.uid() = user_id);
    create policy cm_insert_own on public.coach_messages for insert to authenticated with check (auth.uid() = user_id);
    create policy cm_delete_own on public.coach_messages for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;
