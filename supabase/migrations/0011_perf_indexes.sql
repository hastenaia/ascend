-- Ascend Optimization Phase — demonstrated composite indexes
-- Only two additions, both justified by measured hot paths:
--
-- 1. quest_completions(user_id, created_at DESC):
--    dashboard "today" window, weekly/monthly analytics buckets, achievements
--    and coach context all range-scan completions per user. The existing
--    single-column user_id index forces a sort/filter over all of a user's
--    history on every one of those reads.
--
-- 2. xp_transactions(user_id, created_at DESC):
--    analytics XP series orders the ledger by created_at within a user;
--    today/14-day windows in dashboard + coach hit the same shape.

create index if not exists idx_quest_completions_user_created
  on public.quest_completions(user_id, created_at desc);

create index if not exists idx_xp_transactions_user_created
  on public.xp_transactions(user_id, created_at desc);
