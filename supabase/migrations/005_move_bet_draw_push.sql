-- Fix move bet settlement: draw = push (refund) for ALL bet types
-- This corrects the house edge from ~35% to 3% on move bets
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

    IF p_result = 'draw' THEN
      -- ALL bets push on draw (move bets AND player bets)
      -- Draw bet type is the only one that WINS on draw
      IF bet.bet_type = 'draw' THEN
        bet_result := 'won';
        payout_amount := bet.amount * bet.multiplier;
      ELSE
        bet_result := 'push';
        payout_amount := bet.amount;
      END IF;

    ELSE
      -- Non-draw round
      IF bet.bet_type = 'draw' THEN
        -- Draw bet loses on non-draw rounds
        bet_result := 'lost';
        payout_amount := 0;

      ELSIF bet.bet_category = 'move' THEN
        -- Move bets: win if the winning move matches
        IF (bet.bet_type = 'rock' AND p_winning_move = 'rock')
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
        -- Player bets: win if the winning player matches
        IF (bet.bet_type = 'violet' AND p_result = 'violet_win')
           OR (bet.bet_type = 'magenta' AND p_result = 'magenta_win')
        THEN
          bet_result := 'won';
          payout_amount := bet.amount * bet.multiplier;
        ELSE
          bet_result := 'lost';
          payout_amount := 0;
        END IF;
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
