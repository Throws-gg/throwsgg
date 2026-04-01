import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/bet/cancel
 * Cancel bets and refund the user.
 * Supports: single bet (betId) or all bets for a round (roundId).
 * Only works during betting phase.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const { betId, userId, roundId, clearAll } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 }
      );
    }

    // Clear all bets for a round
    if (clearAll && roundId) {
      // Check round is still in betting phase
      const { data: round } = await supabase
        .from("rounds")
        .select("status")
        .eq("id", roundId)
        .single();

      if (round?.status !== "betting") {
        return NextResponse.json(
          { error: "Bets are locked — too late to cancel" },
          { status: 400 }
        );
      }

      // Get all pending bets for this user + round
      const { data: bets } = await supabase
        .from("bets")
        .select("id, amount")
        .eq("user_id", userId)
        .eq("round_id", roundId)
        .eq("status", "pending");

      if (!bets || bets.length === 0) {
        return NextResponse.json({ success: true, newBalance: 0 });
      }

      const totalRefund = bets.reduce(
        (sum, b) => sum + parseFloat(b.amount),
        0
      );

      // Refund total
      const { data: newBalance, error: refundError } = await supabase.rpc(
        "update_balance",
        {
          p_user_id: userId,
          p_amount: totalRefund,
          p_type: "push_refund",
          p_round_id: roundId,
        }
      );

      if (refundError) {
        return NextResponse.json(
          { error: "Failed to refund" },
          { status: 500 }
        );
      }

      // Cancel all bets
      const betIds = bets.map((b) => b.id);
      await supabase
        .from("bets")
        .update({
          status: "cancelled",
          settled_at: new Date().toISOString(),
        })
        .in("id", betIds);

      // Decrement round totals
      await supabase.rpc("increment_round_bets", {
        p_round_id: roundId,
        p_amount: -totalRefund,
      });

      return NextResponse.json({
        success: true,
        cancelledCount: bets.length,
        refunded: totalRefund,
        newBalance: parseFloat(newBalance),
      });
    }

    // Cancel single bet
    if (!betId) {
      return NextResponse.json(
        { error: "betId or clearAll+roundId required" },
        { status: 400 }
      );
    }

    const { data: bet, error: betError } = await supabase
      .from("bets")
      .select("*, rounds(status)")
      .eq("id", betId)
      .eq("user_id", userId)
      .single();

    if (betError || !bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (bet.status !== "pending") {
      return NextResponse.json(
        { error: "Can only cancel pending bets" },
        { status: 400 }
      );
    }

    const round = bet.rounds as { status: string } | null;
    if (round?.status !== "betting") {
      return NextResponse.json(
        { error: "Bets are locked — too late to cancel" },
        { status: 400 }
      );
    }

    const { data: newBalance, error: refundError } = await supabase.rpc(
      "update_balance",
      {
        p_user_id: userId,
        p_amount: parseFloat(bet.amount),
        p_type: "push_refund",
        p_round_id: bet.round_id,
        p_bet_id: betId,
      }
    );

    if (refundError) {
      return NextResponse.json(
        { error: "Failed to refund" },
        { status: 500 }
      );
    }

    await supabase
      .from("bets")
      .update({ status: "cancelled", settled_at: new Date().toISOString() })
      .eq("id", betId);

    await supabase.rpc("increment_round_bets", {
      p_round_id: bet.round_id,
      p_amount: -parseFloat(bet.amount),
    });

    return NextResponse.json({
      success: true,
      newBalance: parseFloat(newBalance),
    });
  } catch (error) {
    console.error("Cancel bet error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
