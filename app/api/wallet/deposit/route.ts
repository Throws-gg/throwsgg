import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWalletBalances } from "@/lib/wallet/solana";
import { trackServer, identifyServer } from "@/lib/analytics/posthog-server";

/**
 * POST /api/wallet/deposit
 * Check for new deposits by comparing on-chain balance vs last known balance.
 * If new funds detected, credit the user's game balance.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const { userId, walletAddress } = await request.json();

    if (!userId || !walletAddress) {
      return NextResponse.json({ error: "userId and walletAddress required" }, { status: 400 });
    }

    // Get current on-chain balances
    const balances = await getWalletBalances(walletAddress);

    // Get or create the deposit tracking record
    const { data: existing } = await supabase
      .from("deposit_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("chain", "solana")
      .single();

    if (!existing) {
      // First time — save the wallet address and current balances as baseline
      await supabase.from("deposit_addresses").insert({
        user_id: userId,
        chain: "solana",
        address: walletAddress,
        derivation_index: 0,
      });

      // Store baseline in metadata
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: 0,
        balance_after: 0,
        currency: "USD",
        status: "confirmed",
        address: walletAddress,
        metadata: {
          type: "baseline",
          sol_lamports: balances.solLamports,
          usdc: balances.usdc,
        },
      });

      return NextResponse.json({
        status: "baseline_set",
        balances,
        credited: 0,
      });
    }

    // Get the last known balances from the most recent deposit transaction
    const { data: lastTx } = await supabase
      .from("transactions")
      .select("metadata")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const lastSolLamports = (lastTx?.metadata as Record<string, number>)?.sol_lamports || 0;
    const lastUsdc = (lastTx?.metadata as Record<string, number>)?.usdc || 0;

    // Calculate new deposits
    const newUsdc = Math.max(0, balances.usdc - lastUsdc);
    const newSolLamports = Math.max(0, balances.solLamports - lastSolLamports);
    const newSolUsd = newSolLamports > 0
      ? (balances.solUsd / (balances.solLamports || 1)) * newSolLamports
      : 0;

    const totalNewUsd = newUsdc + newSolUsd;

    if (totalNewUsd < 0.01) {
      return NextResponse.json({
        status: "no_new_deposits",
        balances,
        credited: 0,
      });
    }

    // Credit the user's game balance
    const { data: newBalance, error: balanceError } = await supabase.rpc(
      "update_balance",
      {
        p_user_id: userId,
        p_amount: totalNewUsd,
        p_type: "deposit",
        p_currency: "USD",
        p_address: walletAddress,
        p_metadata: {
          sol_lamports: balances.solLamports,
          usdc: balances.usdc,
          new_usdc: newUsdc,
          new_sol_usd: newSolUsd,
        },
      }
    );

    if (balanceError) {
      trackServer(userId, "deposit_failed", {
        amount_usd: totalNewUsd,
        currency: newUsdc > 0 ? "USDC" : "SOL",
        chain: "solana",
        error_type: "balance_credit_failed",
      });
      return NextResponse.json({ error: "Failed to credit balance" }, { status: 500 });
    }

    // Check if this is the user's first deposit
    const { data: depositCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .gt("amount", 0);

    const isFirstDeposit = (depositCount as unknown as number) <= 1;

    trackServer(userId, "deposit_completed", {
      amount_usd: totalNewUsd,
      currency: newUsdc > 0 ? "USDC" : "SOL",
      chain: "solana",
      new_usdc: newUsdc,
      new_sol_usd: newSolUsd,
      new_balance: parseFloat(newBalance),
      is_first_deposit: isFirstDeposit,
      wallet_address: walletAddress,
    });

    // Update user properties
    identifyServer(userId, {
      last_deposit_at: new Date().toISOString(),
      has_deposited: true,
    });

    return NextResponse.json({
      status: "deposited",
      credited: totalNewUsd,
      balances,
      newBalance: parseFloat(newBalance),
    });
  } catch (error) {
    console.error("Deposit check error:", error);
    return NextResponse.json({ error: "Failed to check deposits" }, { status: 500 });
  }
}

/**
 * GET /api/wallet/deposit?userId=xxx&walletAddress=xxx
 * Get current on-chain balances without crediting.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress");

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
  }

  try {
    const balances = await getWalletBalances(walletAddress);
    return NextResponse.json({ balances });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch balances" }, { status: 500 });
  }
}
