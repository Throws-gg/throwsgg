-- ============================================
-- Throws.gg Bonus System — $20 signup credit
-- ============================================
--
-- Architecture: separate bonus_balance from cash balance.
-- - Real money (balance) is always bet first
-- - Bonus balance is only hit if cash balance = 0
-- - Bonus winnings stay in bonus_balance until wagering_remaining = 0
-- - Then the entire bonus_balance is converted to cash atomically
--
-- Config:
-- - $20 bonus, first 100 signups only (atomic counter)
-- - 3x wagering ($60 required)
-- - Max bet $5 while bonus active
-- - Min odds 2.0 per bet to count toward wagering
-- - 14-day expiry
-- ============================================

-- ============================================
-- USERS TABLE ADDITIONS
-- ============================================
ALTER TABLE users
  ADD COLUMN bonus_balance NUMERIC(18, 8) NOT NULL DEFAULT 0 CHECK (bonus_balance >= 0),
  ADD COLUMN wagering_remaining NUMERIC(18, 8) NOT NULL DEFAULT 0 CHECK (wagering_remaining >= 0),
  ADD COLUMN bonus_expires_at TIMESTAMPTZ,
  ADD COLUMN bonus_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN signup_fingerprint TEXT,
  ADD COLUMN signup_ip TEXT,
  ADD COLUMN normalized_email TEXT;

-- Unique indexes to prevent multi-accounting (only apply to users who claimed the bonus)
CREATE UNIQUE INDEX idx_users_bonus_fingerprint
  ON users(signup_fingerprint)
  WHERE bonus_claimed = TRUE AND signup_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX idx_users_bonus_email
  ON users(normalized_email)
  WHERE bonus_claimed = TRUE AND normalized_email IS NOT NULL;

