-- ============================================
-- Idempotent race settlement
-- ============================================
--
-- Public state polling, Vercel cron retries, and manual admin force-ticks can
-- all converge on the same race boundary. Settlement must therefore be safe at
-- the database boundary, not only via per-process in-memory locks.
--
-- settle_race_once() atomically claims a race by moving exactly one row from
-- racing -> settled, then pays only bets still marked pending. If another
-- caller already claimed the race, it returns false and performs no side
-- effects. The legacy settle_race() RPC is kept as a void wrapper for callers
-- that still use the old contract.
-- ============================================

CREATE OR REPLACE FUNCTION settle_race_once(
  p_race_id UUID,
  p_winning_horse_id INT,
  p_server_seed TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  bet RECORD;
  claimed_race races%ROWTYPE;
  settled_bet race_bets%ROWTYPE;
  payout_amount NUMERIC;
  bet_result race_bet_status;
  horse_finish INT;
  v_bonus_ratio NUMERIC;
  v_cash_portion NUMERIC;
  v_bonus_portion NUMERIC;
  v_user users%ROWTYPE;
  v_new_bonus NUMERIC;
  v_new_cash NUMERIC;
  v_total_payout NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM race_entries
    WHERE race_id = p_race_id
      AND horse_id = p_winning_horse_id
      AND finish_position = 1
  ) THEN
    RAISE EXCEPTION 'Winning horse does not match recorded finish order';
  END IF;

  UPDATE races SET
    status = 'settled',
    winning_horse_id = p_winning_horse_id,
    server_seed = p_server_seed,
    settled_at = COALESCE(settled_at, NOW())
  WHERE id = p_race_id
    AND status = 'racing'
  RETURNING * INTO claimed_race;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  FOR bet IN
    SELECT *
    FROM race_bets
    WHERE race_id = p_race_id
      AND status = 'pending'
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
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
    WHERE id = bet.id
      AND status = 'pending'
    RETURNING * INTO settled_bet;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF payout_amount > 0 THEN
      v_bonus_ratio := CASE
        WHEN bet.amount > 0 THEN COALESCE(bet.from_bonus_amount, 0) / bet.amount
        ELSE 0
      END;

      v_bonus_portion := ROUND((payout_amount * v_bonus_ratio)::numeric, 8);
      v_cash_portion := payout_amount - v_bonus_portion;

      SELECT * INTO v_user FROM users WHERE id = bet.user_id FOR UPDATE;

      IF v_bonus_portion > 0 AND (v_user.bonus_expires_at IS NULL OR v_user.bonus_expires_at > NOW()) THEN
        v_new_bonus := v_user.bonus_balance + v_bonus_portion;
      ELSE
        v_new_bonus := v_user.bonus_balance;
        IF v_bonus_portion > 0 THEN
          v_cash_portion := v_cash_portion + v_bonus_portion;
        END IF;
      END IF;

      v_new_cash := v_user.balance + v_cash_portion;

      IF v_user.wagering_remaining = 0 AND v_new_bonus > 0 THEN
        v_new_cash := v_new_cash + v_new_bonus;
        v_new_bonus := 0;
      END IF;

      UPDATE users SET
        balance = v_new_cash,
        bonus_balance = v_new_bonus,
        updated_at = NOW()
      WHERE id = bet.user_id;

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
          'race_id', p_race_id,
          'to_cash', v_cash_portion,
          'to_bonus', v_bonus_portion,
          'bonus_ratio', v_bonus_ratio
        )
      );
    END IF;

    BEGIN
      PERFORM accrue_rakeback(bet.user_id, bet.id, bet.amount);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM bump_bet_streak(bet.user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  SELECT COALESCE(SUM(COALESCE(payout, 0)), 0) INTO v_total_payout
  FROM race_bets
  WHERE race_id = p_race_id
    AND status IN ('won', 'lost');

  UPDATE races SET
    total_payout = v_total_payout,
    house_profit = total_bet_amount - v_total_payout
  WHERE id = p_race_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION settle_race(
  p_race_id UUID,
  p_winning_horse_id INT,
  p_server_seed TEXT
) RETURNS void AS $$
BEGIN
  PERFORM settle_race_once(p_race_id, p_winning_horse_id, p_server_seed);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION settle_race_once(UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION settle_race(UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION settle_race_once(UUID, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION settle_race(UUID, INT, TEXT) TO service_role;
