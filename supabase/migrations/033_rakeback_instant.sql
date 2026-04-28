-- ============================================
-- 033_rakeback_instant.sql
-- Convert rakeback from claimable → instant auto-credit per settled bet.
--
-- WHY:
-- The "claim" step in the previous design was friction. Users sat on small
-- balances they forgot to claim. Instant credit makes every losing bet feel
-- like a partial win ("+$0.04 rakeback") and is the single most-copied 2025
-- mechanic among growing crypto casinos. The bankroll cost is identical —
-- we're paying the same rakeback either way, just sooner.
--
-- WHAT CHANGES:
--   1. accrue_rakeback() now credits users.balance directly (not rakeback_claimable)
--   2. Rakeback is computed on the CASH portion of stake only
--      (bet.amount - bet.from_bonus_amount), so bonus-funded wagers earn nothing.
--      This closes a small farming hole: previously a user with $20 bonus could
--      grind 3x wagering and earn rakeback on bonus dollars.
--   3. claim_rakeback() is REPLACED with a back-compat shim that drains any
--      legacy claimable to balance (for safety, in case the old route is hit).
--   4. ONE-SHOT BACKFILL: any user sitting on rakeback_claimable > 0 has it
--      drained to balance with an audit transaction tagged
--      'source=rakeback_backfill_033'.
--
-- WHAT STAYS:
--   - rakeback_accruals ledger (unchanged — still 1 row per bet, source of truth)
--   - rakeback_lifetime tracking
--   - Tier ladder (5/10/15/20/25% of edge at $0/$500/$5K/$25K/$100K)
--   - Columns: rakeback_claimable, last_rakeback_claim_at, last_rakeback_nudge_at
--     left in place (cost nothing, dropping mid-launch is risky).
--
-- TRANSACTIONS TABLE VOLUME:
--   We deliberately do NOT write a transactions row per bet accrual.
--   rakeback_accruals already audits each accrual. Per-bet rows would roughly
--   double tx-row growth (~4.8K extra rows/day at 480 races) and clutter the
--   wallet view. Instead, the weekly recap cron writes ONE aggregate
--   tx row per user per week (source='rakeback_weekly_recap') summing the
--   prior week's accruals.
--
-- ROLLBACK:
--   Re-apply 028_rakeback.sql to restore claimable semantics. accruals ledger
--   is preserved either way. Direct balance credits are not reversed.
--
-- Safe to re-run (CREATE OR REPLACE / idempotent backfill via NOT EXISTS guard).
-- ============================================