-- ============================================
-- BONUS_CONFIG TABLE (global counter + settings)
-- ============================================
CREATE TABLE bonus_config (
  id                  INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  signup_bonus_amount NUMERIC(18, 8) NOT NULL DEFAULT 20,
  wagering_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 3,
  max_bet_while_bonus NUMERIC(18, 8) NOT NULL DEFAULT 5,
  min_odds_to_count   NUMERIC(6, 2) NOT NULL DEFAULT 2.0,
  expiry_days         INT NOT NULL DEFAULT 14,
  signup_cap          INT NOT NULL DEFAULT 100,
  signups_claimed     INT NOT NULL DEFAULT 0,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single row
INSERT INTO bonus_config DEFAULT VALUES;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Normalize an email for dedup: lowercase + strip Gmail dots/plus aliases
CREATE OR REPLACE FUNCTION normalize_email(raw_email TEXT) RETURNS TEXT AS $$
DECLARE
  local_part TEXT;
  domain_part TEXT;
  at_pos INT;
BEGIN
  IF raw_email IS NULL OR raw_email = '' THEN
    RETURN NULL;
  END IF;

  raw_email := lower(trim(raw_email));
  at_pos := position('@' in raw_email);
  IF at_pos = 0 THEN
    RETURN raw_email;
  END IF;

  local_part := substring(raw_email from 1 for at_pos - 1);
  domain_part := substring(raw_email from at_pos);

  -- Strip +tag
  IF position('+' in local_part) > 0 THEN
    local_part := substring(local_part from 1 for position('+' in local_part) - 1);
  END IF;

  -- Strip dots from Gmail addresses
  IF domain_part = '@gmail.com' OR domain_part = '@googlemail.com' THEN
    local_part := replace(local_part, '.', '');
    domain_part := '@gmail.com';
  END IF;

  RETURN local_part || domain_part;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Grant a signup bonus atomically — increments the global counter, writes bonus
-- balance + wagering requirement + expiry. Returns TRUE if granted, FALSE if
-- cap reached or user already claimed.
CREATE OR REPLACE FUNCTION grant_signup_bonus(
  p_user_id UUID,
  p_email TEXT,
  p_fingerprint TEXT,
  p_ip TEXT
) RETURNS JSONB AS $$
DECLARE
  v_config bonus_config%ROWTYPE;
  v_user users%ROWTYPE;
  v_normalized_email TEXT;
  v_expires_at TIMESTAMPTZ;
  v_wagering NUMERIC;
BEGIN
  -- Lock the config row first to prevent races on signup counter
  SELECT * INTO v_config FROM bonus_config WHERE id = 1 FOR UPDATE;

  IF NOT v_config.enabled THEN
    RETURN jsonb_build_object('granted', FALSE, 'reason', 'disabled');
  END IF;

  IF v_config.signups_claimed >= v_config.signup_cap THEN
    RETURN jsonb_build_object('granted', FALSE, 'reason', 'cap_reached');
  END IF;

  -- Look up user (and lock them)
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', FALSE, 'reason', 'user_not_found');
  END IF;

  IF v_user.bonus_claimed THEN
    RETURN jsonb_build_object('granted', FALSE, 'reason', 'already_claimed');
  END IF;

  v_normalized_email := normalize_email(p_email);

  -- Check for duplicate fingerprint (another user already claimed bonus with this device)
  IF p_fingerprint IS NOT NULL THEN
    PERFORM 1 FROM users
      WHERE signup_fingerprint = p_fingerprint
        AND bonus_claimed = TRUE
        AND id != p_user_id;
    IF FOUND THEN
      -- Still store the fingerprint, but mark as ineligible (no bonus)
      UPDATE users SET
        signup_fingerprint = p_fingerprint,
        signup_ip = p_ip,
        normalized_email = v_normalized_email,
        updated_at = NOW()
      WHERE id = p_user_id;
      RETURN jsonb_build_object('granted', FALSE, 'reason', 'duplicate_fingerprint');
    END IF;
  END IF;

  -- Check for duplicate normalized email
  IF v_normalized_email IS NOT NULL THEN
    PERFORM 1 FROM users
      WHERE normalized_email = v_normalized_email
        AND bonus_claimed = TRUE
        AND id != p_user_id;
    IF FOUND THEN
      UPDATE users SET
        signup_fingerprint = p_fingerprint,
        signup_ip = p_ip,
        normalized_email = v_normalized_email,
        updated_at = NOW()
      WHERE id = p_user_id;
      RETURN jsonb_build_object('granted', FALSE, 'reason', 'duplicate_email');
    END IF;
  END IF;

  v_wagering := v_config.signup_bonus_amount * v_config.wagering_multiplier;
  v_expires_at := NOW() + (v_config.expiry_days || ' days')::INTERVAL;

  -- Grant the bonus
  UPDATE users SET
    bonus_balance = v_config.signup_bonus_amount,
    wagering_remaining = v_wagering,
    bonus_expires_at = v_expires_at,
    bonus_claimed = TRUE,
    signup_fingerprint = p_fingerprint,
    signup_ip = p_ip,
    normalized_email = v_normalized_email,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Increment global counter
  UPDATE bonus_config SET
    signups_claimed = signups_claimed + 1,
    updated_at = NOW()
  WHERE id = 1;

  -- Log as transaction
  INSERT INTO transactions (user_id, type, amount, balance_after, currency, status, confirmed_at, metadata)
  VALUES (
    p_user_id,
    'bonus'::tx_type,
    v_config.signup_bonus_amount,
    v_user.balance,  -- cash balance unchanged
    'USD',
    'confirmed',
    NOW(),
    jsonb_build_object(
      'source', 'signup_bonus',
      'bonus_balance', v_config.signup_bonus_amount,
      'wagering_required', v_wagering,
      'expires_at', v_expires_at
    )
  );

  RETURN jsonb_build_object(
    'granted', TRUE,
    'bonus_amount', v_config.signup_bonus_amount,
    'wagering_required', v_wagering,
    'expires_at', v_expires_at,
    'signups_remaining', v_config.signup_cap - v_config.signups_claimed - 1
  );
END;
$$ LANGUAGE plpgsql;

-- Place a race bet atomically with bonus-aware balance handling.
-- Returns jsonb with success, cash_balance, bonus_balance, wagering_remaining,
-- bonus_converted (bool — whether bonus just unlocked this bet).
--
-- Logic:
--   1. Check bonus expiry — if expired, zero it out
--   2. Check max bet while bonus active ($5)
--   3. Debit cash first, fall back to bonus
--   4. If bet came from bonus AND odds >= min_odds, decrement wagering_remaining
--   5. If wagering_remaining hits 0, convert full bonus_balance -> cash
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

  -- Decrement wagering_remaining on any bet (cash OR bonus) so long as:
  --   - bonus is still active
  --   - odds meet the minimum threshold
  IF v_bonus_active AND p_odds >= v_config.min_odds_to_count THEN
    v_new_wagering := GREATEST(0, v_new_wagering - p_amount);
    v_wagering_counted := TRUE;
  END IF;

  -- If wagering now 0 and bonus balance > 0, convert bonus -> cash
  IF v_new_wagering = 0 AND v_user.wagering_remaining > 0 AND v_new_bonus > 0 THEN
    v_new_cash := v_new_cash + v_new_bonus;
    v_new_bonus := 0;
    v_bonus_converted := TRUE;
  END IF;

  -- Update user
  -- Note: total_wagered_since_signup is added by migration 014. We use a
  -- defensive UPDATE so this migration works whether 014 has run yet.
  UPDATE users SET
    balance = v_new_cash,
    bonus_balance = v_new_bonus,
    wagering_remaining = v_new_wagering,
    total_wagered = total_wagered + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Insert the bet row
  INSERT INTO race_bets (user_id, race_id, horse_id, amount, locked_odds, potential_payout, bet_type)
  VALUES (p_user_id, p_race_id, p_horse_id, p_amount, p_odds, p_potential_payout, p_bet_type)
  RETURNING id INTO v_bet_id;

  -- Log as transaction
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

  -- Increment race totals
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

-- Convenience: return current bonus config to clients
CREATE OR REPLACE FUNCTION get_bonus_config() RETURNS JSONB AS $$
DECLARE
  v_config bonus_config%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM bonus_config WHERE id = 1;
  RETURN jsonb_build_object(
    'signup_bonus_amount', v_config.signup_bonus_amount,
    'wagering_multiplier', v_config.wagering_multiplier,
    'max_bet_while_bonus', v_config.max_bet_while_bonus,
    'min_odds_to_count', v_config.min_odds_to_count,
    'expiry_days', v_config.expiry_days,
    'signups_remaining', GREATEST(0, v_config.signup_cap - v_config.signups_claimed),
    'enabled', v_config.enabled
  );
END;
$$ LANGUAGE plpgsql STABLE;
