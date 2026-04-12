-- ============================================
-- 017_split_referral_affiliate.sql
--
-- Split the referral and affiliate commission systems.
--
-- AFFILIATES (approved promoters — Kick streamers, CT influencers):
--   - 35/40/45% of NGR based on tier
--   - Weekly rollup, 7-day hold, activation gate
--   - Uses: accrue_referral_reward(), affiliate_periods, full lifecycle
--
-- REFERRALS (regular users sharing with friends):
--   - 10% of NGR, flat rate, no tiers
--   - 90-day window per referred user (commission stops after 90 days)
--   - Immediate credit to referral_earnings (no hold period)
--   - Minimum bet $0.50, skip NGR <= 0 (same as affiliate)
--
-- Gate: users.is_affiliate determines which path the engine uses.
-- Only admin-approved users get is_affiliate = TRUE.
-- ============================================

-- Add the gate flag
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_affiliate BOOLEAN NOT NULL DEFAULT FALSE;

-- Referral commission config
-- 10% of NGR for 90 days per referred user
CREATE OR REPLACE FUNCTION accrue_simple_referral_reward(
  p_referrer_id UUID,
  p_referred_id UUID,
  p_race_bet_id UUID,
  p_stake NUMERIC,
  p_ngr NUMERIC
) RETURNS void AS $$
DECLARE
  v_commission NUMERIC;
  v_referred_created_at TIMESTAMPTZ;
  v_rate NUMERIC := 0.10;  -- 10% of NGR
  v_window_days INT := 90;
BEGIN
  -- Skip tiny bets and non-positive NGR (winning bets)
  IF p_stake < 0.50 OR p_ngr <= 0 THEN
    RETURN;
  END IF;

  -- Check the 90-day window: only earn commission for 90 days
  -- after the referred user signed up
  SELECT created_at INTO v_referred_created_at
  FROM users WHERE id = p_referred_id;

  IF v_referred_created_at IS NULL THEN
    RETURN;
  END IF;

  IF NOW() > v_referred_created_at + (v_window_days || ' days')::INTERVAL THEN
    -- Past the 90-day window — no more commission from this user
    RETURN;
  END IF;

  -- Calculate commission: flat 10% of NGR
  v_commission := p_ngr * v_rate;

  IF v_commission <= 0 THEN
    RETURN;
  END IF;

  -- Insert reward record — status = 'paid' (immediate credit, no hold)
  INSERT INTO referral_rewards (
    referrer_id, referred_id, race_bet_id,
    amount, stake_amount,
    status, tier_at_accrual, ngr_at_accrual
  ) VALUES (
    p_referrer_id, p_referred_id, p_race_bet_id,
    v_commission, p_stake,
    'paid', 0, p_ngr  -- tier 0 = regular referral (not affiliate)
  );

  -- Credit immediately — no hold period for regular referrals
  UPDATE users SET
    referral_earnings = referral_earnings + v_commission,
    referral_lifetime_earned = referral_lifetime_earned + v_commission
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql;

-- Index for the 90-day window check (created_at lookup by id is already fast
-- via PK, but let's make sure referred user lookups are quick)
-- (users PK already covers this, no additional index needed)

-- Backfill: mark no users as affiliates by default. Admin sets this manually
-- when approving affiliate applications.
-- UPDATE users SET is_affiliate = TRUE WHERE id IN (...);
