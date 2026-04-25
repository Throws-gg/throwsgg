-- ============================================
-- 031_sweep_delegation.sql
-- Track which users have delegated their Privy embedded wallet to our
-- "Sweeping Key" authorization key, so /api/wallet/deposit can sweep
-- USDC deposits to our hot wallet without per-tx user consent.
--
-- Without delegation, deposits accumulate in scattered user embedded
-- wallets and our hot wallet bleeds dry funding withdrawals. This is
-- the cashflow fix.
--
-- Columns:
--   sweep_delegated_at — set after the user clicks through the Privy
--     delegation modal AND we successfully verify it server-side via
--     the Privy server SDK. Write-once.
--   sweep_revoked_at — set if the user revokes via Privy. Allows us to
--     gate further deposits / re-prompt for delegation.
--
-- Both nullable. New users start with both NULL — first deposit attempt
-- prompts delegation.
-- Safe to re-run.
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sweep_delegated_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sweep_revoked_at TIMESTAMPTZ;

-- Index for the admin "unswept users" view — find users with on-chain
-- balance but no delegation. Cheap, partial.
CREATE INDEX IF NOT EXISTS idx_users_sweep_undelegated
  ON users(id)
  WHERE sweep_delegated_at IS NULL;
