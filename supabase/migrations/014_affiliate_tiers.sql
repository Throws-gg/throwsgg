-- ============================================
-- Throws.gg 3-Tier Affiliate System
-- ============================================
--
-- Replaces the instant-credit referral model with weekly period accrual.
--
-- Tiers (based on rolling 30-day NGR from this affiliate's referrals):
--   Tier 1 "Rookie"  : $0 – $25k     → 35% of NGR
--   Tier 2 "Trainer" : $25k – $100k  → 40% of NGR
--   Tier 3 "Owner"   : $100k+        → 45% of NGR
--
-- Key mechanics:
--   - Commission accrues per-bet into referral_rewards (status=pending)
--   - Activation gate: referred user must wager 3x their first deposit
--     before commission is released to the affiliate
--   - Weekly rollup into affiliate_periods (Mon-Sun)
--   - 7-day hold on each period before earnings become claimable
--   - Tier recalc nightly from rolling 30-day NGR
-- ============================================

-- ============================================
-- USERS TABLE ADDITIONS
-- ============================================
ALTER TABLE users
  ADD COLUMN affiliate_tier INT NOT NULL DEFAULT 1 CHECK (affiliate_tier BETWEEN 1 AND 3),
  ADD COLUMN first_deposit_amount NUMERIC(18, 8),
  ADD COLUMN referral_activated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN total_wagered_since_signup NUMERIC(18, 8) NOT NULL DEFAULT 0;

CREATE INDEX idx_users_affiliate_tier ON users(affiliate_tier);

-- ============================================
-- REFERRAL_REWARDS STATUS + PERIOD LINK
-- ============================================
-- Status lifecycle: pending → held → claimable → paid
--   pending   : accrued from a settled bet, referred user not yet activated
--   held      : referred user activated, rolled into a period, in 7-day hold
--   claimable : past hold period, ready to be claimed by affiliate
--   paid      : claimed by affiliate and credited to their balance
--   voided    : refunded due to abuse / chargeback
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_rewards' AND column_name = 'status'
  ) THEN
    ALTER TABLE referral_rewards
      ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'held', 'claimable', 'paid', 'voided'));
  END IF;
END $$;

-- Add period link + tier snapshot + NGR snapshot for auditability
ALTER TABLE referral_rewards
  ADD COLUMN IF NOT EXISTS period_id UUID,
  ADD COLUMN IF NOT EXISTS tier_at_accrual INT,
  ADD COLUMN IF NOT EXISTS ngr_at_accrual NUMERIC(18, 8);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_period ON referral_rewards(period_id);

-- ============================================
-- AFFILIATE_PERIODS (weekly accrual rows)
-- ============================================
CREATE TABLE affiliate_periods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      UUID NOT NULL REFERENCES users(id),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,

  ngr_generated     NUMERIC(18, 8) NOT NULL DEFAULT 0,
  commission_rate   NUMERIC(6, 4) NOT NULL,
  gross_commission  NUMERIC(18, 8) NOT NULL DEFAULT 0,
  carryover_applied NUMERIC(18, 8) NOT NULL DEFAULT 0,
  net_commission    NUMERIC(18, 8) NOT NULL DEFAULT 0,

  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'held', 'claimable', 'paid', 'voided')),
  held_until        TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(affiliate_id, period_start, period_end)
);

CREATE INDEX idx_affiliate_periods_affiliate ON affiliate_periods(affiliate_id);
CREATE INDEX idx_affiliate_periods_status ON affiliate_periods(status);
CREATE INDEX idx_affiliate_periods_held_until ON affiliate_periods(held_until)
  WHERE status = 'held';

-- ============================================
-- FUNCTIONS
-- ============================================

-- Tier → commission rate lookup
CREATE OR REPLACE FUNCTION tier_to_rate(p_tier INT) RETURNS NUMERIC AS $$
BEGIN
  IF p_tier = 1 THEN RETURN 0.35;
  ELSIF p_tier = 2 THEN RETURN 0.40;
  ELSIF p_tier = 3 THEN RETURN 0.45;
  ELSE RETURN 0.35;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- NGR threshold → tier lookup
CREATE OR REPLACE FUNCTION ngr_to_tier(p_ngr NUMERIC) RETURNS INT AS $$
BEGIN
  IF p_ngr >= 100000 THEN RETURN 3;
  ELSIF p_ngr >= 25000 THEN RETURN 2;
  ELSE RETURN 1;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Nightly tier recalculation. Walks all users who have ever referred someone
