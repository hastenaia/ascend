-- =============================================================================
-- Ascend ACCOUNT ISOLATION (Privacy Wall) — Layer A (database-enforced)
-- Project: fpspwpmxlnfsegcwqeir
--
-- Symptom: cross-account data leak — a user on one account can observe quests
-- and other data belonging to another account. The migrations 0001..0025 already
-- define owner-scoped RLS policies on every user-owned table, yet the leak
-- persists, indicating the LIVE database is not enforcing RLS.
--
-- Root cause: on the live project, one or more of these are true:
--   1) ROW LEVEL SECURITY is enabled but NOT FORCED, so a table owner (or a
--      role that owns the tables, e.g. the postgres/service role backing the
--      client-visible connection) bypasses RLS without extra privileges.
--   2) Permissive policies were added (e.g. a broad SELECT ... using(true))
--      that OR-in with the owner policies, defeating isolation.
--   3) Some RLS/policy migrations were never applied to the live DB (migrations
--      are applied manually via the SQL Editor, so it is easy to miss one).
--
-- This script is IDEMPOTENT and SAFE to re-run. It does NOT delete any policy
-- that is already owner-scoped; it only:
--   * FORCE ROW LEVEL SECURITY (blocks the table-owner bypass) on every
--     user-owned table.
--   * Re-assert the owner-scoped SELECT policy (and the direct-write owner
--     policies where the app writes through the client) on those tables.
--   * Drop a fixed list of known-permissive SELECT policies on user-owned
--     tables.
--   * Leaves the global catalogs (phase_templates, skills, stats,
--     achievements, journey_blueprints) readable by authenticated users — they
--     are NOT user-owned and must stay shareable.
--
-- Apply via: Supabase Dashboard -> SQL Editor -> paste & run (Cmd+Enter).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Owner-scoped policy helper (idempotent). `p_policy` is the full
--    "for <cmd> to authenticated using/with check" SQL fragment an app could
--    legitimately need for a user-owned table. The helper drops first so
--    re-runs are clean.
-- ---------------------------------------------------------------------------
create or replace function public._aiso_pol(
  p_table text,
  p_name text,
  p_sql  text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  execute format('create policy %I on public.%I %s', p_name, p_table, p_sql);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) CRUD tables: the app writes AND reads via the client, so they need the
--    full owner-scoped SELECT/INSERT/UPDATE/DELETE set.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    -- (table, prefix, owner_expr)
    ('profiles',             'profiles', 'auth.uid() = id'),
    ('goals',                'goals',    'auth.uid() = user_id'),
    ('phases',               'phases',   'auth.uid() = user_id'),
    ('quests',               'quests',   'auth.uid() = user_id'),
    ('quest_completions',    'qc',       'auth.uid() = user_id'),
    ('momentum',             'momentum', 'auth.uid() = user_id'),
    ('reflections',          'reflections', 'auth.uid() = user_id'),
    ('experiments',          'experiments', 'auth.uid() = user_id'),
    ('experiment_entries',   'ee',       'auth.uid() = user_id'),
    ('boss_challenges',      'boss',     'auth.uid() = user_id'),
    ('boss_hits',            'bhit',     'auth.uid() = user_id')
  ) as v(t, p, e)
  loop
    execute format('alter table public.%I enable row level security', r.t);
    execute format('alter table public.%I force row level security', r.t);

    perform public._aiso_pol(r.t, r.p || '_select_own', format('for select to authenticated using (%s)', r.e));
    perform public._aiso_pol(r.t, r.p || '_insert_own', format('for insert to authenticated with check (%s)', r.e));
    perform public._aiso_pol(r.t, r.p || '_update_own', format('for update to authenticated using (%s) with check (%s)', r.e, r.e));
    perform public._aiso_pol(r.t, r.p || '_delete_own', format('for delete to authenticated using (%s)', r.e));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) SELECT-only tables: server-derived snapshots / ledgers / audit where all
--    writes flow through SECURITY DEFINER RPCs. Owners may only SELECT their
--    own rows (no direct INSERT/UPDATE/DELETE policies).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    -- (table, prefix, owner_expr)
    ('user_skills',          'us',  'auth.uid() = user_id'),
    ('user_stats',           'ust', 'auth.uid() = user_id'),
    ('user_levels',          'ul',  'auth.uid() = user_id'),
    ('xp_transactions',      'xp',  'auth.uid() = user_id'),
    ('user_achievements',    'ua',  'auth.uid() = user_id'),
    ('stat_history',         'sh',  'auth.uid() = user_id'),
    ('skill_xp_log',         'sxl', 'auth.uid() = user_id'),
    ('quest_behavior_events','qbe', 'auth.uid() = user_id'),
    ('ai_memory',            'ai_memory', 'auth.uid() = user_id'),
    ('ai_events',            'ai_events', 'auth.uid() = user_id')
  ) as v(t, p, e)
  loop
    execute format('alter table public.%I enable row level security', r.t);
    execute format('alter table public.%I force row level security', r.t);
    -- Assert owner SELECT; explicitly drop any stray client-write policies that
    -- 0001/0003 originally granted (restored as SELECT-only in 0018) so nothing
    -- regresses to writable-by-client.
    perform public._aiso_pol(r.t, r.p || '_select_own', format('for select to authenticated using (%s)', r.e));
    execute format('drop policy if exists %I on public.%I', r.p || '_insert_own', r.t);
    execute format('drop policy if exists %I on public.%I', r.p || '_update_own', r.t);
    execute format('drop policy if exists %I on public.%I', r.p || '_delete_own', r.t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) ai_memory is SELECT-only with a revoked-flag guard (mirror of 0022).
