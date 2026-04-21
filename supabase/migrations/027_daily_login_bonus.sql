-- ============================================
-- 027_daily_login_bonus.sql
-- Daily login bonus — tiered on users.total_wagered.
-- Rides the existing bonus_balance / wagering_remaining rails from
-- migrations 013 + 024. No separate "daily bonus" balance — it all
-- goes into one bonus bucket. 1× wagering.
--
-- Tier ladder mirrors rakeback (CLAUDE.md Phase 1):
--   $0–$500       Bronze     $0.10 / day
--   $500–$5K      Silver     $0.20 / day
--   $5K–$25K      Gold       $0.35 / day
--   $25K–$100K    Platinum   $0.50 / day
--   $100K+        Diamond    $1.00 / day
--
-- Gate: user must have ≥$5 cumulative confirmed deposits before first claim.
-- Reset boundary: 00:00 UTC. Unique (user_id, utc date).
-- Abuse: 24h rolling fingerprint + IP dedup.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================

-- --------------------------------------------
-- SCHEMA
-- --------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_daily_claim_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS daily_claims (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_date              DATE NOT NULL,  -- UTC date, for the unique index
  amount_usd              NUMERIC(18, 8) NOT NULL CHECK (amount_usd > 0),
  wagering_added          NUMERIC(18, 8) NOT NULL CHECK (wagering_added >= 0),
  tier                    TEXT NOT NULL,
  fingerprint_visitor_id  TEXT,
  ip_address              TEXT
);

-- One claim per user per UTC day
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_claims_user_date
  ON daily_claims(user_id, claim_date);

-- Dedup lookups for fingerprint / IP in the last 24h
CREATE INDEX IF NOT EXISTS idx_daily_claims_fp_recent
  ON daily_claims(fingerprint_visitor_id, claimed_at DESC)
  WHERE fingerprint_visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_claims_ip_recent
  ON daily_claims(ip_address, claimed_at DESC)
  WHERE ip_address IS NOT NULL;

-- Per-user history (for profile / stats)
CREATE INDEX IF NOT EXISTS idx_daily_claims_user_recent
  ON daily_claims(user_id, claimed_at DESC);

-- --------------------------------------------
-- HELPER: daily_bonus_tier
-- --------------------------------------------
-- Returns (tier_name, amount_usd) for a lifetime total_wagered.
-- Keep in sync with lib/bonus/daily.ts — SQL is source of truth.
CREATE OR REPLACE FUNCTION daily_bonus_tier(p_total_wagered NUMERIC)
RETURNS TABLE(tier TEXT, amount NUMERIC) AS $$
BEGIN
  IF p_total_wagered >= 100000 THEN
    RETURN QUERY SELECT 'diamond'::TEXT, 1.00::NUMERIC;
  ELSIF p_total_wagered >= 25000 THEN
    RETURN QUERY SELECT 'platinum'::TEXT, 0.50::NUMERIC;
  ELSIF p_total_wagered >= 5000 THEN
    RETURN QUERY SELECT 'gold'::TEXT, 0.35::NUMERIC;
  ELSIF p_total_wagered >= 500 THEN
    RETURN QUERY SELECT 'silver'::TEXT, 0.20::NUMERIC;
  ELSE
    RETURN QUERY SELECT 'bronze'::TEXT, 0.10::NUMERIC;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- --------------------------------------------
