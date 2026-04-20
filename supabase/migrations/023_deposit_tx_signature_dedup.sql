-- ============================================
-- Deposit tx-signature dedup via UNIQUE(tx_hash)
-- ============================================
--
-- Launch-blocker fix (security audit W1 — double-credit race):
-- The previous deposit flow computed `credit = on_chain_balance - last_known_balance`
-- and called update_balance once. Two concurrent /api/wallet/deposit calls
-- both read last_known = 0, both see on_chain = 100, both credit $100 → $200.
--
-- Fix: switch to per-transaction dedup. We enumerate every incoming SPL
-- transfer signature and try to credit each one individually with the Solana
-- tx signature as `transactions.tx_hash`. A unique partial index on
-- (tx_hash) turns the second concurrent attempt into a constraint violation
-- instead of a successful re-credit.
--
-- This migration is just the UNIQUE constraint. The enumerate-signatures
-- logic lives in lib/wallet/solana.ts and app/api/wallet/deposit/route.ts.
-- ============================================

-- Drop the old non-unique index (partial, was created in 001). Keeping the
-- same predicate means the unique replacement is a strict tightening.
DROP INDEX IF EXISTS idx_tx_hash;

-- Partial unique index on non-null tx_hash. NULLs are allowed for internal
-- transactions (bets, payouts, bonus credits) that don't have an on-chain
-- signature.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_hash_unique
  ON transactions (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- Cursor column so we only re-scan recent signatures, not the full history.
-- NULL = never scanned; treat as "scan the last N signatures on first call".
ALTER TABLE deposit_addresses
  ADD COLUMN IF NOT EXISTS last_processed_slot BIGINT;

-- Also store the baseline SOL lamports on the address row itself so we can
-- lock + update atomically per wallet. This replaces the
-- "read-latest-transaction-metadata" dance that was racey.
ALTER TABLE deposit_addresses
  ADD COLUMN IF NOT EXISTS sol_baseline_lamports BIGINT NOT NULL DEFAULT 0;
