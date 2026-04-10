-- ============================================
-- Throws.gg Affiliate Click Tracking + Applications
-- ============================================
--
-- Two new tables:
--
-- 1. affiliate_clicks — raw landing-page hit log for /r/[code].
--    Gives us traffic visibility per affiliate code without touching
--    the existing users.referrer_id attribution pipeline.
--
-- 2. affiliate_applications — submissions from the public /affiliates
--    page. Not logged-in, so these are anonymous-ish rows that the
--    founder reviews manually and approves or rejects.
-- ============================================

-- ============================================
-- AFFILIATE CLICKS (traffic visibility)
-- ============================================
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT NOT NULL,
  referer     TEXT,
  user_agent  TEXT,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code_created
  ON affiliate_clicks(code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created
  ON affiliate_clicks(created_at DESC);

-- ============================================
-- AFFILIATE APPLICATIONS (public signup form)
-- ============================================
-- Applications come in from /affiliates. Founder reviews manually,
-- approves or rejects. Approved applicants' existing user account
-- (if any) becomes their affiliate profile — the referral_code on
-- users table is already auto-generated at signup, so there's no
-- separate "create affiliate" step.
CREATE TABLE IF NOT EXISTS affiliate_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact + identity
  handle                TEXT NOT NULL,           -- main handle (e.g. @moondegen)
  x_handle              TEXT,                    -- optional X/Twitter
  email                 TEXT NOT NULL,
  audience_size         TEXT NOT NULL,           -- free-form ("~5k", "8,200", etc.)

  -- Channels they will promote on (JSON array of strings)
  primary_channels      JSONB NOT NULL DEFAULT '[]'::jsonb,
  secondary_channels    TEXT,                    -- free text
  content_link          TEXT,                    -- link to a recent vibe-check post
  notes                 TEXT,                    -- "anything else"

  -- Payout
  payout_wallet         TEXT NOT NULL,
  payout_chain          TEXT NOT NULL DEFAULT 'solana',

  -- Attestations (all must be true)
  attest_jurisdiction   BOOLEAN NOT NULL DEFAULT FALSE,
  attest_x_policy       BOOLEAN NOT NULL DEFAULT FALSE,
  attest_terms          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Workflow
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'terminated')),
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,                    -- internal ops notes

  -- If approved, link to the user row that gets the affiliate code
  linked_user_id        UUID REFERENCES users(id),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_status
  ON affiliate_applications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_email
  ON affiliate_applications(email);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_affiliate_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_affiliate_applications_updated_at ON affiliate_applications;
CREATE TRIGGER trg_affiliate_applications_updated_at
  BEFORE UPDATE ON affiliate_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_affiliate_applications_updated_at();
