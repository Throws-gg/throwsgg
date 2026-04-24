-- ============================================
-- 030_backfill_wallet_address.sql
-- Backfill users.wallet_address from deposit_addresses.address.
--
-- Root cause: the client (components/layout/Providers.tsx) was calling
-- /api/auth/sync before `useWallets()` from @privy-io/react-auth/solana had
-- populated. The sync POSTed solanaAddress = null, and the server couldn't
-- backfill users.wallet_address. 10 of 11 signups were affected.
--
-- Every affected user DOES have a row in deposit_addresses (populated by the
-- old client-trusted path in /api/wallet/deposit before the Apr-21 security
-- fix), and that row has the correct Solana address for their embedded wallet.
-- So we copy across.
--
-- Write-once safety: only updates rows where users.wallet_address IS NULL.
-- If a user somehow got their wallet_address set after 2026-04-24, we leave
-- it alone.
-- Safe to re-run — idempotent via the IS NULL guard.
-- ============================================

UPDATE users u
SET wallet_address = da.address
FROM deposit_addresses da
WHERE u.id = da.user_id
  AND da.chain = 'solana'
  AND u.wallet_address IS NULL
  AND da.address IS NOT NULL;
