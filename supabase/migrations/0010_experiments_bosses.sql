-- Ascend Phase 10 — Life Experiments + Boss Challenges
-- Builds on 0001–0009. Additive, idempotent.
--
-- Experiments become structured self-observations (completion + mood/energy/
-- productivity, optional sleep). Boss challenges are a purely playful,
-- client-owned metaphor for chipping away at personal obstacles.

-- =====================================================
-- Experiments: lifecycle fields
-- =====================================================
alter table public.experiments add column if not exists duration_days int not null default 14
  check (duration_days between 1 and 90);
alter table public.experiments add column if not exists started_at date;
alter table public.experiments add column if not exists completed_at timestamptz;
alter table public.experiments add column if not exists track_sleep boolean not null default false;

-- Backfill start for any legacy rows
update public.experiments set started_at = created_at::date where started_at is null;

-- =====================================================
-- Entries: structured daily metrics (journal body becomes optional)
-- =====================================================
alter table public.experiment_entries alter column body drop not null;
alter table public.experiment_entries drop constraint if exists experiment_entries_body_check;

alter table public.experiment_entries add column if not exists entry_date date;
alter table public.experiment_entries add column if not exists completed boolean not null default false;
alter table public.experiment_entries add column if not exists mood smallint check (mood between 1 and 5);
alter table public.experiment_entries add column if not exists energy smallint check (energy between 1 and 5);
alter table public.experiment_entries add column if not exists productivity smallint check (productivity between 1 and 5);
alter table public.experiment_entries add column if not exists sleep_quality smallint check (sleep_quality between 1 and 5);

-- Backfill entry dates for legacy journal rows
update public.experiment_entries set entry_date = created_at::date where entry_date is null;

-- One metrics snapshot per experiment per day (upsert target)
create unique index if not exists uq_experiment_entry_date
  on public.experiment_entries(experiment_id, entry_date);

-- =====================================================
-- Boss challenges (playful metaphor; plain owner CRUD — no XP/security role)
-- =====================================================
create table if not exists public.boss_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  hp int not null default 1000 check (hp between 100 and 10000),
  status text not null default 'active' check (status in ('active','defeated','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  defeated_at timestamptz
);
create index if not exists idx_boss_user on public.boss_challenges(user_id, status);

create table if not exists public.boss_hits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boss_id uuid not null references public.boss_challenges(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  damage int not null check (damage between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_boss_hits_boss on public.boss_hits(boss_id, created_at desc);

alter table public.boss_challenges enable row level security;
alter table public.boss_hits enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='boss_challenges' and policyname='boss_select_own') then
    create policy boss_select_own on public.boss_challenges for select to authenticated using (auth.uid() = user_id);
    create policy boss_insert_own on public.boss_challenges for insert to authenticated with check (auth.uid() = user_id);
    create policy boss_update_own on public.boss_challenges for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy boss_delete_own on public.boss_challenges for delete to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='boss_hits' and policyname='bhit_select_own') then
    create policy bhit_select_own on public.boss_hits for select to authenticated using (auth.uid() = user_id);
    create policy bhit_insert_own on public.boss_hits for insert to authenticated with check (auth.uid() = user_id);
    create policy bhit_delete_own on public.boss_hits for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;
