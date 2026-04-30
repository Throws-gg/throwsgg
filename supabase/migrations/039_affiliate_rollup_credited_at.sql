-- ============================================
-- Affiliate rollup credit idempotency
-- ============================================
--
-- rollup_weekly_periods (mig 014) credits users.referral_earnings for
-- just-transitioned 'claimable' periods using a fragile time window:
--   AND updated_at > NOW() - INTERVAL '1 day'
-- If the cron runs twice within 24h — Vercel retry, manual admin re-fire,
-- partial failure recovery — every period transitioning to 'claimable' in
-- that window credits referral_earnings a second time. The user can then
-- claim_referral_earnings to walk the duplicate cash out.
--
-- Fix: add affiliate_periods.credited_at, gate the credit on it being NULL,
-- and set it in the same UPDATE so the second run finds nothing to credit.
-- Backfill existing 'claimable' / 'paid' rows to credited_at = NOW() so
-- they're not re-credited on the next rollup.
-- ============================================

ALTER TABLE affiliate_periods
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;

-- Backfill: any period that's already past 'held' has, by definition, already
-- contributed to the user's referral_earnings under the old time-window logic
-- (or it was paid out manually). Stamp them now so the new rollup doesn't
-- re-credit them on its next run.
UPDATE affiliate_periods
SET credited_at = COALESCE(credited_at, paid_at, updated_at, NOW())
WHERE status IN ('claimable', 'paid')
  AND credited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_periods_credited_at
  ON affiliate_periods (credited_at)
  WHERE credited_at IS NULL AND status = 'claimable';

-- Replace rollup_weekly_periods with the credited_at gate.
CREATE OR REPLACE FUNCTION rollup_weekly_periods() RETURNS INT AS $$
DECLARE
  r RECORD;
  v_period_start DATE;
  v_period_end DATE;
  v_period_id UUID;
  v_count INT := 0;
BEGIN
  v_period_end := (date_trunc('week', NOW() AT TIME ZONE 'UTC')::DATE - 1);
  v_period_start := v_period_end - 6;

  FOR r IN
    SELECT referrer_id, SUM(amount) AS gross, SUM(ngr_at_accrual) AS ngr
    FROM referral_rewards
    WHERE status = 'held'
      AND created_at::DATE BETWEEN v_period_start AND v_period_end
    GROUP BY referrer_id
  LOOP
    IF EXISTS (
      SELECT 1 FROM affiliate_periods
      WHERE affiliate_id = r.referrer_id
        AND period_start = v_period_start
        AND period_end = v_period_end
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO affiliate_periods (
      affiliate_id, period_start, period_end,
      ngr_generated, commission_rate, gross_commission,
      net_commission, status, held_until
    )
    VALUES (
      r.referrer_id, v_period_start, v_period_end,
      r.ngr, 0, r.gross,
      r.gross,
      'held',
      NOW() + INTERVAL '7 days'
    )
    RETURNING id INTO v_period_id;

    UPDATE referral_rewards SET period_id = v_period_id
      WHERE referrer_id = r.referrer_id
        AND status = 'held'
        AND created_at::DATE BETWEEN v_period_start AND v_period_end;

    v_count := v_count + 1;
  END LOOP;

  -- Move past-hold periods to claimable.
  UPDATE affiliate_periods SET status = 'claimable'
    WHERE status = 'held' AND held_until <= NOW();

  -- Credit user.referral_earnings exactly once per period.
  -- Claim the rows in a CTE that flips credited_at, returning the rows we
  -- actually claimed; aggregate THOSE for the user UPDATE so a second run
  -- (or a partial-failure re-run) finds nothing to credit.
  WITH claimed AS (
    UPDATE affiliate_periods
    SET credited_at = NOW(),
        updated_at = NOW()
    WHERE status = 'claimable'
      AND credited_at IS NULL
    RETURNING affiliate_id, net_commission
  ),
  totals AS (
    SELECT affiliate_id, SUM(net_commission) AS total
    FROM claimed
    GROUP BY affiliate_id
  )
  UPDATE users u SET
    referral_earnings = referral_earnings + t.total,
    updated_at = NOW()
  FROM totals t
  WHERE u.id = t.affiliate_id;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
