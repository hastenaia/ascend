-- Ascend 0019 — Quest behavioral data capture (P0)
-- Builds on 0001..0018. Idempotent.
-- Records honest evidence of behavior (postpones, skips, evidence of growth)
-- so the pattern engine and AI coach reason from facts, not guesses.

alter table public.quests add column if not exists postponed_count int not null default 0
  check (postponed_count >= 0);
alter table public.quests add column if not exists last_postponed_at timestamptz;
alter table public.quests add column if not exists skipped_count int not null default 0
  check (skipped_count >= 0);
alter table public.quests add column if not exists last_skipped_at timestamptz;
alter table public.quests add column if not exists evidence text
  check (evidence is null or char_length(evidence) <= 2000);
alter table public.quests add column if not exists adapted_from_difficulty text
  check (adapted_from_difficulty is null or adapted_from_difficulty in ('easy','medium','hard','challenge'));

-- Behavior scans (pattern engine reads active + history rows by user)
create index if not exists idx_quests_user_status_difficulty
  on public.quests(user_id, status, difficulty);