-- --------------------------------------------
-- 1. ACCRUE — instant credit to balance
-- --------------------------------------------
-- Idempotent via UNIQUE(race_bet_id) on rakeback_accruals — a settle retry
-- hits unique_violation and bails out. Cash portion of stake only.
CREATE OR REPLACE FUNCTION accrue_rakeback(
  p_user_id     UUID,
  p_race_bet_id UUID,
  p_stake       NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  v_edge_rate NUMERIC := 0.0909;  -- matches OVERROUND = 1.10
  v_total_wagered NUMERIC;
  v_tier_row RECORD;
  v_amount NUMERIC;
  v_from_bonus NUMERIC := 0;
  v_cash_stake NUMERIC;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN
    RETURN 0;
  END IF;

  -- Subtract the bonus-funded portion. Rakeback only earned on real cash wagers.
  SELECT COALESCE(from_bonus_amount, 0) INTO v_from_bonus
    FROM race_bets WHERE id = p_race_bet_id;

  v_cash_stake := p_stake - v_from_bonus;
  IF v_cash_stake <= 0 THEN
    RETURN 0;
  END IF;

  SELECT total_wagered INTO v_total_wagered FROM users WHERE id = p_user_id;
  IF v_total_wagered IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_tier_row FROM rakeback_tier(v_total_wagered);
  v_amount := ROUND((v_cash_stake * v_edge_rate * v_tier_row.tier_pct)::NUMERIC, 8);

  IF v_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Idempotent insert. claimed_at is set immediately because the credit lands
  -- in balance the instant we accrue — there's no "unclaimed" state anymore.
  -- claim_batch_id stays NULL for instant accruals (it groups manual claims).
  BEGIN
    INSERT INTO rakeback_accruals (
      user_id, race_bet_id, stake, edge_rate, tier, tier_pct, amount,
      accrued_at, claimed_at
    ) VALUES (
      p_user_id, p_race_bet_id, v_cash_stake, v_edge_rate,
      v_tier_row.tier, v_tier_row.tier_pct, v_amount,
      NOW(), NOW()
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN 0;
  END;

  -- Direct balance credit. update_balance() would also work but its semantics
  -- include wagering side-effects we don't want here — this is just a top-up.
  UPDATE users
    SET balance           = balance + v_amount,
        rakeback_lifetime = rakeback_lifetime + v_amount,
        updated_at        = NOW()
    WHERE id = p_user_id;

  RETURN v_amount;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------
-- 2. CLAIM — back-compat shim
-- --------------------------------------------
-- The /api/rakeback/claim route is being removed from the UI, but in case
-- a stale client hits it (or a user has legacy claimable from before the
-- backfill ran), we keep the function alive as a one-way drain to balance.
-- Same atomic guarantees as before. Returns 0 if nothing pending.
CREATE OR REPLACE FUNCTION claim_rakeback(p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_claimable NUMERIC;
  v_new_balance NUMERIC;
  v_batch_id UUID := gen_random_uuid();
  v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'P0002';
  END IF;

  v_claimable := COALESCE(v_user.rakeback_claimable, 0);

  IF v_claimable <= 0 THEN
    RETURN 0;
  END IF;

  v_new_balance := v_user.balance + v_claimable;

  UPDATE users SET
    balance                = v_new_balance,
    rakeback_claimable     = 0,
    rakeback_lifetime      = rakeback_lifetime + v_claimable,
    last_rakeback_claim_at = NOW(),
    updated_at             = NOW()
  WHERE id = p_user_id;

  -- Stamp legacy unclaimed accruals if any survived the backfill.
  UPDATE rakeback_accruals
    SET claimed_at = NOW(), claim_batch_id = v_batch_id
    WHERE user_id = p_user_id AND claimed_at IS NULL;

  INSERT INTO transactions (
    user_id, type, amount, balance_after, currency, status, confirmed_at, metadata
  ) VALUES (
    p_user_id,
    'bonus'::tx_type,
    v_claimable,
    v_new_balance,
    'USD',
    'confirmed',
    NOW(),
    jsonb_build_object(
      'source', 'rakeback_legacy_claim',
      'batch_id', v_batch_id
    )
  );

  RETURN v_claimable;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------
-- 3. ONE-SHOT BACKFILL — drain existing claimable to balance
-- --------------------------------------------
-- Wraps the migration in a single transaction. For every user with
-- rakeback_claimable > 0 at this moment:
--   - Credit balance += claimable
--   - Bump rakeback_lifetime
--   - Zero claimable
--   - Stamp claim timestamps
--   - Stamp open accruals
--   - Write one audit tx with source='rakeback_backfill_033'
--
-- Idempotent: a re-run finds zero candidates and no-ops.
DO $$
DECLARE
  r RECORD;
  v_new_balance NUMERIC;
  v_batch_id UUID;
  v_count INT := 0;
  v_total NUMERIC := 0;
BEGIN
  FOR r IN
    SELECT id, balance, rakeback_claimable
      FROM users
      WHERE rakeback_claimable > 0
      FOR UPDATE
  LOOP
    v_batch_id := gen_random_uuid();
    v_new_balance := r.balance + r.rakeback_claimable;

    UPDATE users SET
      balance                = v_new_balance,
      rakeback_lifetime      = rakeback_lifetime + r.rakeback_claimable,
      rakeback_claimable     = 0,
      last_rakeback_claim_at = NOW(),
      updated_at             = NOW()
    WHERE id = r.id;

    UPDATE rakeback_accruals
      SET claimed_at = NOW(), claim_batch_id = v_batch_id
      WHERE user_id = r.id AND claimed_at IS NULL;

    INSERT INTO transactions (
      user_id, type, amount, balance_after, currency, status, confirmed_at, metadata
    ) VALUES (
      r.id,
      'bonus'::tx_type,
      r.rakeback_claimable,
      v_new_balance,
      'USD',
      'confirmed',
      NOW(),
      jsonb_build_object(
        'source', 'rakeback_backfill_033',
        'batch_id', v_batch_id,
        'note', 'Drained from rakeback_claimable on instant-rakeback rollout'
      )
    );

    v_count := v_count + 1;
    v_total := v_total + r.rakeback_claimable;
  END LOOP;

  RAISE NOTICE 'rakeback_backfill_033: drained $% across % users', v_total, v_count;
END;
$$;
