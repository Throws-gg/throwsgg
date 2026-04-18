-- ============================================
-- Track last username change for cooldown
-- ============================================
--
-- Users can edit their username from the profile page. We rate-limit
-- to one change per 7 days to prevent chat confusion and affiliate
-- attribution issues (someone changing to impersonate an affiliate
-- between link creation and payout).
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
