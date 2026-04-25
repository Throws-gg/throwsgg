import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletBalances, getUsdcTransfersIn } from "@/lib/wallet/solana";
import { trackServer, identifyServer } from "@/lib/analytics/posthog-server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { sendEmail } from "@/lib/email/send";
import DepositReceived from "@/lib/email/templates/DepositReceived";
import { sweepUserUsdc } from "@/lib/wallet/sweep";

/**
 * POST /api/wallet/deposit
 *
 * Detect new on-chain deposits and credit the user's game balance.
 *
 * USDC path (per-signature dedup, race-safe):
 *   1. Enumerate USDC transfer signatures to the user's ATA since the last
 *      processed slot.
 *   2. For each signature, call `update_balance` with `p_tx_hash = signature`.
 *      A `UNIQUE` partial index on `transactions.tx_hash` turns a concurrent
 *      retry into a constraint violation — credited exactly once.
 *   3. Update `deposit_addresses.last_processed_slot` so the next call only
 *      scans forward.
 *
 * SOL path (baseline-delta + row lock):
 *   1. Lock the `deposit_addresses` row via select-for-update.
 *   2. Credit `current_sol_usd - baseline_sol_usd` if positive.
 *   3. Update `sol_baseline_lamports` to the current on-chain amount.
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

    const walletAddress = userRow?.wallet_address;
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

    // --- USDC PATH: per-signature credit ---
    const sinceSlot = existingAddr.last_processed_slot ?? 0;
    const transfers = await getUsdcTransfersIn(walletAddress, { sinceSlot });

    // Oldest first so the transactions ledger reflects chain order.
    transfers.sort((a, b) => a.slot - b.slot);

    let totalCreditedUsdc = 0;
    let newMaxSlot = sinceSlot;

    for (const t of transfers) {
      if (t.slot > newMaxSlot) newMaxSlot = t.slot;
      if (t.uiAmount < 0.01) continue;

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
            signature: t.signature,
            slot: t.slot,
            block_time: t.blockTime,
            ui_amount: t.uiAmount,
          },
        });

        if (error) {
          // 23505 = unique_violation on tx_hash → already credited, skip.
          if (error.code === "23505") continue;
          console.error("update_balance (USDC deposit) failed:", {
            signature: t.signature,
            code: error.code,
            message: error.message,
          });
          continue;
        }

        totalCreditedUsdc += t.uiAmount;
      } catch (err) {
        console.error("update_balance threw:", err);
        continue;
      }
    }

    // --- SOL PATH: row-locked baseline-delta ---
    // The RPC below is a no-op if the baseline already matches current on-chain.
    // If SOL has grown, credit the USD delta and bump the baseline.
    let solCreditedUsd = 0;
    const solDelta = balances.solLamports - (existingAddr.sol_baseline_lamports ?? 0);
    if (solDelta > 0) {
      const solUsdPerLamport = balances.solLamports > 0 ? balances.solUsd / balances.solLamports : 0;
      const solUsd = solDelta * solUsdPerLamport;

      // Row lock on the deposit_addresses row serialises concurrent requests.
      // We use a single atomic UPDATE … RETURNING so two concurrent updaters
      // race on the WHERE clause and only one wins.
      const { data: claimed } = await supabase
        .from("deposit_addresses")
        .update({ sol_baseline_lamports: balances.solLamports })
        .eq("user_id", userId)
        .eq("chain", "solana")
        .eq("sol_baseline_lamports", existingAddr.sol_baseline_lamports ?? 0)
        .select("sol_baseline_lamports")
        .single();

      if (claimed && solUsd >= 0.01) {
        const { error } = await supabase.rpc("update_balance", {
          p_user_id: userId,
          p_amount: solUsd,
          p_type: "deposit",
          p_currency: "USD",
          p_address: walletAddress,
          p_metadata: {
            source: "sol_transfer",
            lamports_delta: solDelta,
            sol_usd: solUsd,
            sol_baseline_lamports_after: balances.solLamports,
          },
        });
        if (!error) {
          solCreditedUsd = solUsd;
        } else {
          console.error("update_balance (SOL deposit) failed:", error);
        }
      }
    }

    // Bump the USDC cursor. Only do this AFTER the credits have landed so that
    // a crash mid-loop leaves unprocessed signatures to retry on next poll.
    if (newMaxSlot > sinceSlot) {
      await supabase
        .from("deposit_addresses")
        .update({ last_processed_slot: newMaxSlot })
        .eq("user_id", userId)
        .eq("chain", "solana");
    }

    const totalCreditedUsd = totalCreditedUsdc + solCreditedUsd;

    if (totalCreditedUsd < 0.01) {
      return NextResponse.json({
        status: "no_new_deposits",
        balances,
        credited: 0,
        foreignTokens: balances.foreignTokens,
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

    const isFirstDeposit = (depositCount ?? 0) <= transfers.length + (solCreditedUsd > 0 ? 1 : 0);

    trackServer(userId, "deposit_completed", {
      amount_usd: totalCreditedUsd,
      usdc_credited: totalCreditedUsdc,
      sol_credited_usd: solCreditedUsd,
      chain: "solana",
      transfer_count: transfers.length,
      new_balance: newBalance,
      is_first_deposit: isFirstDeposit,
      wallet_address: walletAddress,
    });

    identifyServer(userId, {
      last_deposit_at: new Date().toISOString(),
      has_deposited: true,
    });

    // Fire deposit-received email (transactional, always sends). Idempotency
    // keyed on the latest signature so a retry of the deposit poll doesn't
    // re-send. SOL-only deposits (no USDC transfer) use the slot as the key.
    const { data: emailUser } = await supabase
      .from("users")
      .select("email, username")
      .eq("id", userId)
      .single();
    if (emailUser?.email) {
      const latestSig =
        transfers.length > 0
          ? transfers[transfers.length - 1].signature
          : `sol-${newMaxSlot}`;
      sendEmail({
        to: emailUser.email,
        subject: `Your deposit has been credited`,
        category: "transactional",
        userId,
        idempotencyKey: `deposit:${latestSig}`,
        react: DepositReceived({
          username: emailUser.username,
          amountUsd: totalCreditedUsd,
          token: totalCreditedUsdc >= solCreditedUsd ? "USDC" : "SOL",
          newBalance,
          txSignature: transfers.length > 0 ? latestSig : undefined,
        }),
      }).catch((err) => console.error("Deposit email failed:", err));
    }

    // Sweep the user's USDC into the hot wallet — only if they've delegated.
    // Without this step, deposited USDC sits in the user's embedded wallet
    // forever and the hot wallet bleeds funding withdrawals from its float.
    //
    // Best-effort: a sweep failure does NOT roll back the credit. The credit
    // is recorded in our DB; the on-chain USDC stays at the user's address
    // and we'll retry next deposit poll, or via admin tooling.
    //
    // Gated on sweep_delegated_at — set after the user clicks through the
    // Privy delegation modal. If they haven't, we leave the funds and let
    // the client surface a "please authorize" CTA on next deposit attempt.
    let sweep: { status: string; amount?: number; signature?: string; error?: string } | null = null;
    if (totalCreditedUsdc > 0) {
      const { data: delegationRow } = await supabase
        .from("users")
        .select("sweep_delegated_at, sweep_revoked_at")
        .eq("id", userId)
        .single();
      const delegated =
        !!delegationRow?.sweep_delegated_at && !delegationRow?.sweep_revoked_at;

      if (delegated) {
        try {
          sweep = await sweepUserUsdc(walletAddress);
          if (sweep.status === "failed") {
            // Log + carry on. Admin tooling or next deposit poll will retry.
            // We don't block the response — user's balance is already credited.
            trackServer(userId, "sweep_failed", {
              wallet_address: walletAddress,
              amount_usdc: totalCreditedUsdc,
              error: sweep.error,
            });
          } else if (sweep.status === "swept") {
            trackServer(userId, "sweep_completed", {
              wallet_address: walletAddress,
              amount_usdc: sweep.amount,
              signature: sweep.signature,
            });
          }
        } catch (err) {
          console.error("Sweep threw unexpectedly:", err);
        }
      }
    }

    return NextResponse.json({
      status: "deposited",
      credited: totalCreditedUsd,
      balances,
      newBalance,
      foreignTokens: balances.foreignTokens,
      sweep: sweep
        ? { status: sweep.status, amount: sweep.amount, signature: sweep.signature }
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
