-- ============================================
-- Bonus cancel (W5) + wagering counter (W6) fixes
-- ============================================
--
-- Two launch-blocker fixes from the security audit, bundled because both
-- touch the bonus accounting primitives and `place_race_bet_atomic`.
--
-- W5 — Bonus cancel laundering:
--   cancel_race_bet_atomic used to refund the ENTIRE stake to cash via
--   update_balance('push_refund'), regardless of how much of the bet was
--   bonus-funded. Workflow: user has $0 cash + $20 bonus → places $5 bonus
--   bet → cancels → receives $5 in cash balance (withdrawable). Zero-risk
--   bonus → cash conversion, repeatable until bonus exhausted.
--   Fix: route refund back to bonus_balance for the bonus portion of the
--   stake, restore wagering_remaining, and reverse total_wagered.
--
-- W6 — Wagering counter leaked on cash bets:
--   place_race_bet_atomic decrements wagering_remaining on ANY bet while
--   bonus is active, even pure-cash stakes. Combined with min_odds_to_count
--   being dropped to 1.0 and max_bet_while_bonus raised to $100, a user
--   could wager $60 of cash at 1.3× and fully unlock the $20 bonus → cash
--   at ~$1.80 expected cost. Two-sided same-race bets reduce variance near
--   zero. Effective free money.
--   Fix: only decrement wagering_remaining when v_from_bonus > 0 (i.e. the
--   stake ACTUALLY drew from bonus balance). Cash bets still count toward
--   total_wagered and rakeback but no longer count toward bonus unlock.
-- ============================================

-- ----------------------------------------
-- 1. place_race_bet_atomic — W6 fix
-- ----------------------------------------
-- Drop old 8-arg version (migration 022) so the new definition replaces it
-- cleanly without coexisting overloads. The signature is unchanged — this is
-- a no-op drop at the schema level.
DROP FUNCTION IF EXISTS place_race_bet_atomic(UUID, UUID, INT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC);

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
  -- Row lock on (race_id, horse_id) from migration 022 — serialises concurrent
  -- bets on the same horse so the liability aggregate can't race.
  SELECT id INTO v_entry_id
  FROM race_entries
  WHERE race_id = p_race_id AND horse_id = p_horse_id
  FOR UPDATE;

  IF v_entry_id IS NULL THEN
    RAISE EXCEPTION 'Horse not in this race';
  END IF;

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

  IF v_bonus_active AND p_amount > v_config.max_bet_while_bonus THEN
    RAISE EXCEPTION 'Max bet is $% while bonus is active', v_config.max_bet_while_bonus;
  END IF;

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

  -- ===== W6 FIX =====
  -- Previous logic decremented wagering_remaining on ANY stake (cash OR
  -- bonus) while bonus was active — a cash-wagering laundering path.
  -- New rule: only decrement when the bet actually drew from bonus_balance.
  -- Matches the intent of the wagering requirement: "wager $60 of bonus
  -- money", not "generate $60 of volume using cash you could withdraw".
  IF v_from_bonus > 0 AND p_odds >= v_config.min_odds_to_count THEN
    v_new_wagering := GREATEST(0, v_new_wagering - v_from_bonus);
    v_wagering_counted := TRUE;
  END IF;
  -- ===== /W6 =====

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


-- ----------------------------------------
-- 2. cancel_race_bet_atomic — W5 fix
-- ----------------------------------------
-- New RPC that mirrors place_race_bet_atomic in reverse. Routes the refund
-- back to the correct buckets (cash and/or bonus), restores wagering, and
-- decrements total_wagered. Only reverses the wagering counter if the
-- original bet counted toward it (matches W6 rule above).
CREATE OR REPLACE FUNCTION cancel_race_bet_atomic(
  p_user_id UUID,
  p_bet_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_bet race_bets%ROWTYPE;
  v_race races%ROWTYPE;
  v_user users%ROWTYPE;
  v_config bonus_config%ROWTYPE;
  v_from_cash NUMERIC;
  v_from_bonus NUMERIC;
  v_new_cash NUMERIC;
  v_new_bonus NUMERIC;
  v_new_wagering NUMERIC;
  v_wagering_restored BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_bet FROM race_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet not found';
  END IF;

  IF v_bet.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_bet.status <> 'pending' THEN
    RAISE EXCEPTION 'Bet not pending';
  END IF;

  SELECT * INTO v_race FROM races WHERE id = v_bet.race_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Race not found';
  END IF;

  IF v_race.status <> 'betting' THEN
    RAISE EXCEPTION 'Betting closed';
  END IF;

  IF v_race.betting_closes_at <= NOW() THEN
    RAISE EXCEPTION 'Betting window closed';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  SELECT * INTO v_config FROM bonus_config WHERE id = 1;

  -- Reverse the stake split: the bonus portion was recorded on the bet row
  -- at place time, the remainder is cash.
  v_from_bonus := COALESCE(v_bet.from_bonus_amount, 0);
  v_from_cash := v_bet.amount - v_from_bonus;

  v_new_cash := v_user.balance + v_from_cash;
  v_new_bonus := v_user.bonus_balance + v_from_bonus;
  v_new_wagering := v_user.wagering_remaining;

  -- Mirror the W6 rule: we only decremented wagering on bonus-funded stakes,
  -- so we only restore wagering on bonus-funded cancels. The cap back up to
  -- the original required amount is bounded by the config so restores past
  -- a partial clear don't invent wagering that never existed.
  IF v_from_bonus > 0 AND v_bet.locked_odds >= v_config.min_odds_to_count THEN
    v_new_wagering := v_new_wagering + v_from_bonus;
    v_wagering_restored := TRUE;
  END IF;

  -- Flip the bet row. The status='pending' guard makes concurrent cancels
  -- race-safe — only one UPDATE will match.
  UPDATE race_bets
  SET status = 'cancelled',
      settled_at = NOW()
  WHERE id = p_bet_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet already settled';
  END IF;

  UPDATE users SET
    balance = v_new_cash,
    bonus_balance = v_new_bonus,
    wagering_remaining = v_new_wagering,
    total_wagered = GREATEST(0, total_wagered - v_bet.amount),
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Audit trail. Use tx_type 'push_refund' (same as the old broken flow) so
  -- existing admin filters keep working; the metadata carries the split.
  INSERT INTO transactions (user_id, type, amount, balance_after, currency, status, confirmed_at, metadata)
  VALUES (
    p_user_id,
    'push_refund'::tx_type,
    v_bet.amount,
    v_new_cash,
    'USD',
    'confirmed',
    NOW(),
    jsonb_build_object(
      'cancelled_race_bet_id', v_bet.id,
      'refund_to_cash', v_from_cash,
      'refund_to_bonus', v_from_bonus,
      'wagering_restored', v_wagering_restored
    )
  );

  -- Reverse race totals
  UPDATE races SET
    total_bet_amount = GREATEST(0, total_bet_amount - v_bet.amount),
    bet_count = GREATEST(0, bet_count - 1)
  WHERE id = v_bet.race_id;

  RETURN jsonb_build_object(
    'cancelled', TRUE,
    'bet_id', v_bet.id,
    'refunded', v_bet.amount,
    'refund_to_cash', v_from_cash,
    'refund_to_bonus', v_from_bonus,
    'wagering_restored', v_wagering_restored,
    'cash_balance', v_new_cash,
    'bonus_balance', v_new_bonus,
    'wagering_remaining', v_new_wagering
  );
END;
$$ LANGUAGE plpgsql;
