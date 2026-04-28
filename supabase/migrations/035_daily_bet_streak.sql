-- ============================================
-- 035_daily_bet_streak.sql
-- Daily bet streak — engagement metric for retention.
--
-- A "streak day" is any UTC calendar day on which the user has at least one
-- settled bet (won or lost; cancelled does NOT count). Cash vs bonus stake
-- doesn't matter — this is engagement, not skill.
--
-- DATA MODEL:
--   users.current_streak    INT       — days in current streak (0 = none)
--   users.longest_streak    INT       — best streak ever (mirror)
--   users.last_streak_day   DATE      — UTC date of the most recent streak day
--
-- UPDATE RULE (applied on bet settle):
--   today  = CURRENT_DATE (UTC)
--   last   = users.last_streak_day
--
--   if last IS NULL or last < today - 1 day
--      → current_streak := 1, last_streak_day := today
--   if last = today
--      → no-op (already counted today)
--   if last = today - 1 day
--      → current_streak := current_streak + 1, last_streak_day := today
--
--   longest_streak := GREATEST(longest_streak, current_streak)
--
-- IDEMPOTENCY: the rule itself is idempotent (today vs last comparison) — many
-- bet settlements per day for the same user resolve to a single bump.
--
-- Extends settle_race() to call bump_bet_streak() once per bet. Cheaper to
-- call per bet than to dedupe per-user in PL/pgSQL — at 480 races/day × ~10
-- bets/race the overhead is trivial and idempotency does the right thing.
--
-- Safe to re-run.
-- ============================================

-- --------------------------------------------
-- 1. SCHEMA
-- --------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_streak  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak  INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_day DATE,
  ADD COLUMN IF NOT EXISTS last_streak_nudge_at TIMESTAMPTZ;

-- Lookup helper for the streak-at-risk cron — find users whose streak is
-- "yesterday" and was already meaningful (>=3).
CREATE INDEX IF NOT EXISTS idx_users_streak_at_risk
  ON users (last_streak_day)
  WHERE current_streak >= 3;

-- --------------------------------------------
-- 2. BUMP STREAK
-- --------------------------------------------
CREATE OR REPLACE FUNCTION bump_bet_streak(p_user_id UUID)
RETURNS INT AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_last  DATE;
  v_curr  INT;
  v_long  INT;
  v_new_curr INT;
BEGIN
  SELECT last_streak_day, current_streak, longest_streak
    INTO v_last, v_curr, v_long
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Already counted today — no-op.
  IF v_last = v_today THEN
    RETURN v_curr;
  END IF;

  -- Continuing yesterday's streak.
  IF v_last = v_today - INTERVAL '1 day' THEN
    v_new_curr := v_curr + 1;
  ELSE
    -- Either first ever bet, or a gap of >= 1 day → reset to 1.
    v_new_curr := 1;
  END IF;

  UPDATE users SET
    current_streak  = v_new_curr,
    longest_streak  = GREATEST(v_long, v_new_curr),
    last_streak_day = v_today,
    updated_at      = NOW()
    WHERE id = p_user_id;

  RETURN v_new_curr;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------
-- 3. SETTLE_RACE — extend to bump streak per bet
-- --------------------------------------------
-- Builds on the rakeback-aware settle_race from migration 028 + 033.
-- The only addition: PERFORM bump_bet_streak(bet.user_id) inside the loop.
-- Wrapped in BEGIN/EXCEPTION so any streak failure cannot block settlement.
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
  UPDATE races SET
    status = 'settled',
    winning_horse_id = p_winning_horse_id,
    server_seed = p_server_seed,
    settled_at = NOW()
  WHERE id = p_race_id;

  SELECT * INTO v_config FROM bonus_config WHERE id = 1;

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
          'to_cash', v_cash_portion,
          'to_bonus', v_bonus_portion,
          'bonus_ratio', v_bonus_ratio
        )
      );
    END IF;

    -- Accrue rakeback on every settled bet (cash portion only — see mig 033).
    BEGIN
      PERFORM accrue_rakeback(bet.user_id, bet.id, bet.amount);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Bump the user's daily bet streak. Idempotent within a UTC day, so
    -- multiple bets per day resolve to a single bump cheaply.
    BEGIN
      PERFORM bump_bet_streak(bet.user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    UPDATE races SET
      total_payout = total_payout + payout_amount
    WHERE id = p_race_id;
  END LOOP;

  UPDATE races SET
    house_profit = total_bet_amount - total_payout
  WHERE id = p_race_id;
END;
$$ LANGUAGE plpgsql;
