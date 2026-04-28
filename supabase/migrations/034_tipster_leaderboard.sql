-- ============================================
-- 034_tipster_leaderboard.sql
-- Tipster leaderboard — ROI ranking over settled bets in a time window.
--
-- Public-facing board on /leaderboard. Same function powers the weekly
-- email recap so the two systems can never drift.
--
-- METHOD:
--   For each user with a non-null username and >= MIN_BETS settled bets in
--   the window with >= MIN_CASH_STAKED cash actually wagered (bonus stake
--   excluded — matches rakeback semantics), compute:
--
--     cash_staked  = SUM(amount - from_bonus_amount)        (cash portion only)
--     cash_returned = SUM(payout * cash_ratio)              (apportioned)
--     roi          = (cash_returned - cash_staked) / cash_staked
--
--   Return top N ranked by ROI desc, with bet count and biggest single payout
--   for UI display.
--
--   Where cash_ratio per bet = (amount - from_bonus_amount) / amount
--   (bounded to [0, 1]). Apportions winnings between cash and bonus stake
--   the same way settle_race does. Pure cash-skill metric.
--
-- WHY VOLUME FLOORS:
--   Without floors a user can bet $1 once at 50:1, win, and top the board
--   with infinite ROI. The MIN_BETS + MIN_CASH_STAKED gate filters out
--   noise without being so high that a fresh launch shows an empty board.
--   Tunable as volume grows.
--
-- WINDOWS:
--   p_window: 'day' | 'week' | 'month' | 'all'
--   - day   = last 24h
--   - week  = last 7d
--   - month = last 30d
--   - all   = unbounded
--
-- Safe to re-run (CREATE OR REPLACE).
-- ============================================

CREATE OR REPLACE FUNCTION tipster_leaderboard(
  p_window TEXT DEFAULT 'week',
  p_limit  INT DEFAULT 10,
  p_min_bets INT DEFAULT 10,
  p_min_cash NUMERIC DEFAULT 50
)
RETURNS TABLE (
  user_id        UUID,
  username       TEXT,
  bet_count      INT,
  cash_staked    NUMERIC,
  cash_returned  NUMERIC,
  net_profit     NUMERIC,
  roi            NUMERIC,
  biggest_payout NUMERIC
) AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
BEGIN
  v_cutoff := CASE p_window
    WHEN 'day'   THEN NOW() - INTERVAL '1 day'
    WHEN 'week'  THEN NOW() - INTERVAL '7 days'
    WHEN 'month' THEN NOW() - INTERVAL '30 days'
    WHEN 'all'   THEN NULL
    ELSE NOW() - INTERVAL '7 days'
  END;

  RETURN QUERY
  WITH bets AS (
    SELECT
      rb.user_id,
      rb.amount,
      rb.from_bonus_amount,
      COALESCE(rb.payout, 0) AS payout,
      -- cash portion of the stake. Negative-guard via GREATEST.
      GREATEST(0, rb.amount - COALESCE(rb.from_bonus_amount, 0)) AS cash_stake,
      CASE WHEN rb.amount > 0
        THEN GREATEST(0, rb.amount - COALESCE(rb.from_bonus_amount, 0)) / rb.amount
        ELSE 0
      END AS cash_ratio,
      rb.status
    FROM race_bets rb
    WHERE rb.status IN ('won', 'lost')
      AND (v_cutoff IS NULL OR rb.settled_at >= v_cutoff)
  ),
  agg AS (
    SELECT
      b.user_id,
      COUNT(*)::INT                                    AS bet_count,
      SUM(b.cash_stake)                                AS cash_staked,
      SUM(b.payout * b.cash_ratio)                     AS cash_returned,
      MAX(b.payout * b.cash_ratio)                     AS biggest_payout
    FROM bets b
    GROUP BY b.user_id
  )
  SELECT
    a.user_id,
    u.username,
    a.bet_count,
    ROUND(a.cash_staked,    2) AS cash_staked,
    ROUND(a.cash_returned,  2) AS cash_returned,
    ROUND(a.cash_returned - a.cash_staked, 2) AS net_profit,
    CASE WHEN a.cash_staked > 0
      THEN ROUND(((a.cash_returned - a.cash_staked) / a.cash_staked) * 100, 2)
      ELSE 0
    END AS roi,
    ROUND(a.biggest_payout, 2) AS biggest_payout
  FROM agg a
  JOIN users u ON u.id = a.user_id
  WHERE u.username IS NOT NULL
    AND u.is_banned = FALSE
    AND a.bet_count >= p_min_bets
    AND a.cash_staked >= p_min_cash
  ORDER BY (a.cash_returned - a.cash_staked) / NULLIF(a.cash_staked, 0) DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helpful index — supports the bets CTE filter on settled_at + status.
-- Most workloads hit this with a 7d cutoff so partial index is appropriate.
CREATE INDEX IF NOT EXISTS idx_race_bets_settled_won_lost
  ON race_bets (settled_at DESC)
  WHERE status IN ('won', 'lost');
