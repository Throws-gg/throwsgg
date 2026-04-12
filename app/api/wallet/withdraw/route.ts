import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";
import { isValidSolanaAddress, sendUsdc } from "@/lib/wallet/send-usdc";
import { LIMITS, WITHDRAWAL_FEES } from "@/lib/game/constants";
import { trackServer } from "@/lib/analytics/posthog-server";

// Auto-send threshold — withdrawals above this require manual admin approval
const AUTO_SEND_THRESHOLD = 100;

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

    if (!destinationAddress || !isValidSolanaAddress(destinationAddress)) {
      return NextResponse.json(
        { error: "Invalid Solana wallet address" },
        { status: 400 }
      );
    }

    // Check user is not banned
    const { data: userData } = await supabase
      .from("users")
      .select("balance, is_banned, self_excluded_until")
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

    // --- Deduct balance atomically ---
    const { data: newBalance, error: balanceError } = await supabase.rpc(
      "update_balance",
      {
        p_user_id: user.dbUserId,
        p_amount: -totalDeduction,
        p_type: "withdrawal",
        p_currency: "USD",
        p_address: destinationAddress,
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
      .eq("address", destinationAddress)
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
      // Set to pending first — the update_balance function creates it as 'confirmed'
      // so we need to track it differently. We'll attempt the on-chain send now.
      try {
        const txHash = await sendUsdc(destinationAddress, amount);

        // Mark as confirmed with tx hash
        await supabase
          .from("transactions")
          .update({
            tx_hash: txHash,
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
          tx_hash: txHash,
          new_balance: parseFloat(newBalance),
          auto_sent: true,
          wallet_address: destinationAddress,
        });

        return NextResponse.json({
          status: "completed",
          transactionId: txRecord.id,
          txHash,
          amount,
          fee,
          newBalance: parseFloat(newBalance),
        });
      } catch (sendError) {
        // On-chain send failed — refund the balance and mark as failed
        console.error("Auto-send failed:", sendError);

        await supabase.rpc("update_balance", {
          p_user_id: user.dbUserId,
          p_amount: totalDeduction,
          p_type: "deposit",
          p_currency: "USD",
          p_metadata: {
            type: "withdrawal_refund",
            original_tx: txRecord.id,
          },
        });

        await supabase
          .from("transactions")
          .update({ status: "failed" })
          .eq("id", txRecord.id);

        trackServer(user.dbUserId, "withdrawal_failed", {
          amount_usd: amount,
          currency: "USDC",
          chain: "solana",
          error_type: "on_chain_send_failed",
          wallet_address: destinationAddress,
        });

        return NextResponse.json(
          { error: "Withdrawal failed — balance refunded. Please try again." },
          { status: 500 }
        );
      }
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
      wallet_address: destinationAddress,
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
