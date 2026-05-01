import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletBalances, getUsdcTransfersIn } from "@/lib/wallet/solana";
import { trackServer, identifyServer } from "@/lib/analytics/posthog-server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { sendEmail } from "@/lib/email/send";
import DepositReceived from "@/lib/email/templates/DepositReceived";
import { sweepUserUsdc } from "@/lib/wallet/sweep";
import { getSolanaEmbeddedAddress } from "@/lib/auth/privy";

/**
 * POST /api/wallet/deposit
 *
 * Detect new on-chain USDC deposits and credit the user's game balance only
 * after custody is confirmed.
 *
 * USDC path (custody-first, per-signature dedup, race-safe):
 *   1. Enumerate USDC transfer signatures to the user's ATA since the last
 *      processed slot.
 *   2. Sweep the user's current USDC ATA balance to the house hot wallet.
 *   3. Only after the sweep succeeds, call `update_balance` per signature.
 *      A `UNIQUE` partial index on `transactions.tx_hash` turns a concurrent
 *      retry into a constraint violation — credited exactly once.
 *   4. Update `deposit_addresses.last_processed_slot` so the next call only
 *      scans forward.
 *
 * SOL deposits are paused. We still keep the SOL baseline current so accidental
 * SOL sends cannot be credited later by a stale delta if SOL support returns.
 *
 * Foreign (non-USDC) SPL tokens are never credited — see lib/wallet/solana.ts
 * `getForeignTokenBalances()`. We surface a warning on the client instead.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    // Auth: derive userId from Privy JWT, never from body.
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional.
    }
    const authed = await verifyRequest(request, body);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authed.dbUserId;

    // Wallet address comes from the DB user record, not the client body.
    const { data: userRow } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    let walletAddress = userRow?.wallet_address;

    // Lazy backfill: TEE embedded wallets are provisioned a few seconds
    // after Privy auth completes, which sometimes lands AFTER our /auth/sync
    // call. If wallet_address is still null, re-fetch from Privy now and
    // persist. Once persisted it never gets re-fetched again.
    if (!walletAddress) {
      const fetched = await getSolanaEmbeddedAddress(authed.privyId);
      if (fetched) {
        await supabase
          .from("users")
          .update({ wallet_address: fetched })
          .eq("id", userId)
          .is("wallet_address", null);
        walletAddress = fetched;
      }
    }

    if (!walletAddress) {
      return NextResponse.json(
        { error: "No deposit wallet linked to this account" },
        { status: 400 }
      );
    }

    // Pull fresh on-chain balances — used for display + foreign-SPL detection.
    const balances = await getWalletBalances(walletAddress);

    if (balances.foreignTokens.length > 0) {
      trackServer(userId, "deposit_foreign_token_detected", {
        wallet_address: walletAddress,
        tokens: balances.foreignTokens.map((t) => ({
          symbol: t.symbol,
          mint: t.mint,
          amount: t.amount,
        })),
      });
    }

    // Ensure a deposit_addresses row exists. This is the per-user cursor for
    // signature scanning + SOL baseline. First call initializes it.
    const { data: existingAddr } = await supabase
      .from("deposit_addresses")
      .select("last_processed_slot, sol_baseline_lamports")
      .eq("user_id", userId)
      .eq("chain", "solana")
      .single();

    if (!existingAddr) {
      // First-time init — seed the cursor at the latest slot and the SOL
      // baseline at the current on-chain amount. Anything already in the
      // wallet BEFORE this point is NOT credited (user could have had
      // incidental holdings from somewhere else).
      const initialUsdcTransfers = await getUsdcTransfersIn(walletAddress, { limit: 1 });
      const initialSlot = initialUsdcTransfers[0]?.slot ?? 0;

      // Upsert so concurrent first-call attempts don't throw 23505 — second
      // caller gets a silent no-op and the existing row holds.
      await supabase
        .from("deposit_addresses")
        .upsert(
          {
            user_id: userId,
            chain: "solana",
            address: walletAddress,
            derivation_index: 0,
            last_processed_slot: initialSlot,
            sol_baseline_lamports: balances.solLamports,
          },
          { onConflict: "user_id,chain", ignoreDuplicates: true },
        );

      return NextResponse.json({
        status: "baseline_set",
        balances,
        credited: 0,
        foreignTokens: balances.foreignTokens,
      });
    }

    // SOL deposits are currently disabled. Keep the baseline current so a SOL
    // balance increase cannot be credited later by stale delta accounting.
    const priorSolBaseline = existingAddr.sol_baseline_lamports ?? 0;
    const solDeltaLamports = balances.solLamports - priorSolBaseline;
    const solUnsupportedUsd =
      solDeltaLamports > 0 && balances.solLamports > 0
        ? solDeltaLamports * (balances.solUsd / balances.solLamports)
        : 0;
    if (balances.solLamports !== priorSolBaseline) {
      const { error: solBaselineError } = await supabase
        .from("deposit_addresses")
        .update({ sol_baseline_lamports: balances.solLamports })
        .eq("user_id", userId)
        .eq("chain", "solana")
        .eq("sol_baseline_lamports", priorSolBaseline);

      if (solBaselineError) {
        console.error("SOL baseline update failed while SOL deposits are disabled:", {
          userId,
          priorSolBaseline,
          currentSolLamports: balances.solLamports,
          error: solBaselineError.message,
        });
      } else if (solDeltaLamports > 0) {
        trackServer(userId, "sol_deposit_not_credited", {
          wallet_address: walletAddress,
          lamports_delta: solDeltaLamports,
          estimated_usd: solUnsupportedUsd,
          reason: "sol_deposits_disabled",
        });
      }
    }

    // --- USDC PATH: custody-first per-signature credit ---
    const sinceSlot = existingAddr.last_processed_slot ?? 0;
    const transfers = await getUsdcTransfersIn(walletAddress, { sinceSlot });

    // Oldest first so the transactions ledger reflects chain order.
    transfers.sort((a, b) => a.slot - b.slot);

    const eligibleTransfers = transfers.filter((t) => t.uiAmount >= 0.01);
    const allTransferMaxSlot = transfers.reduce((max, t) => Math.max(max, t.slot), sinceSlot);
    const eligibleSignatures = eligibleTransfers.map((t) => t.signature);
    let alreadyCredited = new Set<string>();

    if (eligibleSignatures.length > 0) {
      const { data: existingDepositTxs, error: existingDepositError } = await supabase
        .from("transactions")
        .select("tx_hash")
        .eq("user_id", userId)
        .eq("type", "deposit")
        .in("tx_hash", eligibleSignatures);

      if (existingDepositError) {
        console.error("Failed to check existing deposit signatures:", existingDepositError);
        return NextResponse.json({ error: "Failed to check deposits" }, { status: 500 });
      }

      alreadyCredited = new Set(
        (existingDepositTxs || [])
          .map((tx) => tx.tx_hash)
          .filter((sig): sig is string => typeof sig === "string")
      );
    }

    const pendingTransfers = eligibleTransfers.filter((t) => !alreadyCredited.has(t.signature));
    const pendingUsdcAmount = pendingTransfers.reduce((sum, t) => sum + t.uiAmount, 0);

    const { data: delegationRow } = await supabase
      .from("users")
      .select("sweep_delegated_at, sweep_revoked_at")
      .eq("id", userId)
      .single();
    const delegated =
      !!delegationRow?.sweep_delegated_at && !delegationRow?.sweep_revoked_at;

    let sweep: { status: string; amount?: number; signature?: string; error?: string } | null = null;

    if (pendingTransfers.length === 0) {
      if (allTransferMaxSlot > sinceSlot) {
        await supabase
          .from("deposit_addresses")
          .update({ last_processed_slot: allTransferMaxSlot })
          .eq("user_id", userId)
          .eq("chain", "solana");
      }

      // Residual sweep only. This covers already-credited USDC that previously
      // failed to sweep, without issuing a second balance credit.
      if (delegated) {
        try {
          sweep = await sweepUserUsdc(walletAddress);
          if (sweep.status === "swept") {
            trackServer(userId, "sweep_completed", {
              wallet_address: walletAddress,
              amount_usdc: sweep.amount,
              signature: sweep.signature,
              source: "residual",
            });
          } else if (sweep.status === "failed") {
            trackServer(userId, "sweep_failed", {
              wallet_address: walletAddress,
              amount_usdc: balances.usdc,
              error: sweep.error,
              source: "residual",
            });
          }
        } catch (err) {
          console.error("Residual sweep threw:", err);
        }
      }

      return NextResponse.json({
        status: "no_new_deposits",
        balances,
        credited: 0,
        foreignTokens: balances.foreignTokens,
        solDepositsEnabled: false,
        unsupportedSolUsd: solUnsupportedUsd,
        sweep: sweep
          ? { status: sweep.status, amount: sweep.amount, signature: sweep.signature, error: sweep.error }
          : null,
      });
    }

    if (!delegated) {
      trackServer(userId, "deposit_pending_delegation", {
        wallet_address: walletAddress,
        pending_usdc: pendingUsdcAmount,
        transfer_count: pendingTransfers.length,
      });

      return NextResponse.json({
        status: "pending_delegation",
        balances,
        credited: 0,
        pendingUsdc: pendingUsdcAmount,
        transferCount: pendingTransfers.length,
        foreignTokens: balances.foreignTokens,
        solDepositsEnabled: false,
        unsupportedSolUsd: solUnsupportedUsd,
      });
    }

    try {
      sweep = await sweepUserUsdc(walletAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sweep = { status: "failed", error: message };
    }

    const sweptEnough =
      sweep.status === "swept" &&
      typeof sweep.amount === "number" &&
      sweep.amount + 0.000001 >= pendingUsdcAmount;

    if (!sweptEnough) {
      trackServer(userId, "deposit_sweep_required_before_credit", {
        wallet_address: walletAddress,
        pending_usdc: pendingUsdcAmount,
        transfer_count: pendingTransfers.length,
        sweep_status: sweep.status,
        sweep_amount: sweep.amount ?? 0,
        sweep_error: sweep.error ?? null,
      });

      return NextResponse.json({
        status: sweep.status === "failed" ? "sweep_failed" : "pending_sweep",
        balances,
        credited: 0,
        pendingUsdc: pendingUsdcAmount,
        transferCount: pendingTransfers.length,
        foreignTokens: balances.foreignTokens,
        solDepositsEnabled: false,
        unsupportedSolUsd: solUnsupportedUsd,
        sweep: { status: sweep.status, amount: sweep.amount, signature: sweep.signature, error: sweep.error },
      });
    }

    let totalCreditedUsdc = 0;
    let creditFailed = false;

    for (const t of pendingTransfers) {

      try {
        const { error } = await supabase.rpc("update_balance", {
          p_user_id: userId,
          p_amount: t.uiAmount,
          p_type: "deposit",
          p_currency: "USD",
          p_address: walletAddress,
          p_tx_hash: t.signature,
          p_metadata: {
            source: "usdc_transfer",
            custody: "swept_to_hot_wallet",
            sweep_signature: sweep.signature,
            sweep_amount_usdc: sweep.amount,
            signature: t.signature,
            slot: t.slot,
            block_time: t.blockTime,
            ui_amount: t.uiAmount,
          },
        });

        if (error) {
          // We filtered this user's existing deposit txs before sweeping. A
          // 23505 here means either a concurrent request won the race or the
          // legacy global tx_hash unique index collided with another recipient
          // in the same Solana transaction. Do not advance the cursor from this
          // request; the next poll can distinguish a same-user duplicate from a
          // real collision before trying again.
          if (error.code === "23505") {
            console.error("update_balance duplicate after custody sweep:", {
              signature: t.signature,
              sweepSignature: sweep.signature,
            });
            creditFailed = true;
            break;
          }
          console.error("update_balance (USDC deposit) failed:", {
            signature: t.signature,
            sweepSignature: sweep.signature,
            code: error.code,
            message: error.message,
          });
          creditFailed = true;
          break;
        }

        totalCreditedUsdc += t.uiAmount;
      } catch (err) {
        console.error("update_balance threw:", err);
        creditFailed = true;
        break;
      }
    }

    if (creditFailed) {
      trackServer(userId, "deposit_credit_failed_after_sweep", {
        wallet_address: walletAddress,
        pending_usdc: pendingUsdcAmount,
        credited_usdc_before_failure: totalCreditedUsdc,
        sweep_signature: sweep.signature,
      });
      return NextResponse.json(
        { error: "Deposit swept but credit failed. Support has been notified." },
        { status: 500 }
      );
    }

    // Bump the USDC cursor only after custody is confirmed and credits have
    // landed. A failed sweep or credit leaves signatures to retry on next poll.
    if (allTransferMaxSlot > sinceSlot) {
      await supabase
        .from("deposit_addresses")
        .update({ last_processed_slot: allTransferMaxSlot })
        .eq("user_id", userId)
        .eq("chain", "solana");
    }

    const totalCreditedUsd = totalCreditedUsdc;

    if (totalCreditedUsd < 0.01) {
      return NextResponse.json({
        status: "no_new_deposits",
        balances,
        credited: 0,
        foreignTokens: balances.foreignTokens,
        solDepositsEnabled: false,
        unsupportedSolUsd: solUnsupportedUsd,
        sweep: sweep
          ? { status: sweep.status, amount: sweep.amount, signature: sweep.signature, error: sweep.error }
          : null,
      });
    }

    // Fetch the post-credit balance for the UI.
    const { data: postUser } = await supabase
      .from("users")
      .select("balance")
      .eq("id", userId)
      .single();
    const newBalance = parseFloat(postUser?.balance ?? "0");

    // First-deposit detection — used for analytics + future first-deposit bonuses.
    const { count: depositCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .gt("amount", 0);

    const isFirstDeposit = (depositCount ?? 0) <= pendingTransfers.length;

    trackServer(userId, "deposit_completed", {
      amount_usd: totalCreditedUsd,
      usdc_credited: totalCreditedUsdc,
      sol_credited_usd: 0,
      chain: "solana",
      transfer_count: pendingTransfers.length,
      new_balance: newBalance,
      is_first_deposit: isFirstDeposit,
      wallet_address: walletAddress,
      sweep_signature: sweep.signature,
      sweep_amount_usdc: sweep.amount,
    });

    identifyServer(userId, {
      last_deposit_at: new Date().toISOString(),
      has_deposited: true,
    });

    // Fire deposit-received email (transactional, always sends). Idempotency is
    // keyed on the latest credited USDC signature so retries don't re-send.
    const { data: emailUser } = await supabase
      .from("users")
      .select("email, username")
      .eq("id", userId)
      .single();
    if (emailUser?.email) {
      const latestSig =
        pendingTransfers[pendingTransfers.length - 1]?.signature ?? sweep.signature;
      sendEmail({
        to: emailUser.email,
        subject: `Your deposit has been credited`,
        category: "transactional",
        userId,
        idempotencyKey: `deposit:${latestSig}`,
        react: DepositReceived({
          username: emailUser.username,
          amountUsd: totalCreditedUsd,
          token: "USDC",
          newBalance,
          txSignature: latestSig,
        }),
      }).catch((err) => console.error("Deposit email failed:", err));
    }

    return NextResponse.json({
      status: "deposited",
      credited: totalCreditedUsd,
      balances,
      newBalance,
      foreignTokens: balances.foreignTokens,
      solDepositsEnabled: false,
      unsupportedSolUsd: solUnsupportedUsd,
      sweep: sweep
        ? { status: sweep.status, amount: sweep.amount, signature: sweep.signature, error: sweep.error }
        : null,
    });
  } catch (error) {
    console.error("Deposit check error:", error);
    return NextResponse.json({ error: "Failed to check deposits" }, { status: 500 });
  }
}

/**
 * GET /api/wallet/deposit
 * Return the caller's on-chain balances without crediting.
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  const authed = await verifyRequest(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("wallet_address")
    .eq("id", authed.dbUserId)
    .single();

  const walletAddress = userRow?.wallet_address;
  if (!walletAddress) {
    return NextResponse.json(
      { error: "No deposit wallet linked to this account" },
      { status: 400 }
    );
  }

  try {
    const balances = await getWalletBalances(walletAddress);
    return NextResponse.json({ balances });
  } catch {
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 500 });
  }
}
