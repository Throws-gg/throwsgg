-- ============================================
-- Security audit fixes (2026-04-29)
-- ============================================
--
-- 1. Self-referral block on the AFFILIATE path
--    Migration 025 closed the hole on the simple 20% path
--    (accrue_simple_referral_reward) but accrue_referral_reward — used for
--    is_affiliate=TRUE users at 35–45% NGR — still pays out without checking
--    whether referrer and referred are the same human. With the affiliate
--    rate at 45%, edge inverts (9% house take − 45% rebate ≈ −36%). Mirror
--    the dedup block from migration 025 here.
--
-- 2. Pending-withdrawal TOCTOU lock
--    The withdraw route checks "no pending withdrawals" then inserts via
--    update_balance, with no row lock spanning the two. Two concurrent
--    requests can both pass the check and both debit. Add a partial UNIQUE
--    index so the DB rejects the second insert.
-- ============================================

-- ============================================
-- 1. Affiliate-path self-referral block
-- ============================================
CREATE OR REPLACE FUNCTION accrue_referral_reward(
  p_referrer_id UUID,
  p_referred_id UUID,
  p_race_bet_id UUID,
  p_stake NUMERIC,
  p_ngr NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_tier INT;
  v_rate NUMERIC;
  v_commission NUMERIC;
  v_referred_activated BOOLEAN;
  v_status TEXT;
  v_referrer users%ROWTYPE;
  v_referred users%ROWTYPE;
  v_self_match TEXT := NULL;
BEGIN
  -- Minimum stake floor — bets under $0.50 don't accrue commission
  IF p_stake < 0.50 THEN
    RETURN 0;
  END IF;

  -- Skip negative NGR (winning bets) — these reduce future periods via carryover
  IF p_ngr <= 0 THEN
    RETURN 0;
  END IF;

  -- Load both users so we can run the same dedup checks as the simple path.
  SELECT * INTO v_referrer FROM users WHERE id = p_referrer_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO v_referred FROM users WHERE id = p_referred_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Self-referral block. Skip accrual entirely if any axis matches.
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
    BEGIN
      INSERT INTO admin_actions (
        admin_identifier, admin_username, action_type,
        target_type, target_id,
        after_value, reason
      ) VALUES (
        'system', 'system', 'affiliate_self_block',
        'user', p_referrer_id::TEXT,
        jsonb_build_object(
          'axis', v_self_match,
          'referrer_id', p_referrer_id,
          'referred_id', p_referred_id,
          'race_bet_id', p_race_bet_id,
          'stake', p_stake,
          'ngr', p_ngr
        ),
        'Blocked affiliate self-referral accrual on axis ' || v_self_match
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN 0;
  END IF;

  SELECT affiliate_tier INTO v_tier FROM users WHERE id = p_referrer_id;
  IF v_tier IS NULL THEN v_tier := 1; END IF;

  v_rate := tier_to_rate(v_tier);
  v_commission := ROUND((p_ngr * v_rate)::NUMERIC, 8);

  IF v_commission <= 0 THEN RETURN 0; END IF;

  SELECT referral_activated INTO v_referred_activated
  FROM users WHERE id = p_referred_id;

  v_status := CASE WHEN v_referred_activated THEN 'held' ELSE 'pending' END;

  INSERT INTO referral_rewards (
    referrer_id, referred_id, race_bet_id, amount, stake_amount,
    status, tier_at_accrual, ngr_at_accrual
  )
  VALUES (
    p_referrer_id, p_referred_id, p_race_bet_id, v_commission, p_stake,
    v_status, v_tier, p_ngr
  );

  UPDATE users SET
    referral_lifetime_earned = referral_lifetime_earned + v_commission,
    updated_at = NOW()
  WHERE id = p_referrer_id;

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Pending-withdrawal partial UNIQUE index
-- ============================================
-- Race condition: two concurrent withdraw requests both pass the
-- "no pending withdrawal" SELECT, both call update_balance, both debit.
-- The DB-side guarantee is the simplest fix — a partial UNIQUE index makes
-- the second insert fail with 23505, which surfaces as a 5xx the user can
-- retry once the first request resolves.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_withdrawal_per_user
  ON transactions (user_id)
  WHERE type = 'withdrawal' AND status = 'pending';
