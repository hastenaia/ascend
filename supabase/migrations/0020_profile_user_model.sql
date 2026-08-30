-- Ascend 0020 — User model foundation (P0)
-- Builds on 0001..0019. Idempotent.
-- Expands profiles so the coach can personalize from real stated context:
-- experience level, coach-style preference (JSON), and long-term objectives.

alter table public.profiles add column if not exists experience_level text
  check (experience_level in ('beginner','intermediate','advanced'));
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists long_term_objectives text
  check (long_term_objectives is null or char_length(long_term_objectives) <= 1000);