-- and recomputes their tier based on rolling 30-day NGR from their referrals.
CREATE OR REPLACE FUNCTION recalc_affiliate_tiers() RETURNS INT AS $$
DECLARE
  r RECORD;
  v_ngr NUMERIC;
  v_new_tier INT;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT referrer_id AS affiliate_id
    FROM users
    WHERE referrer_id IS NOT NULL
  LOOP
    -- Sum NGR (stake - payout) from all bets by this affiliate's referrals
    -- in the last 30 days
    SELECT COALESCE(SUM(rb.amount - COALESCE(rb.payout, 0)), 0)
    INTO v_ngr
    FROM race_bets rb
    INNER JOIN users u ON u.id = rb.user_id
    WHERE u.referrer_id = r.affiliate_id
      AND rb.status IN ('won', 'lost')
      AND rb.settled_at > NOW() - INTERVAL '30 days';

    v_new_tier := ngr_to_tier(v_ngr);

    UPDATE users SET
      affiliate_tier = v_new_tier,
      updated_at = NOW()
    WHERE id = r.affiliate_id
      AND affiliate_tier != v_new_tier;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Activate a referred user when they hit 3x their first deposit.
-- Releases their pending referral_rewards from 'pending' to 'held' so they
-- can be rolled into a period on the next weekly payout run.
CREATE OR REPLACE FUNCTION check_referral_activation(p_user_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_user users%ROWTYPE;
  v_threshold NUMERIC;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND OR v_user.referral_activated OR v_user.referrer_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_user.first_deposit_amount IS NULL OR v_user.first_deposit_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  v_threshold := v_user.first_deposit_amount * 3;
  IF v_user.total_wagered_since_signup < v_threshold THEN
    RETURN FALSE;
  END IF;

  -- Activate
  UPDATE users SET
    referral_activated = TRUE,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Release any pending rewards for this user
  UPDATE referral_rewards SET status = 'held'
    WHERE referred_id = p_user_id AND status = 'pending';

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Accrue a pending reward for a single race bet at the current tier rate.
-- Called from settleRace in the application layer (not from DB trigger, so
-- that failures don't block race settlement).
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
BEGIN
  -- Minimum stake floor — bets under $0.50 don't accrue commission
  IF p_stake < 0.50 THEN
    RETURN 0;
  END IF;

  -- Skip negative NGR (winning bets) — these reduce future periods via carryover
  -- We still log them as 0-amount rewards for audit? No, skip entirely.
  IF p_ngr <= 0 THEN
    RETURN 0;
  END IF;

  SELECT affiliate_tier INTO v_tier FROM users WHERE id = p_referrer_id;
  IF v_tier IS NULL THEN v_tier := 1; END IF;

  v_rate := tier_to_rate(v_tier);
  v_commission := ROUND((p_ngr * v_rate)::NUMERIC, 8);

  IF v_commission <= 0 THEN RETURN 0; END IF;

  -- Check if the referred user is activated. If yes → status=held immediately.
  -- If no → status=pending, will be released when they hit 3x first deposit.
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

  -- Increment referrer's lifetime earned (stat only — doesn't affect claimable)
  UPDATE users SET
    referral_lifetime_earned = referral_lifetime_earned + v_commission,
    updated_at = NOW()
  WHERE id = p_referrer_id;

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql;

-- Re-create place_race_bet_atomic now that total_wagered_since_signup exists,
-- so it also tracks wagering-since-signup for the activation gate (3x first
-- deposit). Same behaviour as the original in migration 013, just with one
-- extra UPDATE target.
CREATE OR REPLACE FUNCTION place_race_bet_atomic(
  p_user_id UUID,
  p_race_id UUID,
  p_horse_id INT,
  p_amount NUMERIC,
  p_odds NUMERIC,
  p_potential_payout NUMERIC,
  p_bet_type TEXT
) RETURNS JSONB AS $$
DECLARE
  v_user users%ROWTYPE;
  v_config bonus_config%ROWTYPE;
  v_from_cash NUMERIC := 0;
  v_from_bonus NUMERIC := 0;
  v_new_cash NUMERIC;
  v_new_bonus NUMERIC;
  v_new_wagering NUMERIC;
  v_bonus_converted BOOLEAN := FALSE;
  v_bet_id UUID;
  v_bonus_active BOOLEAN;
  v_wagering_counted BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_user.is_banned THEN
    RAISE EXCEPTION 'Account is banned';
  END IF;

  SELECT * INTO v_config FROM bonus_config WHERE id = 1;

  -- Expire bonus if past expiry
  IF v_user.bonus_expires_at IS NOT NULL AND NOW() > v_user.bonus_expires_at AND v_user.bonus_balance > 0 THEN
    v_user.bonus_balance := 0;
    v_user.wagering_remaining := 0;
    UPDATE users SET bonus_balance = 0, wagering_remaining = 0 WHERE id = p_user_id;
  END IF;

  v_bonus_active := v_user.bonus_balance > 0 OR v_user.wagering_remaining > 0;

  -- Max bet check while bonus active
  IF v_bonus_active AND p_amount > v_config.max_bet_while_bonus THEN
    RAISE EXCEPTION 'Max bet is $% while bonus is active', v_config.max_bet_while_bonus;
  END IF;

  -- Check total available funds
  IF (v_user.balance + v_user.bonus_balance) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Spend cash first, then bonus
  IF v_user.balance >= p_amount THEN
    v_from_cash := p_amount;
    v_from_bonus := 0;
  ELSE
    v_from_cash := v_user.balance;
    v_from_bonus := p_amount - v_user.balance;
  END IF;

  v_new_cash := v_user.balance - v_from_cash;
  v_new_bonus := v_user.bonus_balance - v_from_bonus;
  v_new_wagering := v_user.wagering_remaining;

  IF v_bonus_active AND p_odds >= v_config.min_odds_to_count THEN
    v_new_wagering := GREATEST(0, v_new_wagering - p_amount);
    v_wagering_counted := TRUE;
  END IF;

  IF v_new_wagering = 0 AND v_user.wagering_remaining > 0 AND v_new_bonus > 0 THEN
    v_new_cash := v_new_cash + v_new_bonus;
    v_new_bonus := 0;
    v_bonus_converted := TRUE;
  END IF;

  -- Update user — includes total_wagered_since_signup for activation gate
  UPDATE users SET
    balance = v_new_cash,
    bonus_balance = v_new_bonus,
    wagering_remaining = v_new_wagering,
    total_wagered = total_wagered + p_amount,
    total_wagered_since_signup = total_wagered_since_signup + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Insert the bet row
  INSERT INTO race_bets (user_id, race_id, horse_id, amount, locked_odds, potential_payout, bet_type)
  VALUES (p_user_id, p_race_id, p_horse_id, p_amount, p_odds, p_potential_payout, p_bet_type)
  RETURNING id INTO v_bet_id;

  INSERT INTO transactions (user_id, type, amount, balance_after, currency, status, confirmed_at, metadata)
  VALUES (
    p_user_id,
    'bet'::tx_type,
    -p_amount,
    v_new_cash,
    'USD',
    'confirmed',
    NOW(),
    jsonb_build_object(
      'race_bet_id', v_bet_id,
      'from_cash', v_from_cash,
      'from_bonus', v_from_bonus,
      'wagering_counted', v_wagering_counted,
      'bonus_converted', v_bonus_converted
    )
  );

  UPDATE races SET
    total_bet_amount = total_bet_amount + p_amount,
    bet_count = bet_count + 1
  WHERE id = p_race_id;

  RETURN jsonb_build_object(
    'bet_id', v_bet_id,
    'cash_balance', v_new_cash,
    'bonus_balance', v_new_bonus,
    'wagering_remaining', v_new_wagering,
    'from_cash', v_from_cash,
    'from_bonus', v_from_bonus,
    'bonus_converted', v_bonus_converted,
    'wagering_counted', v_wagering_counted
  );
END;
$$ LANGUAGE plpgsql;

-- Weekly payout rollup. Takes all 'held' rewards older than the period
-- threshold and consolidates them into affiliate_periods rows with a 7-day
-- hold before becoming claimable.
CREATE OR REPLACE FUNCTION rollup_weekly_periods() RETURNS INT AS $$
DECLARE
  r RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_period_id UUID;
  v_count INT := 0;
BEGIN
  -- Period covers the most recently completed Mon-Sun (ended before today)
  v_period_end := (date_trunc('week', NOW() AT TIME ZONE 'UTC')::DATE - 1);  -- last Sunday
  v_period_start := v_period_end - 6;

  FOR r IN
    SELECT referrer_id, SUM(amount) AS gross, SUM(ngr_at_accrual) AS ngr
    FROM referral_rewards
    WHERE status = 'held'
      AND created_at::DATE BETWEEN v_period_start AND v_period_end
    GROUP BY referrer_id
  LOOP
    -- Skip if a period already exists for this affiliate and week
    IF EXISTS (
      SELECT 1 FROM affiliate_periods
      WHERE affiliate_id = r.referrer_id
        AND period_start = v_period_start
        AND period_end = v_period_end
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO affiliate_periods (
      affiliate_id, period_start, period_end,
      ngr_generated, commission_rate, gross_commission,
      net_commission, status, held_until
    )
    VALUES (
      r.referrer_id, v_period_start, v_period_end,
      r.ngr, 0, r.gross,  -- rate 0 because we already applied tier per-bet
      r.gross,
      'held',
      NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO v_period_id;

    -- Link the rewards to the period
    UPDATE referral_rewards SET period_id = v_period_id
      WHERE referrer_id = r.referrer_id
        AND status = 'held'
        AND created_at::DATE BETWEEN v_period_start AND v_period_end;

    v_count := v_count + 1;
  END LOOP;

  -- Move past-hold periods to claimable
  UPDATE affiliate_periods SET status = 'claimable'
    WHERE status = 'held' AND held_until <= NOW();

  -- Credit user referral_earnings for newly claimable periods
  -- (only those not yet reflected)
  UPDATE users u SET referral_earnings = referral_earnings + sub.total
    FROM (
      SELECT affiliate_id, SUM(net_commission) AS total
      FROM affiliate_periods
      WHERE status = 'claimable' AND paid_at IS NULL
        AND updated_at > NOW() - INTERVAL '1 day'  -- just-transitioned rows
      GROUP BY affiliate_id
    ) sub
    WHERE u.id = sub.affiliate_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
