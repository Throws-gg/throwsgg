-- ============================================
-- Self-referral block (W7)
-- ============================================
--
-- Launch-blocker fix from the security audit:
-- accrue_simple_referral_reward paid out 20% NGR to the referrer on every
-- qualifying bet the referred user lost — with NO check that the two users
-- weren't the same human. A farmer could:
--   1. Create account A, get referral code.
--   2. Create account B via A's code (different email, same device).
--   3. Play on B. Every losing bet kicks 20% back to A's claimable balance.
-- Effective house edge against the farmer drops from ~9% to ~7.2% — combined
-- with the $20 signup bonus and/or rakeback, edge can flip negative.
--
-- Fix: inside accrue_simple_referral_reward, skip accrual when referrer and
-- referred share ANY of:
--   - signup_fingerprint (FingerprintJS visitor id, server-verified)
--   - signup_ip (not spoofable at Vercel edge)
--   - normalized_email (Gmail aliasing / dots / case normalised)
-- These columns already exist from migration 013 (signup-bonus dedup).
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
  v_referrer users%ROWTYPE;
  v_referred users%ROWTYPE;
  v_self_match TEXT := NULL;
BEGIN
  IF p_stake < 0.50 OR p_ngr <= 0 THEN
    RETURN;
  END IF;

  -- Load both users so we can check dedup axes. Also ensures both still exist.
  SELECT * INTO v_referrer FROM users WHERE id = p_referrer_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_referred FROM users WHERE id = p_referred_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Self-referral block. Skip accrual entirely (silently) if any axis matches.
  -- We log the match type to admin_actions so this is auditable — if
  -- legitimate referrals ever trip one of these, the evidence is retained.
  IF v_referrer.signup_fingerprint IS NOT NULL
     AND v_referred.signup_fingerprint IS NOT NULL
     AND v_referrer.signup_fingerprint = v_referred.signup_fingerprint THEN
    v_self_match := 'fingerprint';
  ELSIF v_referrer.signup_ip IS NOT NULL
     AND v_referred.signup_ip IS NOT NULL
     AND v_referrer.signup_ip = v_referred.signup_ip THEN
    v_self_match := 'ip';
  ELSIF v_referrer.normalized_email IS NOT NULL
     AND v_referred.normalized_email IS NOT NULL
     AND v_referrer.normalized_email = v_referred.normalized_email THEN
    v_self_match := 'email';
  END IF;

  IF v_self_match IS NOT NULL THEN
    -- Record the block in admin_actions so this is auditable. Uses the
    -- post-migration-017 column shape: admin_identifier + admin_username
    -- are TEXT NOT NULL; we pass 'system' as a synthetic identifier.
    BEGIN
      INSERT INTO admin_actions (
        admin_identifier, admin_username, action_type,
        target_type, target_id,
        after_value, reason
      ) VALUES (
        'system', 'system', 'referral_self_block',
        'user', p_referrer_id::TEXT,
        jsonb_build_object(
          'axis', v_self_match,
          'referrer_id', p_referrer_id,
          'referred_id', p_referred_id,
          'race_bet_id', p_race_bet_id,
          'stake', p_stake,
          'ngr', p_ngr
        ),
        'Blocked self-referral accrual on axis ' || v_self_match
      );
    EXCEPTION WHEN OTHERS THEN
      -- Don't fail the bet settle if admin_actions insert blows up (schema drift).
      NULL;
    END;
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
    'paid', 0, p_ngr
  );

  -- Credit immediately — no hold period for regular referrals
  UPDATE users SET
    referral_earnings = referral_earnings + v_commission,
    updated_at = NOW()
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql;
