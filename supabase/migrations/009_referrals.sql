-- ============================================
-- Throws.gg Referrals — Database Schema
-- ============================================
--
-- Adds referral tracking to users table + a rewards audit trail.
-- Commission: 5% of house edge on every settled racing bet.
-- House edge is 3% on racing → commission = stake * 0.03 * 0.05 = stake * 0.0015
-- ============================================

-- Add referral columns to users
ALTER TABLE users
  ADD COLUMN referral_code TEXT UNIQUE,
  ADD COLUMN referrer_id UUID REFERENCES users(id),
  ADD COLUMN referral_earnings NUMERIC(18, 8) NOT NULL DEFAULT 0,
  ADD COLUMN referral_lifetime_earned NUMERIC(18, 8) NOT NULL DEFAULT 0;

CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_users_referrer ON users(referrer_id);

-- ============================================
-- REFERRAL REWARDS (audit trail)
-- ============================================
CREATE TABLE referral_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES users(id),
  referred_id     UUID NOT NULL REFERENCES users(id),
  race_bet_id     UUID REFERENCES race_bets(id),
  amount          NUMERIC(18, 8) NOT NULL CHECK (amount >= 0),
  stake_amount    NUMERIC(18, 8) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referral_rewards_referrer ON referral_rewards(referrer_id, created_at DESC);
CREATE INDEX idx_referral_rewards_referred ON referral_rewards(referred_id);
CREATE INDEX idx_referral_rewards_bet ON referral_rewards(race_bet_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Generate a random 8-char referral code. Retries on collision.
CREATE OR REPLACE FUNCTION generate_referral_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/I/1 for clarity
  code TEXT;
  exists_check INT;
  i INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::INT, 1);
    END LOOP;

    SELECT COUNT(*) INTO exists_check FROM users WHERE referral_code = code;
    IF exists_check = 0 THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Credit a referral reward: adds to referrer's referral_earnings + logs it
CREATE OR REPLACE FUNCTION credit_referral_reward(
  p_referrer_id UUID,
  p_referred_id UUID,
  p_race_bet_id UUID,
  p_stake_amount NUMERIC,
  p_commission_amount NUMERIC
) RETURNS void AS $$
BEGIN
  -- Log the reward
  INSERT INTO referral_rewards (referrer_id, referred_id, race_bet_id, amount, stake_amount)
  VALUES (p_referrer_id, p_referred_id, p_race_bet_id, p_commission_amount, p_stake_amount);

  -- Credit referrer's pending balance
  UPDATE users SET
    referral_earnings = referral_earnings + p_commission_amount,
    referral_lifetime_earned = referral_lifetime_earned + p_commission_amount,
    updated_at = NOW()
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql;

-- Claim referral earnings: moves referral_earnings -> balance
CREATE OR REPLACE FUNCTION claim_referral_earnings(
  p_user_id UUID
) RETURNS NUMERIC AS $$
DECLARE
  v_earnings NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Lock the row + get current earnings
  SELECT referral_earnings INTO v_earnings
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_earnings IS NULL OR v_earnings < 0.01 THEN
    RAISE EXCEPTION 'No earnings to claim';
  END IF;

  -- Zero out earnings + credit balance in one transaction
  UPDATE users SET
    referral_earnings = 0,
    balance = balance + v_earnings,
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Log as transaction for history
  INSERT INTO transactions (user_id, type, amount, balance_after, currency, status, confirmed_at, metadata)
  VALUES (
    p_user_id,
    'bonus'::tx_type,
    v_earnings,
    v_new_balance,
    'USD',
    'confirmed',
    NOW(),
    jsonb_build_object('source', 'referral_claim')
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Backfill: generate codes for existing users
UPDATE users SET referral_code = generate_referral_code() WHERE referral_code IS NULL;

-- Make referral_code NOT NULL now that everyone has one
ALTER TABLE users ALTER COLUMN referral_code SET NOT NULL;
