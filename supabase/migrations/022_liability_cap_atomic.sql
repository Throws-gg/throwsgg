-- ============================================
-- Move per-horse liability cap inside place_race_bet_atomic
-- ============================================
--
-- Launch-blocker fix (Scout 1 T1 — TOCTOU race):
-- The previous flow checked `sum(potential_payout) + new_payout <= cap` in
-- the Next.js API route BEFORE calling place_race_bet_atomic. Two concurrent
-- bets could both read `sum = X`, both see `X + new <= cap`, both insert —
-- blowing past the documented cap.
--
-- Worst observed per the spec: 10 concurrent $1 @ 100× = $1.6K on a horse
-- whose configured cap was $720. At scale this is a single-race
-- house-breaking event (max payout per horse >> bankroll).
--
-- Fix: do the liability aggregate INSIDE the RPC, under a row-level lock on
-- the (race_id, horse_id) race_entries row. All concurrent bets on the same
-- horse now serialize on that lock; the sum-and-compare is race-free.
-- ============================================

CREATE OR REPLACE FUNCTION place_race_bet_atomic(
  p_user_id UUID,
  p_race_id UUID,
  p_horse_id INT,
  p_amount NUMERIC,
  p_odds NUMERIC,
  p_potential_payout NUMERIC,
  p_bet_type TEXT,
  p_max_liability NUMERIC DEFAULT NULL
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
  v_current_liability NUMERIC := 0;
  v_entry_id UUID;
BEGIN
  -- Serialize concurrent bets on (race_id, horse_id). Every bet on this horse
  -- in this race waits on this row lock before computing liability, so the
  -- aggregate read below cannot race.
  SELECT id INTO v_entry_id
  FROM race_entries
  WHERE race_id = p_race_id AND horse_id = p_horse_id
  FOR UPDATE;

  IF v_entry_id IS NULL THEN
    RAISE EXCEPTION 'Horse not in this race';
  END IF;

  -- Liability cap (skip if caller passes NULL — keeps the RPC usable from
  -- admin tooling without a cap, but every production path passes one).
  IF p_max_liability IS NOT NULL THEN
    SELECT COALESCE(SUM(potential_payout), 0) INTO v_current_liability
    FROM race_bets
    WHERE race_id = p_race_id
      AND horse_id = p_horse_id
      AND status = 'pending';

    IF v_current_liability + p_potential_payout > p_max_liability THEN
      RAISE EXCEPTION 'LIABILITY_EXCEEDED:%:%', p_max_liability, v_current_liability;
    END IF;
  END IF;

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

  UPDATE users SET
    balance = v_new_cash,
    bonus_balance = v_new_bonus,
    wagering_remaining = v_new_wagering,
    total_wagered = total_wagered + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO race_bets (user_id, race_id, horse_id, amount, locked_odds, potential_payout, bet_type, from_bonus_amount)
  VALUES (p_user_id, p_race_id, p_horse_id, p_amount, p_odds, p_potential_payout, p_bet_type, v_from_bonus)
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
