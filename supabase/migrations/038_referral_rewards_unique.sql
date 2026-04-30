-- ============================================
-- Idempotent referral reward accrual
-- ============================================
--
-- Both accrue_referral_reward (affiliate path) and accrue_simple_referral_reward
-- (regular 20% path) INSERT into referral_rewards keyed on race_bet_id, with
-- no uniqueness guard. settle_race is documented as safe to call multiple
-- times per cycle (idempotent transitions), and creditReferralRewards in
-- engine.ts re-queries by race_id on every call. If settle ever runs twice
-- for the same race — Vercel cron retry, manual admin re-fire, race tick
-- catch-up loop — every losing bet pays the referrer a second commission.
--
-- Fix: partial UNIQUE index on race_bet_id (NULLs allowed for any future
-- non-bet reward source). The two accrual functions wrap their INSERTs in
-- a savepoint so a duplicate (23505) returns silently as a no-op rather
-- than aborting settle_race.
-- ============================================

-- Drop any pre-existing duplicates so the index can be created.
-- Keeps the earliest reward per race_bet_id; voids the rest with an
-- audit trail so a human can reconcile if needed.
WITH ranked AS (
  SELECT
    id,
    race_bet_id,
    ROW_NUMBER() OVER (
      PARTITION BY race_bet_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM referral_rewards
  WHERE race_bet_id IS NOT NULL
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE referral_rewards
SET status = 'voided'
WHERE id IN (SELECT id FROM dupes)
  AND status != 'voided';

-- Now safe to enforce uniqueness on the active rows.
-- Partial index: only enforce when race_bet_id is set AND status isn't voided.
-- This way the cleanup above stays in-place as audit, and future accruals
-- are blocked from creating new duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_race_bet_unique
  ON referral_rewards (race_bet_id)
  WHERE race_bet_id IS NOT NULL AND status != 'voided';

-- ============================================
-- Wrap the affiliate-path INSERT so duplicate-key errors are swallowed.
-- This preserves the migration-036 self-referral block and lifetime stat update.
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
  IF p_stake < 0.50 THEN RETURN 0; END IF;
  IF p_ngr <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_referrer FROM users WHERE id = p_referrer_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO v_referred FROM users WHERE id = p_referred_id;
  IF NOT FOUND THEN RETURN 0; END IF;

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
        target_type, target_id, after_value, reason
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
    EXCEPTION WHEN OTHERS THEN NULL;
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

  -- Idempotent insert. If this race_bet_id already has a reward, the partial
  -- unique index throws 23505 — we catch it, skip the lifetime-earned bump,
  -- and return 0 so the caller treats this as a no-op.
  BEGIN
    INSERT INTO referral_rewards (
      referrer_id, referred_id, race_bet_id, amount, stake_amount,
      status, tier_at_accrual, ngr_at_accrual
    )
    VALUES (
      p_referrer_id, p_referred_id, p_race_bet_id, v_commission, p_stake,
      v_status, v_tier, p_ngr
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN 0;
  END;

  UPDATE users SET
    referral_lifetime_earned = referral_lifetime_earned + v_commission,
    updated_at = NOW()
  WHERE id = p_referrer_id;

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Wrap the simple-path INSERT (and immediate balance credit) so duplicates
-- become no-ops. Preserves the migration-025 self-referral block.
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
  v_rate NUMERIC := 0.20;
  v_referrer users%ROWTYPE;
  v_referred users%ROWTYPE;
  v_self_match TEXT := NULL;
BEGIN
  IF p_stake < 0.50 OR p_ngr <= 0 THEN RETURN; END IF;

  SELECT * INTO v_referrer FROM users WHERE id = p_referrer_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_referred FROM users WHERE id = p_referred_id;
  IF NOT FOUND THEN RETURN; END IF;

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
        target_type, target_id, after_value, reason
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
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN;
  END IF;

  v_commission := p_ngr * v_rate;
  IF v_commission <= 0 THEN RETURN; END IF;

  -- Idempotent insert. If a row already exists for this race_bet_id (i.e.
  -- settle_race ran twice), skip the credit entirely.
  BEGIN
    INSERT INTO referral_rewards (
      referrer_id, referred_id, race_bet_id,
      amount, stake_amount,
      status, tier_at_accrual, ngr_at_accrual
    ) VALUES (
      p_referrer_id, p_referred_id, p_race_bet_id,
      v_commission, p_stake,
      'paid', 0, p_ngr
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN;
  END;

  UPDATE users SET
    referral_earnings = referral_earnings + v_commission,
    updated_at = NOW()
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql;
