-- ============================================
-- Loosen signup bonus restrictions.
-- ============================================
--
-- Pre-launch tuning based on playtesting feedback:
--   - max_bet_while_bonus: $5 → $100 (effectively lifted — same as global max bet)
--   - min_odds_to_count: 2.0 → 1.0 (any winning-odds bet counts toward wagering)
--
-- Wagering multiplier (3x) and expiry (14 days) are unchanged.
-- ============================================

UPDATE bonus_config
SET
  max_bet_while_bonus = 100,
  min_odds_to_count = 1.0,
  updated_at = NOW()
WHERE id = 1;