-- ---------------------------------------------------------------------------
drop policy if exists ai_memory_select_own_all on public.ai_memory;
create policy ai_memory_select_own_all on public.ai_memory
  for select to authenticated using (auth.uid() = user_id and revoked = true);

-- ---------------------------------------------------------------------------
-- 3b) coach_messages: the app writes BOTH roles through the client (the chat
--     route uses the user's own session token). Owners may SELECT, INSERT
--     (their own messages of either role — preserved from 0016 so the route
--     can persist assistant replies), and DELETE their own history.
-- ---------------------------------------------------------------------------
do $$
begin
  execute format('alter table public.coach_messages enable row level security');
  execute format('alter table public.coach_messages force row level security');
end $$;

drop policy if exists cm_select_own on public.coach_messages;
create policy cm_select_own on public.coach_messages
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists cm_insert_user on public.coach_messages;
create policy cm_insert_user on public.coach_messages
  for insert to authenticated with check (auth.uid() = user_id and role = 'user');

drop policy if exists cm_insert_assistant on public.coach_messages;
create policy cm_insert_assistant on public.coach_messages
  for insert to authenticated with check (auth.uid() = user_id and role = 'assistant');

drop policy if exists cm_delete_own on public.coach_messages;
create policy cm_delete_own on public.coach_messages
  for delete to authenticated using (auth.uid() = user_id);

-- Explicitly drop any legacy/stray write policies to keep the set tidy.
drop policy if exists cm_insert_own on public.coach_messages;
drop policy if exists cm_update_own on public.coach_messages;

-- ---------------------------------------------------------------------------
-- 4) Phase-linked child tables (no direct user_id; owner flows from parent
--    phase). SELECT via parent ownership; FORCE RLS to block owner bypass.
-- ---------------------------------------------------------------------------
do $$
begin
  execute format('alter table public.phase_focus_areas enable row level security');
  execute format('alter table public.phase_focus_areas force row level security');
  execute format('alter table public.milestones enable row level security');
  execute format('alter table public.milestones force row level security');
end $$;

drop policy if exists pfa_select_own on public.phase_focus_areas;
create policy pfa_select_own on public.phase_focus_areas
  for select to authenticated
  using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));

drop policy if exists milestones_select_own on public.milestones;
create policy milestones_select_own on public.milestones
  for select to authenticated
  using (exists (select 1 from public.phases p where p.id = phase_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 5) Drop known-permissive SELECT policies on user-owned tables.
--    (Global catalogs are intentionally excluded — they are shareable.)
-- ---------------------------------------------------------------------------
drop policy if exists reflections_select_all on public.reflections;
drop policy if exists quests_select_all on public.quests;
drop policy if exists goals_select_all on public.goals;
drop policy if exists phases_select_all on public.phases;
drop policy if exists momentum_select_all on public.momentum;
drop policy if exists xp_select_all on public.xp_transactions;
drop policy if exists milestones_select_all on public.milestones;
drop policy if exists phase_focus_areas_select_all on public.phase_focus_areas;
drop policy if exists user_stats_select_all on public.user_stats;
drop policy if exists user_skills_select_all on public.user_skills;
drop policy if exists user_achievements_select_all on public.user_achievements;
drop policy if exists coach_messages_select_all on public.coach_messages;
drop policy if exists ai_memory_select_all on public.ai_memory;
drop policy if exists ai_events_select_all on public.ai_events;

-- ---------------------------------------------------------------------------
-- 6) Drop the helper function (kept only for the duration of this migration).
-- ---------------------------------------------------------------------------
drop function if exists public._aiso_pol(text, text, text);

-- =============================================================================
-- Done. Optional read-only verification (uncomment to run):
--
--   select tablename, policyname, cmd, roles
--   from pg_policies where schemaname='public' order by tablename, cmd;
--
--   select relname, relrowsecurity, relforcerowsecurity
--   from pg_class where relnamespace='public'::regnamespace and relrowsecurity
--   order by relname;
-- =============================================================================
