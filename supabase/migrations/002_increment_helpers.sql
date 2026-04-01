-- Atomic increment of round bet totals
CREATE OR REPLACE FUNCTION increment_round_bets(
  p_round_id UUID,
  p_amount NUMERIC
) RETURNS void AS $$
BEGIN
  UPDATE rounds SET
    total_bet_amount = total_bet_amount + p_amount,
    bet_count = bet_count + 1
  WHERE id = p_round_id;
END;
$$ LANGUAGE plpgsql;

-- Atomic increment of user total_wagered
CREATE OR REPLACE FUNCTION increment_wagered(
  p_user_id UUID,
  p_amount NUMERIC
) RETURNS void AS $$
BEGIN
  UPDATE users SET
    total_wagered = total_wagered + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;
