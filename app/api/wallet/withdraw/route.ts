import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";
import {
  isValidSolanaAddress,
  sendUsdc,
  checkSignatureStatus,
  getHotWalletSolBalance,
  HOT_WALLET_SOL_FLOOR,
} from "@/lib/wallet/send-usdc";
import { LIMITS, WITHDRAWAL_FEES } from "@/lib/game/constants";
import { trackServer } from "@/lib/analytics/posthog-server";
import { sendEmail } from "@/lib/email/send";
import WithdrawalSent from "@/lib/email/templates/WithdrawalSent";

// Auto-send threshold — withdrawals above this require manual admin approval
const AUTO_SEND_THRESHOLD = 500;

// Rate limit: max withdrawals per user per 24h
const MAX_WITHDRAWALS_PER_DAY = 3;

/**
 * POST /api/wallet/withdraw
 * Request a USDC withdrawal to a Solana wallet address.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const user = await verifyRequest(request, body);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount, destinationAddress } = body as {
      amount?: number;
      destinationAddress?: string;
    };

    // --- Validation ---

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid withdrawal amount" },
        { status: 400 }
      );
    }

    if (amount < LIMITS.MIN_WITHDRAWAL) {
      return NextResponse.json(
        {
          error: `Minimum withdrawal is $${LIMITS.MIN_WITHDRAWAL.toFixed(2)}`,
        },
        { status: 400 }
      );
    }

    if (!destinationAddress || typeof destinationAddress !== "string") {
      return NextResponse.json(
        { error: "Destination address required" },
        { status: 400 }
      );
    }

    const trimmedDest = destinationAddress.trim();

    // Explicitly reject EVM-style addresses — clearest footgun
    if (/^0x/i.test(trimmedDest)) {
      return NextResponse.json(
        {
          error:
            "That looks like an Ethereum address. throws.gg only sends USDC on Solana — paste a Solana wallet address.",
        },
        { status: 400 }
      );
    }

    if (!isValidSolanaAddress(trimmedDest)) {
      return NextResponse.json(
        { error: "Invalid Solana wallet address" },
        { status: 400 }
      );
    }

    // Check user is not banned
    const { data: userData } = await supabase
      .from("users")
      .select("balance, is_banned, self_excluded_until, email, username")
      .eq("id", user.dbUserId)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (userData.is_banned) {
      return NextResponse.json(
        { error: "Account suspended" },
        { status: 403 }
      );
    }

    if (
      userData.self_excluded_until &&
      new Date(userData.self_excluded_until) > new Date()
    ) {
      return NextResponse.json(
        { error: "Account is self-excluded" },
        { status: 403 }
      );
    }

    const fee = WITHDRAWAL_FEES.USDC;
    const totalDeduction = amount + fee;

    if (parseFloat(userData.balance) < totalDeduction) {
      return NextResponse.json(
        { error: "Insufficient balance (amount + fee)" },
        { status: 400 }
      );
    }

    // Check for pending withdrawals (prevent double-tap)
    const { data: pendingWithdrawals } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", user.dbUserId)
      .eq("type", "withdrawal")
      .eq("status", "pending");

    if (pendingWithdrawals && pendingWithdrawals.length > 0) {
      return NextResponse.json(
        { error: "You already have a pending withdrawal" },
        { status: 409 }
      );
    }

    // Rate limit: max withdrawals per 24h
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const { count: recentCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.dbUserId)
      .eq("type", "withdrawal")
      .in("status", ["pending", "confirmed"])
      .gte("created_at", twentyFourHoursAgo);

    if ((recentCount || 0) >= MAX_WITHDRAWALS_PER_DAY) {
      return NextResponse.json(
        { error: "Maximum 3 withdrawals per 24 hours" },
        { status: 429 }
      );
    }

    // Weekly withdrawal cap (MVP phase — $2k / rolling 7 days)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: weekTxs } = await supabase
      .from("transactions")
      .select("amount, metadata")
      .eq("user_id", user.dbUserId)
      .eq("type", "withdrawal")
      .in("status", ["pending", "confirmed"])
      .gte("created_at", sevenDaysAgo);

    const weeklyTotal = (weekTxs || []).reduce((sum, tx) => {
      const meta = tx.metadata as { amount_usd?: number } | null;
      const amt =
        typeof meta?.amount_usd === "number"
          ? meta.amount_usd
          : Math.abs(parseFloat(String(tx.amount))) - WITHDRAWAL_FEES.USDC;
      return sum + Math.max(0, amt);
    }, 0);

    if (weeklyTotal + amount > LIMITS.MAX_WEEKLY_WITHDRAWAL) {
      const remaining = Math.max(
        0,
        LIMITS.MAX_WEEKLY_WITHDRAWAL - weeklyTotal
      );
      return NextResponse.json(
        {
          error: `Weekly withdrawal limit is $${LIMITS.MAX_WEEKLY_WITHDRAWAL.toFixed(0)} during the MVP phase. You have $${remaining.toFixed(2)} remaining this week.`,
        },
        { status: 429 }
      );
    }

    // --- Hot wallet gas pre-flight (auto-send path only) ---
    // If the hot wallet is out of SOL, the token transfer will fail inside
    // getOrCreateAssociatedTokenAccount — AFTER we've already debited the
    // user's balance. The user ends up refunded via sendResult.not_submitted,
    // but an attacker can exploit this to keep spinning withdrawals to fresh
    // addresses (ATA rent drain) until legitimate users start hitting failed
    // withdrawals too. Fail fast before touching balance and flag for admin
    // top-up. Large-withdrawal path (> AUTO_SEND_THRESHOLD) skips this check
    // because admin manually initiates the send.
    if (amount <= AUTO_SEND_THRESHOLD) {
      const solBalance = await getHotWalletSolBalance();
      if (solBalance < HOT_WALLET_SOL_FLOOR) {
        trackServer(user.dbUserId, "withdrawal_blocked_hot_wallet_low_sol", {
          amount_usd: amount,
          hot_wallet_sol: solBalance,
          floor: HOT_WALLET_SOL_FLOOR,
        });
        // Write an admin_actions row so this shows up in the admin audit log
        // even without a user-triggered log source. Matches the post-017
        // schema shape used by migration 025 (admin_identifier + admin_username
        // both TEXT NOT NULL, after_value JSONB).
        await supabase.from("admin_actions").insert({
          admin_identifier: "system",
          admin_username: "system",
          action_type: "hot_wallet_low_sol",
          target_type: "user",
          target_id: user.dbUserId,
          after_value: {
            hot_wallet_sol: solBalance,
            floor: HOT_WALLET_SOL_FLOOR,
            attempted_amount_usd: amount,
          },
          reason: `Hot wallet SOL ${solBalance.toFixed(6)} below floor ${HOT_WALLET_SOL_FLOOR}`,
        });
        return NextResponse.json(
          {
            error:
              "Withdrawals are temporarily paused while we top up network fees. Please try again in a few minutes. Your balance has not been affected.",
          },
          { status: 503 }
        );
      }
    }

    // --- Deduct balance atomically ---
    const { data: newBalance, error: balanceError } = await supabase.rpc(
      "update_balance",
      {
        p_user_id: user.dbUserId,
        p_amount: -totalDeduction,
        p_type: "withdrawal",
        p_currency: "USD",
        p_address: trimmedDest,
        p_metadata: {
          amount_usd: amount,
          fee_usd: fee,
          currency: "USDC",
          network: "solana",
        },
      }
    );

    if (balanceError) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    // Find the transaction we just created so we can update it
    const { data: txRecord } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", user.dbUserId)
      .eq("type", "withdrawal")
      .eq("address", trimmedDest)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!txRecord) {
      return NextResponse.json(
        { error: "Transaction record not found" },
        { status: 500 }
      );
    }

    // --- Auto-send for small amounts, queue for large ---
    if (amount <= AUTO_SEND_THRESHOLD) {
      const sendResult = await sendUsdc(trimmedDest, amount);

      if (sendResult.status === "confirmed") {
        await supabase
          .from("transactions")
          .update({
            tx_hash: sendResult.signature,
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            metadata: {
              amount_usd: amount,
              fee_usd: fee,
              currency: "USDC",
              network: "solana",
              auto_sent: true,
            },
          })
          .eq("id", txRecord.id);

        trackServer(user.dbUserId, "withdrawal_completed", {
          amount_usd: amount,
          fee_usd: fee,
          currency: "USDC",
          chain: "solana",
          tx_hash: sendResult.signature,
          new_balance: parseFloat(newBalance),
          auto_sent: true,
          wallet_address: trimmedDest,
        });

        if (userData.email) {
          sendEmail({
            to: userData.email,
            subject: `Your withdrawal is on its way`,
            category: "transactional",
            userId: user.dbUserId,
            idempotencyKey: `withdrawal:${sendResult.signature}`,
            react: WithdrawalSent({
              username: userData.username,
              amountUsd: amount,
              destination: trimmedDest,
              txSignature: sendResult.signature,
            }),
          }).catch((err) => console.error("Withdrawal email failed:", err));
        }

        return NextResponse.json({
          status: "completed",
          transactionId: txRecord.id,
          txHash: sendResult.signature,
          amount,
          fee,
          newBalance: parseFloat(newBalance),
        });
      }

      if (sendResult.status === "not_submitted") {
        // The tx never hit the network. Safe to refund in full.
        console.error("Auto-send failed (not submitted):", sendResult.error);

        await supabase.rpc("update_balance", {
          p_user_id: user.dbUserId,
          p_amount: totalDeduction,
          p_type: "deposit",
          p_currency: "USD",
          p_metadata: {
            type: "withdrawal_refund",
            original_tx: txRecord.id,
            reason: "tx_not_submitted",
            error: sendResult.error,
          },
        });

        await supabase
          .from("transactions")
          .update({
            status: "failed",
            metadata: {
              amount_usd: amount,
              fee_usd: fee,
              currency: "USDC",
              network: "solana",
              error_type: "not_submitted",
              error_message: sendResult.error,
            },
          })
          .eq("id", txRecord.id);

        trackServer(user.dbUserId, "withdrawal_failed", {
          amount_usd: amount,
          currency: "USDC",
          chain: "solana",
          error_type: "not_submitted",
          wallet_address: trimmedDest,
        });

        return NextResponse.json(
          { error: "Withdrawal failed — balance refunded. Please try again." },
          { status: 500 }
        );
      }

      // sendResult.status === "unknown" — the transaction was submitted but
      // we lost confirmation. We MUST NOT auto-refund: the tx may have landed.
      // Check the on-chain status first. If confirmed → keep the debit, mark
      // success. If failed on chain → safe to refund. Otherwise → hold for
      // manual review (admin will reconcile).
      console.error("Auto-send uncertain — checking chain status:", {
        signature: sendResult.signature,
        error: sendResult.error,
      });

      // Wait a couple seconds before polling so the RPC has time to index.
      // 3 polls × 2s gives the confirmation up to ~6s extra wall time.
      let chainStatus: "confirmed" | "failed" | "unknown" = "unknown";
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        chainStatus = await checkSignatureStatus(sendResult.signature);
        if (chainStatus !== "unknown") break;
      }

      if (chainStatus === "confirmed") {
        // Tx landed — treat as success. Record the signature and keep the debit.
        await supabase
          .from("transactions")
          .update({
            tx_hash: sendResult.signature,
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            metadata: {
              amount_usd: amount,
              fee_usd: fee,
              currency: "USDC",
              network: "solana",
              auto_sent: true,
              recovered_from_unknown: true,
            },
          })
          .eq("id", txRecord.id);

        trackServer(user.dbUserId, "withdrawal_completed", {
          amount_usd: amount,
          fee_usd: fee,
          currency: "USDC",
          chain: "solana",
          tx_hash: sendResult.signature,
          new_balance: parseFloat(newBalance),
          auto_sent: true,
          wallet_address: trimmedDest,
          recovered_from_unknown: true,
        });

        if (userData.email) {
          sendEmail({
            to: userData.email,
            subject: `Your withdrawal is on its way`,
            category: "transactional",
            userId: user.dbUserId,
            idempotencyKey: `withdrawal:${sendResult.signature}`,
            react: WithdrawalSent({
              username: userData.username,
              amountUsd: amount,
              destination: trimmedDest,
              txSignature: sendResult.signature,
            }),
          }).catch((err) => console.error("Withdrawal email failed:", err));
        }

        return NextResponse.json({
          status: "completed",
          transactionId: txRecord.id,
          txHash: sendResult.signature,
          amount,
          fee,
          newBalance: parseFloat(newBalance),
        });
      }

      if (chainStatus === "failed") {
        // Tx was submitted but the chain rejected it. Safe to refund.
        await supabase.rpc("update_balance", {
          p_user_id: user.dbUserId,
          p_amount: totalDeduction,
          p_type: "deposit",
          p_currency: "USD",
          p_metadata: {
            type: "withdrawal_refund",
            original_tx: txRecord.id,
            reason: "tx_failed_on_chain",
            signature: sendResult.signature,
          },
        });

        await supabase
          .from("transactions")
          .update({
            status: "failed",
            tx_hash: sendResult.signature,
            metadata: {
              amount_usd: amount,
              fee_usd: fee,
              currency: "USDC",
              network: "solana",
              error_type: "on_chain_failed",
              error_message: sendResult.error,
            },
          })
          .eq("id", txRecord.id);

        trackServer(user.dbUserId, "withdrawal_failed", {
          amount_usd: amount,
          currency: "USDC",
          chain: "solana",
          error_type: "on_chain_failed",
          wallet_address: trimmedDest,
        });

        return NextResponse.json(
          { error: "Withdrawal failed — balance refunded. Please try again." },
          { status: 500 }
        );
      }

      // Still unknown after polling. The tx may or may not land. DO NOT
      // refund. Flag as pending_review so the admin tool reconciles it
      // before touching the balance either way.
      await supabase
        .from("transactions")
        .update({
          status: "pending",
          tx_hash: sendResult.signature,
          metadata: {
            amount_usd: amount,
            fee_usd: fee,
            currency: "USDC",
            network: "solana",
            auto_sent: true,
            pending_review: true,
            reason: "confirmation_unknown",
            error_message: sendResult.error,
          },
        })
        .eq("id", txRecord.id);

      trackServer(user.dbUserId, "withdrawal_held_for_review", {
        amount_usd: amount,
        fee_usd: fee,
        currency: "USDC",
        chain: "solana",
        tx_hash: sendResult.signature,
        reason: "confirmation_unknown",
        wallet_address: trimmedDest,
      });

      return NextResponse.json({
        status: "pending",
        transactionId: txRecord.id,
        txHash: sendResult.signature,
        amount,
        fee,
        newBalance: parseFloat(newBalance),
        message:
          "Withdrawal submitted but confirmation is still pending. Your balance reflects the send. If the transaction doesn't appear in your wallet within 10 minutes, contact support with transaction ID " +
          txRecord.id +
          ".",
      });
    }

    // Large withdrawal — set to pending for admin review
    await supabase
      .from("transactions")
      .update({ status: "pending" })
      .eq("id", txRecord.id);

    trackServer(user.dbUserId, "withdrawal_requested", {
      amount_usd: amount,
      fee_usd: fee,
      currency: "USDC",
      chain: "solana",
      new_balance: parseFloat(newBalance),
      requires_review: true,
      wallet_address: trimmedDest,
    });

    return NextResponse.json({
      status: "pending",
      transactionId: txRecord.id,
      amount,
      fee,
      newBalance: parseFloat(newBalance),
      message: "Withdrawal is being reviewed. Usually processed within 1 hour.",
    });
  } catch (error) {
    console.error("Withdrawal error:", error);
    return NextResponse.json(
      { error: "Withdrawal failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/wallet/withdraw?transactionId=xxx
 * Check the status of a withdrawal.
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transactionId");

  const body = {};
  const user = await verifyRequest(request, body);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (transactionId) {
    // Get specific withdrawal
    const { data: tx } = await supabase
      .from("transactions")
      .select("id, amount, status, tx_hash, address, metadata, created_at, confirmed_at")
      .eq("id", transactionId)
      .eq("user_id", user.dbUserId)
      .eq("type", "withdrawal")
      .single();

    if (!tx) {
      return NextResponse.json(
        { error: "Withdrawal not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ withdrawal: tx });
  }

  // Get all withdrawals for this user
  const { data: withdrawals } = await supabase
    .from("transactions")
    .select("id, amount, status, tx_hash, address, metadata, created_at, confirmed_at")
    .eq("user_id", user.dbUserId)
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ withdrawals: withdrawals || [] });
}
