-- Allow multiple bets per category per round
-- Users can now bet on rock AND paper in the same round
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_user_id_round_id_bet_category_key;
