-- ============================================
-- Idempotent withdrawal refund
-- ============================================
--
-- The withdraw route refunds the user's balance from two paths:
--   - sendResult.status === 'not_submitted' (tx never reached chain)
--   - chainStatus === 'failed'              (tx reached chain, was rejected)
--
-- Both call update_balance(+totalDeduction) and then UPDATE the tx row to
-- status='failed'. There is no guard preventing the same logical refund
-- from running twice — a Vercel timeout + client retry, or any future
-- reconciliation tooling, can re-fire the refund and credit the user
-- a second time at our expense.
--
-- Fix: gate the refund on a status transition. UPDATE … WHERE status != 'failed'
-- RETURNING claims the tx exactly once; only the claiming caller credits balance.
-- The function is the single source of truth for refund-or-no-refund.
-- ============================================

CREATE OR REPLACE FUNCTION withdrawal_refund_atomic(
  p_tx_id UUID,
  p_reason TEXT,
  p_error_type TEXT,
  p_error_message TEXT,
  p_signature TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_tx transactions%ROWTYPE;
  v_refund_amount NUMERIC;
  v_metadata JSONB;
  v_amount_usd NUMERIC;
  v_fee_usd NUMERIC;
BEGIN
  -- Claim the tx atomically. WHERE status != 'failed' ensures only the first
  -- caller wins; subsequent retries see no row and short-circuit without
  -- crediting balance.
  UPDATE transactions
  SET status = 'failed',
      tx_hash = COALESCE(p_signature, tx_hash),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'error_type', p_error_type,
        'error_message', p_error_message,
        'refund_reason', p_reason
      )
  WHERE id = p_tx_id
    AND type = 'withdrawal'
    AND status != 'failed'
  RETURNING * INTO v_tx;

  IF NOT FOUND THEN
    -- Already failed (and refunded) on a prior call — nothing to do.
    RETURN jsonb_build_object(
      'refunded', FALSE,
      'reason', 'already_refunded_or_not_pending'
    );
  END IF;

  -- The withdrawal debit was recorded as a negative amount (amount = -(amount + fee)).
  -- Refund the absolute value so balance returns to its pre-withdrawal state.
  v_refund_amount := ABS(v_tx.amount);
  v_metadata := COALESCE(v_tx.metadata, '{}'::jsonb);
  v_amount_usd := COALESCE((v_metadata->>'amount_usd')::NUMERIC, v_refund_amount);
  v_fee_usd := COALESCE((v_metadata->>'fee_usd')::NUMERIC, 0);

  PERFORM update_balance(
    v_tx.user_id,
    v_refund_amount,
    'deposit'::tx_type,
    'USD',
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'type', 'withdrawal_refund',
      'original_tx', p_tx_id,
      'reason', p_reason,
      'signature', p_signature,
      'amount_usd', v_amount_usd,
      'fee_usd', v_fee_usd
    )
  );

  RETURN jsonb_build_object(
    'refunded', TRUE,
    'amount', v_refund_amount,
    'tx_id', p_tx_id
  );
END;
$$ LANGUAGE plpgsql;
