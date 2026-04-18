-- ============================================
-- Bump regular referral rate to 20% and drop the 90-day window.
-- ============================================
--
-- Pre-launch tuning: regular referrals now pay 20% of NGR for the
-- lifetime of each referred user (was 10% for 90 days). Approved
-- affiliate tiers (35/40/45%) are unchanged.
--
-- This replaces the function body only — signature, callers, and
-- referral_rewards rows stay the same. Already-accrued rewards are
-- not retroactively recalculated.
-- ============================================

CREATE OR REPLACE FUNCTION accrue_simple_referral_reward(
  p_referrer_id UUID,
  p_referred_id UUID,
  p_race_bet_id UUID,
  p_stake NUMERIC,
  p_ngr NUMERIC
) RETURNS void AS $$
DECLARE
  v_commission NUMERIC;
  v_rate NUMERIC := 0.20;  -- 20% of NGR, lifetime
BEGIN
  -- Skip tiny bets and non-positive NGR (winning bets)
  IF p_stake < 0.50 OR p_ngr <= 0 THEN
    RETURN;
  END IF;

  -- Confirm the referred user still exists
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_referred_id) THEN
    RETURN;
  END IF;

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
