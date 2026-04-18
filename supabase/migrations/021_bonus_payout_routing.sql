-- ============================================
-- Route bonus-funded bet winnings back to bonus_balance
-- ============================================
--
-- Launch-blocker fix: previously, ALL winning bets credited cash balance
-- via update_balance(), even when the stake came from bonus_balance.
-- This let users withdraw bonus winnings immediately without clearing
-- the 3x wagering requirement — a classic bonus-abuse hole.
--
-- Fix: track the bonus portion of each bet in race_bets.from_bonus_amount,
-- then on settlement route the payout proportionally:
--   - Cash-funded bets → cash balance (unchanged)
--   - Bonus-funded bets → bonus_balance (stays locked until wagering_remaining = 0)
--   - Mixed bets → payout split proportionally by the funding ratio
--
-- Once wagering_remaining hits 0 (handled in place_race_bet_atomic already),
-- bonus_balance converts to cash in one shot.
-- ============================================

-- 1. Add column to track how much of each bet came from bonus.
ALTER TABLE race_bets
  ADD COLUMN IF NOT EXISTS from_bonus_amount NUMERIC(18, 8) NOT NULL DEFAULT 0;

-- 2. Update place_race_bet_atomic to persist from_bonus_amount on each bet row.
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

  UPDATE users SET
    balance = v_new_cash,
    bonus_balance = v_new_bonus,
    wagering_remaining = v_new_wagering,
    total_wagered = total_wagered + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Insert the bet row, including the bonus portion of the stake
  INSERT INTO race_bets (user_id, race_id, horse_id, amount, locked_odds, potential_payout, bet_type, from_bonus_amount)
  VALUES (p_user_id, p_race_id, p_horse_id, p_amount, p_odds, p_potential_payout, p_bet_type, v_from_bonus)
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

-- 3. Update settle_race to route payouts based on the bonus ratio of the stake.
--    Bonus-portion winnings go to bonus_balance; cash-portion winnings go to cash.
--    If the entire bonus converts (wagering_remaining hits 0), move it to cash.
CREATE OR REPLACE FUNCTION settle_race(
  p_race_id UUID,
  p_winning_horse_id INT,
  p_server_seed TEXT
) RETURNS void AS $$
DECLARE
  bet RECORD;
  payout_amount NUMERIC;
  bet_result race_bet_status;
  horse_finish INT;
  v_bonus_ratio NUMERIC;
  v_cash_portion NUMERIC;
  v_bonus_portion NUMERIC;
  v_user users%ROWTYPE;
  v_config bonus_config%ROWTYPE;
  v_new_bonus NUMERIC;
  v_new_cash NUMERIC;
BEGIN
  -- Update race status
  UPDATE races SET
    status = 'settled',
    winning_horse_id = p_winning_horse_id,
    server_seed = p_server_seed,
    settled_at = NOW()
  WHERE id = p_race_id;

  SELECT * INTO v_config FROM bonus_config WHERE id = 1;

  -- Settle each bet
  FOR bet IN SELECT * FROM race_bets WHERE race_id = p_race_id AND status = 'pending' LOOP
    SELECT finish_position INTO horse_finish
    FROM race_entries
    WHERE race_id = p_race_id AND horse_id = bet.horse_id;

    IF bet.bet_type = 'win' AND horse_finish = 1 THEN
      bet_result := 'won';
      payout_amount := bet.amount * bet.locked_odds;
    ELSIF bet.bet_type = 'place' AND horse_finish <= 2 THEN
      bet_result := 'won';
      payout_amount := bet.amount * bet.locked_odds;
    ELSIF bet.bet_type = 'show' AND horse_finish <= 3 THEN
      bet_result := 'won';
      payout_amount := bet.amount * bet.locked_odds;
    ELSE
      bet_result := 'lost';
      payout_amount := 0;
    END IF;

    UPDATE race_bets SET
      status = bet_result,
      payout = payout_amount,
      settled_at = NOW()
    WHERE id = bet.id;

    -- Credit winner
    IF payout_amount > 0 THEN
      -- What fraction of the stake came from bonus? 0 for pure cash bets,
      -- 1 for pure bonus bets, somewhere between for mixed.
      v_bonus_ratio := CASE
        WHEN bet.amount > 0 THEN COALESCE(bet.from_bonus_amount, 0) / bet.amount
        ELSE 0
      END;

      v_bonus_portion := ROUND((payout_amount * v_bonus_ratio)::numeric, 8);
      v_cash_portion := payout_amount - v_bonus_portion;

      -- Lock the user row and read current state
      SELECT * INTO v_user FROM users WHERE id = bet.user_id FOR UPDATE;

      -- Bonus portion → bonus_balance (unless bonus has expired; then forfeit it
      -- to avoid leaking stuck funds into a dead bonus).
      IF v_bonus_portion > 0 AND (v_user.bonus_expires_at IS NULL OR v_user.bonus_expires_at > NOW()) THEN
        v_new_bonus := v_user.bonus_balance + v_bonus_portion;
      ELSE
        v_new_bonus := v_user.bonus_balance;
        -- If bonus expired but we were about to credit to it, redirect to cash
        -- rather than silently burning the user's winnings.
        IF v_bonus_portion > 0 THEN
          v_cash_portion := v_cash_portion + v_bonus_portion;
        END IF;
      END IF;

      v_new_cash := v_user.balance + v_cash_portion;

      -- If wagering is already 0 AND bonus_balance has content, unlock the whole
      -- bonus into cash (matches the conversion logic in place_race_bet_atomic).
      IF v_user.wagering_remaining = 0 AND v_new_bonus > 0 THEN
        v_new_cash := v_new_cash + v_new_bonus;
        v_new_bonus := 0;
      END IF;

      UPDATE users SET
        balance = v_new_cash,
        bonus_balance = v_new_bonus,
        updated_at = NOW()
      WHERE id = bet.user_id;

      -- Log the payout transaction (balance_after = new cash balance)
      INSERT INTO transactions (user_id, type, amount, balance_after, currency, status, confirmed_at, metadata)
      VALUES (
        bet.user_id,
        'payout'::tx_type,
        payout_amount,
        v_new_cash,
        'USD',
        'confirmed',
        NOW(),
        jsonb_build_object(
          'race_bet_id', bet.id,
          'to_cash', v_cash_portion,
          'to_bonus', v_bonus_portion,
          'bonus_ratio', v_bonus_ratio
        )
      );
    END IF;

    UPDATE races SET
      total_payout = total_payout + payout_amount
    WHERE id = p_race_id;
  END LOOP;

  UPDATE races SET
    house_profit = total_bet_amount - total_payout
  WHERE id = p_race_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Backfill: existing pending bets have from_bonus_amount = 0 by default,
--    which matches their behaviour before this migration (payout to cash).
--    Already-settled bets are frozen — no need to touch them.
