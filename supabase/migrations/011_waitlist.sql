-- ============================================
-- 011_waitlist.sql
--
-- Email collection for the landing page waitlist.
-- Simple table — email is unique, timestamp and referer for analytics.
-- ============================================

CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  source      TEXT,
  referer     TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);
