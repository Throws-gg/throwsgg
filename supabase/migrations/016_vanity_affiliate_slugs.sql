-- ============================================
-- Custom vanity affiliate slugs
-- ============================================
--
-- Allows admin to create custom short links like throws.gg/drake
-- that map to a user's referral code. The /r/[code] route checks
-- this table first before falling back to the standard referral_code
-- lookup on the users table.
--
-- One user can have multiple vanity slugs (e.g. drake, drizzy).
-- Slugs are case-insensitive (stored lowercase).
-- ============================================

CREATE TABLE vanity_slugs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,             -- lowercase, no spaces, alphanumeric + hyphens
  user_id     UUID NOT NULL REFERENCES users(id),
  created_by  UUID REFERENCES users(id),        -- admin who created it
  note        TEXT,                              -- internal note (e.g. "drake partnership Q3 2026")
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  click_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,30}[a-z0-9]$')
);

CREATE INDEX idx_vanity_slugs_user ON vanity_slugs(user_id);
CREATE INDEX idx_vanity_slugs_active ON vanity_slugs(slug) WHERE active = TRUE;

-- Lookup function: checks vanity_slugs first, then users.referral_code.
-- Returns the user_id for attribution, or NULL if not found.
CREATE OR REPLACE FUNCTION resolve_referral_code(p_code TEXT) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_lower TEXT;
BEGIN
  v_lower := lower(trim(p_code));

  -- Check vanity slugs first
  SELECT user_id INTO v_user_id
  FROM vanity_slugs
  WHERE slug = v_lower AND active = TRUE
  LIMIT 1;

  IF FOUND THEN
    -- Increment click count (fire-and-forget, non-blocking)
    UPDATE vanity_slugs SET click_count = click_count + 1 WHERE slug = v_lower;
    RETURN v_user_id;
  END IF;

  -- Fall back to standard referral_code (case-insensitive)
  SELECT id INTO v_user_id
  FROM users
  WHERE referral_code = upper(trim(p_code))
  LIMIT 1;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;
