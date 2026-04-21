-- ============================================
-- 026_email_infra.sql
-- Email infrastructure: per-user category preferences + send log
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE where applicable)
-- ============================================

-- Per-user preferences. JSONB keyed by EmailCategory. Missing keys fall back
-- to DEFAULT_PREFERENCES in lib/email/categories.ts. Global unsubscribe via
-- email_unsubscribed_at — transactional still sends.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email TEXT; -- mirror of Privy email for send targets

-- Unique index only when email is set — users can sign up wallet-only
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(lower(email))
  WHERE email IS NOT NULL;

-- Email send log — retention analytics + idempotency
CREATE TABLE IF NOT EXISTS email_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email            TEXT NOT NULL,
  category            TEXT NOT NULL,
  subject             TEXT NOT NULL,
  idempotency_key     TEXT,
  resend_message_id   TEXT,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at           TIMESTAMPTZ,
  clicked_at          TIMESTAMPTZ,
  bounced_at          TIMESTAMPTZ,
  complaint_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_category ON email_log(category, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_log_idempotency
  ON email_log(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
