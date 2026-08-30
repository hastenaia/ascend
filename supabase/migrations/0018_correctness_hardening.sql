-- Ascend 0018 — Correctness hardening (P0)
-- Builds on 0001..0017. Idempotent.
-- 1) phases.status default drifted: 0001 set DEFAULT 'idle', 0002 replaced the
--    CHECK with ('locked','available','active','completed','archived') but never
--    updated the default — bare inserts failed the CHECK.
-- 2) user_levels / user_achievements are server-derived snapshots (written only
--    by SECURITY DEFINER RPCs) yet retained client write policies from 0001/0003 —
--    cosmetic forgery risk removed by making them SELECT-only for owners.
-- 3) Index collision on user_achievements: 0001 created idx_user_achievements_user
--    on (user_id); 0006's intended (user_id, unlocked_at desc) silently lost.
-- 4) Duplicate SELECT policy on achievements (0001 + 0006) and duplicate mood
--    check on reflections (0014 reflections_mood_check + 0015 check2) cleaned up.
-- 5) boss_challenges missing its updated_at trigger.

-- 1) phases.status default
alter table public.phases alter column status set default 'locked';

-- 2) user_levels: read-only for owners
drop policy if exists ul_insert_own on public.user_levels;
drop policy if exists ul_update_own on public.user_levels;
drop policy if exists ul_delete_own on public.user_levels;
-- keep ul_select_own

-- 2) user_achievements: read-only for owners
drop policy if exists ua_insert_own on public.user_achievements;
drop policy if exists ua_update_own on public.user_achievements;
drop policy if exists ua_delete_own on public.user_achievements;
-- keep ua_select_own

-- 3) Fix user_achievements index collision (recreate with the intended key)
drop index if exists public.idx_user_achievements_user;
create index if not exists idx_user_achievements_user_unlocked
  on public.user_achievements(user_id, unlocked_at desc);
create index if not exists idx_user_achievements_achievement
  on public.user_achievements(achievement_id);

-- 4) Deduplicate achievements SELECT policies (keep achievements_select_authenticated)
drop policy if exists ach_select_authenticated on public.achievements;

-- 4) Deduplicate reflections mood check (keep reflections_mood_check)
alter table public.reflections drop constraint if exists reflections_mood_check2;

-- 4) Defensive: coach_messages cm_insert_own (pre-0016 permissive policy) if any
drop policy if exists cm_insert_own on public.coach_messages;

-- 5) boss_challenges updated_at trigger
drop trigger if exists trg_boss_challenges_updated on public.boss_challenges;
create trigger trg_boss_challenges_updated
  before update on public.boss_challenges
  for each row execute function public.handle_updated_at();