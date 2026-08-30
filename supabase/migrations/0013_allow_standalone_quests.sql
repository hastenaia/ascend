-- Ascend FIX 0013 — Allow standalone quests + ensure visibility everywhere
-- Problem: quests_parent requires milestone_id OR phase_id, so users without
-- an active/available phase cannot create quests at all. That hides quests
-- on /quests, /dashboard and blocks character growth (stats/skills only grow
-- via complete_quest). This migration relaxes the constraint to allow
-- standalone quests while keeping existing linked quests valid.
-- Also fixes dashboard visibility: one-time quests without due_date were
-- invisible on dashboard because questIsDueToday required due_date. We keep
-- DB lean and handle that in app code; no schema change needed for that.
-- Idempotent.

-- Drop the strict parent check and allow standalone
alter table public.quests drop constraint if exists quests_parent;

-- Optional permissive check: if both present that's OK, if neither present also OK
-- (standalone). If you want to re-enforce later, add it back stricter.
-- We deliberately do NOT add a new CHECK so standalone is permitted.

-- Ensure quests created without dates are still indexed for listing
create index if not exists idx_quests_user_status_created on public.quests(user_id, status, created_at desc);
