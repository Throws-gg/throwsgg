-- ============================================
-- 029_ata_initialized.sql
-- Add users.ata_initialized_at for the USDC ATA pre-creation flow.
--
-- Why: if a user's Privy embedded wallet doesn't have a USDC ATA when
-- someone sends them USDC, the sender's wallet (Phantom, Solflare,
-- exchanges) may refuse to auto-create the ATA and leave the tx pending
-- forever. Pre-creating the ATA on signup avoids that UX dead-end.
--
-- Populated by /api/wallet/init-ata (hot wallet pays the ~0.002 SOL rent,
-- idempotent on the on-chain account check). Column is nullable — existing
-- users get backfilled next time they hit the deposit flow.
-- Safe to re-run.
-- ============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ata_initialized_at TIMESTAMPTZ;
