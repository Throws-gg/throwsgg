import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * POST /api/race/bet/cancel
 * Cancel a pending bet during the betting phase. Routes the refund back to
 * the cash/bonus buckets in the same proportions the stake came from,
 * restores wagering_remaining if the original bet counted toward it, and
 * reverses total_wagered. All atomic via cancel_race_bet_atomic (migration 024).
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const authed = await verifyRequest(request, body);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authed.dbUserId;
    const { betId } = body as { betId?: string };

    if (!betId || typeof betId !== "string") {
      return NextResponse.json({ error: "betId required" }, { status: 400 });
    }

    const { data: result, error: rpcError } = await supabase.rpc(
      "cancel_race_bet_atomic",
      {
        p_user_id: userId,
        p_bet_id: betId,
      }
    );

    if (rpcError) {
      const msg = rpcError.message || "Failed to cancel bet";
      if (msg.includes("Bet not found")) {
        return NextResponse.json({ error: "Bet not found" }, { status: 404 });
      }
      if (msg.includes("Forbidden")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (msg.includes("Bet not pending") || msg.includes("Bet already settled")) {
        return NextResponse.json(
          { error: "Bet cannot be cancelled — already settled" },
          { status: 400 }
        );
      }
      if (msg.includes("Race not found")) {
        return NextResponse.json({ error: "Race not found" }, { status: 404 });
      }
      if (msg.includes("Betting closed") || msg.includes("Betting window closed")) {
        return NextResponse.json(
          { error: "Cannot cancel — betting window has closed" },
          { status: 400 }
        );
      }
      console.error("cancel_race_bet_atomic failed:", rpcError);
      return NextResponse.json(
        { error: "Failed to cancel bet" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cancelled: true,
      betId,
      refunded: parseFloat(result.refunded),
      refundToCash: parseFloat(result.refund_to_cash),
      refundToBonus: parseFloat(result.refund_to_bonus),
      wageringRestored: result.wagering_restored,
      newBalance: parseFloat(result.cash_balance),
      bonusBalance: parseFloat(result.bonus_balance),
      wageringRemaining: parseFloat(result.wagering_remaining),
    });
  } catch (error) {
    console.error("Race bet cancel error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
