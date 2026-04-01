import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYOUTS, LIMITS, BANKROLL } from "@/lib/game/constants";
import type { BetType, BetCategory } from "@/lib/game/constants";

const MOVE_BETS: BetType[] = ["rock", "paper", "scissors", "draw"];

function getBetCategory(betType: BetType): BetCategory {
  return MOVE_BETS.includes(betType) ? "move" : "player";
}

/**
 * POST /api/bet/place
 * Place a bet or add to an existing bet on the same type.
 * Users can bet on multiple outcomes per round.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { userId, roundId, betType, amount } = body as {
      userId: string;
      roundId: string;
      betType: BetType;
      amount: number;
    };

    // --- Validation ---
    if (!userId || !roundId || !betType || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!(betType in PAYOUTS)) {
      return NextResponse.json(
        { error: "Invalid bet type" },
        { status: 400 }
      );
    }

    if (amount < LIMITS.MIN_BET) {
      return NextResponse.json(
        { error: `Minimum bet is $${LIMITS.MIN_BET.toFixed(2)}` },
        { status: 400 }
      );
    }

    const maxBet = BANKROLL.MAX_BET;
    const betCategory = getBetCategory(betType);
    const multiplier = PAYOUTS[betType];

    // --- User checks ---
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, balance, is_banned, self_excluded_until")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.is_banned) {
      return NextResponse.json({ error: "Account is banned" }, { status: 403 });
    }

    if (
      user.self_excluded_until &&
      new Date(user.self_excluded_until) > new Date()
    ) {
      return NextResponse.json(
        { error: "Account is self-excluded" },
        { status: 403 }
      );
    }

    if (parseFloat(user.balance) < amount) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }

    // --- Round checks ---
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("id, status, betting_closes_at")
      .eq("id", roundId)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    if (round.status !== "betting") {
      return NextResponse.json(
        { error: "Bets are locked for this round" },
        { status: 400 }
      );
    }

    if (new Date(round.betting_closes_at) <= new Date()) {
      return NextResponse.json(
        { error: "Betting window has closed" },
        { status: 400 }
      );
    }

    // --- Check if user already has a bet on this exact type ---
    const { data: existingBet } = await supabase
      .from("bets")
      .select("id, amount")
      .eq("user_id", userId)
      .eq("round_id", roundId)
      .eq("bet_type", betType)
      .eq("status", "pending")
      .single();

    // Check max bet (total on this type including existing)
    const existingAmount = existingBet
      ? parseFloat(existingBet.amount)
      : 0;
    const newTotal = existingAmount + amount;

    if (newTotal > maxBet) {
      return NextResponse.json(
        { error: `Maximum bet on ${betType} is $${maxBet}` },
        { status: 400 }
      );
    }

    // --- Place the bet ---

    // 1. Deduct balance
    const { data: newBalance, error: balanceError } = await supabase.rpc(
      "update_balance",
      {
        p_user_id: userId,
        p_amount: -amount,
        p_type: "bet",
        p_round_id: roundId,
      }
    );

    if (balanceError) {
      return NextResponse.json(
        { error: "Failed to deduct balance" },
        { status: 400 }
      );
    }

    let bet;

    if (existingBet) {
      // Stack onto existing bet
      const { data: updated, error: updateError } = await supabase
        .from("bets")
        .update({ amount: newTotal })
        .eq("id", existingBet.id)
        .select()
        .single();

      if (updateError) {
        // Refund on failure
        await supabase.rpc("update_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_type: "push_refund",
          p_round_id: roundId,
        });
        return NextResponse.json(
          { error: "Failed to update bet" },
          { status: 500 }
        );
      }
      bet = updated;
    } else {
      // Create new bet
      const { data: created, error: betError } = await supabase
        .from("bets")
        .insert({
          user_id: userId,
          round_id: roundId,
          bet_type: betType,
          bet_category: betCategory,
          amount,
          multiplier,
        })
        .select()
        .single();

      if (betError) {
        // Refund on failure
        await supabase.rpc("update_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_type: "push_refund",
          p_round_id: roundId,
        });
        return NextResponse.json(
          { error: "Failed to place bet" },
          { status: 500 }
        );
      }
      bet = created;
    }

    // 3. Update round totals + user wagered
    await supabase.rpc("increment_round_bets", {
      p_round_id: roundId,
      p_amount: amount,
    });

    await supabase.rpc("increment_wagered", {
      p_user_id: userId,
      p_amount: amount,
    });

    return NextResponse.json({
      bet: {
        id: bet.id,
        betType: bet.bet_type,
        betCategory: bet.bet_category,
        amount: parseFloat(bet.amount),
        multiplier: parseFloat(bet.multiplier),
        status: bet.status,
        isStacked: !!existingBet,
      },
      newBalance: parseFloat(newBalance),
    });
  } catch (error) {
    console.error("Place bet error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
