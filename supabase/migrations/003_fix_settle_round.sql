-- Fix settle_round: cast CASE expression to tx_type enum
CREATE OR REPLACE FUNCTION settle_round(
  p_round_id UUID,
  p_violet_move move,
  p_magenta_move move,
  p_result round_result,
  p_winning_move move,
  p_server_seed TEXT
) RETURNS void AS $$
DECLARE
  bet RECORD;
  payout_amount NUMERIC;
  bet_result bet_status;
  tx_type_val tx_type;
BEGIN
  -- Update the round
  UPDATE rounds SET
    status = 'settled',
    violet_move = p_violet_move,
    magenta_move = p_magenta_move,
    result = p_result,
    winning_move = p_winning_move,
    server_seed = p_server_seed,
    played_at = NOW(),
    settled_at = NOW()
  WHERE id = p_round_id;

  -- Settle each bet
  FOR bet IN SELECT * FROM bets WHERE round_id = p_round_id AND status = 'pending' LOOP
    -- Determine outcome
    IF bet.bet_category = 'move' THEN
      IF (bet.bet_type = 'draw' AND p_result = 'draw')
         OR (bet.bet_type = 'rock' AND p_winning_move = 'rock')
         OR (bet.bet_type = 'paper' AND p_winning_move = 'paper')
         OR (bet.bet_type = 'scissors' AND p_winning_move = 'scissors')
      THEN
        bet_result := 'won';
        payout_amount := bet.amount * bet.multiplier;
      ELSE
        bet_result := 'lost';
        payout_amount := 0;
      END IF;
    ELSE
      -- Player bets: violet/magenta (draw = push)
      IF p_result = 'draw' THEN
        bet_result := 'push';
        payout_amount := bet.amount;
      ELSIF (bet.bet_type = 'violet' AND p_result = 'violet_win')
            OR (bet.bet_type = 'magenta' AND p_result = 'magenta_win')
      THEN
        bet_result := 'won';
        payout_amount := bet.amount * bet.multiplier;
      ELSE
        bet_result := 'lost';
        payout_amount := 0;
      END IF;
    END IF;

    -- Update bet
    UPDATE bets SET
      status = bet_result,
      payout = payout_amount,
      settled_at = NOW()
    WHERE id = bet.id;

    -- Credit user if payout > 0
    IF payout_amount > 0 THEN
      IF bet_result = 'push' THEN
        tx_type_val := 'push_refund';
      ELSE
        tx_type_val := 'payout';
      END IF;

      PERFORM update_balance(
        bet.user_id,
        payout_amount,
        tx_type_val,
        'USD'::TEXT,
        p_round_id,
        bet.id
      );
    END IF;

    -- Update round totals
    UPDATE rounds SET
      total_payout = total_payout + payout_amount
    WHERE id = p_round_id;
  END LOOP;

  -- Calculate house profit
  UPDATE rounds SET
    house_profit = total_bet_amount - total_payout
  WHERE id = p_round_id;
END;
$$ LANGUAGE plpgsql;