-- RPC: claim_daily_bonus
-- --------------------------------------------
-- Atomic. Checks deposit gate, UTC-day dedup, fingerprint + IP 24h dedup,
-- tier lookup. Credits bonus_balance + wagering_remaining (1× multiplier).
-- Returns JSONB with {granted, reason?, amount?, tier?, next_claim_at}.
CREATE OR REPLACE FUNCTION claim_daily_bonus(
  p_user_id     UUID,
  p_fingerprint TEXT,
  p_ip          TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user             users%ROWTYPE;
  v_today            DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_tomorrow         TIMESTAMPTZ := ((v_today + 1)::TEXT || ' 00:00:00')::TIMESTAMPTZ;
  v_total_deposits   NUMERIC;
  v_tier_row         RECORD;
  v_amount           NUMERIC;
  v_wagering         NUMERIC;
  v_collision_count  INT;
BEGIN
  -- Lock the user row
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', FALSE, 'reason', 'user_not_found');
  END IF;

  IF v_user.is_banned THEN
    RETURN jsonb_build_object('granted', FALSE, 'reason', 'banned');
  END IF;

  -- UTC-day dedup: already claimed today?
  PERFORM 1 FROM daily_claims
    WHERE user_id = p_user_id AND claim_date = v_today
    LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', FALSE,
      'reason', 'already_claimed',
      'next_claim_at', v_tomorrow
    );
  END IF;

  -- Deposit gate: ≥$5 cumulative confirmed deposits
  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposits
    FROM transactions
    WHERE user_id = p_user_id
      AND type = 'deposit'::tx_type
      AND status = 'confirmed';

  IF v_total_deposits < 5 THEN
    RETURN jsonb_build_object(
      'granted', FALSE,
      'reason', 'deposit_required',
      'required_deposit', 5,
      'current_deposits', v_total_deposits
    );
  END IF;

  -- Fingerprint 24h dedup — block if another user claimed with this fp in last 24h
  IF p_fingerprint IS NOT NULL THEN
    SELECT COUNT(*) INTO v_collision_count
      FROM daily_claims
      WHERE fingerprint_visitor_id = p_fingerprint
        AND user_id != p_user_id
        AND claimed_at > NOW() - INTERVAL '24 hours';
    IF v_collision_count > 0 THEN
      RETURN jsonb_build_object('granted', FALSE, 'reason', 'duplicate_fingerprint');
    END IF;
  END IF;

  -- IP 24h dedup
  IF p_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_collision_count
      FROM daily_claims
      WHERE ip_address = p_ip
        AND user_id != p_user_id
        AND claimed_at > NOW() - INTERVAL '24 hours';
    IF v_collision_count > 0 THEN
      RETURN jsonb_build_object('granted', FALSE, 'reason', 'duplicate_ip');
    END IF;
  END IF;

  -- Tier lookup
  SELECT * INTO v_tier_row FROM daily_bonus_tier(COALESCE(v_user.total_wagered, 0));
  v_amount := v_tier_row.amount;
  v_wagering := v_amount;  -- 1× multiplier

  -- Credit bonus_balance + wagering_remaining + record claim
  UPDATE users SET
    bonus_balance      = bonus_balance + v_amount,
    wagering_remaining = wagering_remaining + v_wagering,
    last_daily_claim_at = NOW(),
    -- If this is the first-ever bonus and signup bonus never set an expiry,
    -- give the daily 14 days to use. If a longer expiry already exists,
    -- keep it (don't shrink).
    bonus_expires_at   = GREATEST(
      COALESCE(bonus_expires_at, NOW() + INTERVAL '14 days'),
      NOW() + INTERVAL '14 days'
    ),
    updated_at         = NOW()
  WHERE id = p_user_id;

  INSERT INTO daily_claims (
    user_id, claimed_at, claim_date, amount_usd, wagering_added,
    tier, fingerprint_visitor_id, ip_address
  ) VALUES (
    p_user_id, NOW(), v_today, v_amount, v_wagering,
    v_tier_row.tier, p_fingerprint, p_ip
  );

  -- Log as a transaction for the audit ledger
  INSERT INTO transactions (
    user_id, type, amount, balance_after, currency, status, confirmed_at, metadata
  ) VALUES (
    p_user_id,
    'bonus'::tx_type,
    v_amount,
    v_user.balance,  -- cash unchanged; bonus_balance grew by v_amount
    'USD',
    'confirmed',
    NOW(),
    jsonb_build_object(
      'source', 'daily_login_bonus',
      'tier', v_tier_row.tier,
      'wagering_added', v_wagering,
      'claim_date', v_today
    )
  );

  RETURN jsonb_build_object(
    'granted', TRUE,
    'amount', v_amount,
    'tier', v_tier_row.tier,
    'wagering_added', v_wagering,
    'next_claim_at', v_tomorrow
  );
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------
-- Convenience: daily bonus status for a user (read-only)
-- --------------------------------------------
-- Returns eligibility without mutating state.
CREATE OR REPLACE FUNCTION get_daily_bonus_status(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user           users%ROWTYPE;
  v_today          DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_tomorrow       TIMESTAMPTZ := ((v_today + 1)::TEXT || ' 00:00:00')::TIMESTAMPTZ;
  v_claimed_today  BOOLEAN;
  v_total_deposits NUMERIC;
  v_tier_row       RECORD;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'user_not_found');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM daily_claims
      WHERE user_id = p_user_id AND claim_date = v_today
  ) INTO v_claimed_today;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposits
    FROM transactions
    WHERE user_id = p_user_id
      AND type = 'deposit'::tx_type
      AND status = 'confirmed';

  SELECT * INTO v_tier_row FROM daily_bonus_tier(COALESCE(v_user.total_wagered, 0));

  RETURN jsonb_build_object(
    'eligible', NOT v_claimed_today AND v_total_deposits >= 5 AND NOT v_user.is_banned,
    'already_claimed_today', v_claimed_today,
    'deposit_required', 5,
    'current_deposits', v_total_deposits,
    'amount', v_tier_row.amount,
    'tier', v_tier_row.tier,
    'next_claim_at', v_tomorrow,
    'total_wagered', COALESCE(v_user.total_wagered, 0)
  );
END;
$$ LANGUAGE plpgsql STABLE;
