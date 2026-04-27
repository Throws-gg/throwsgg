-- ============================================
-- 032_add_is_affiliate.sql
-- Add the missing users.is_affiliate column.
--
-- Backstory: migration 017_split_referral_affiliate.sql tried to add this
-- column, but it collided with another migration also named 017
-- (017_admin_actions_no_fk.sql). Supabase's per-name tracking applied one
-- and skipped the other. The "affiliate split" migration also rewrote the
-- referral commission RPC to 10% / 90-day windows, which is now stale —
-- migration 019 superseded that with 20% lifetime. So we only want the
-- column add, not the function rewrite.
--
-- Without this column, every code path that reads users.is_affiliate
-- silently errors:
--   - app/api/referrals/me 404s with "User not found" (the supabase query
--     errors, ourMisleading 404 fires)
--   - lib/racing/engine.ts settle path can't classify referrers as
--     affiliates vs regular referrals — quiet failure during race settle
--   - app/api/admin/affiliates/review can't flip the affiliate flag on
--     approval — admin actions silently no-op
--
-- Default FALSE (regular referrer). Admin approval flips it to TRUE.
-- Safe to re-run.
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_affiliate BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional: index for fast filtering on the engine's settle path that
-- looks up which referrers are affiliates among a batch of referrer IDs.
-- Partial index keeps it small (the vast majority of users will be FALSE).
CREATE INDEX IF NOT EXISTS idx_users_is_affiliate
  ON users(id)
  WHERE is_affiliate = TRUE;
