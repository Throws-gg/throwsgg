import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * POST /api/race/bet/cancel
 * Cancel a pending bet. Only allowed while the race is still in the betting phase.
 * Refunds the stake to the user's balance.
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

    if (!betId) {
      return NextResponse.json({ error: "betId required" }, { status: 400 });
    }

    // Fetch the bet — must belong to this user and still be pending
    const { data: bet, error: betFetchError } = await supabase
      .from("race_bets")
      .select("id, user_id, race_id, amount, status")
      .eq("id", betId)
      .single();

    if (betFetchError || !bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (bet.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (bet.status !== "pending") {
      return NextResponse.json(
        { error: "Bet cannot be cancelled — already settled" },
        { status: 400 }
      );
    }

    // Check the race is still in betting phase
    const { data: race } = await supabase
      .from("races")
      .select("id, status, betting_closes_at")
      .eq("id", bet.race_id)
      .single();

    if (!race) {
      return NextResponse.json({ error: "Race not found" }, { status: 404 });
    }

    if (race.status !== "betting") {
      return NextResponse.json(
        { error: "Cannot cancel — betting is closed" },
        { status: 400 }
      );
    }

    if (new Date(race.betting_closes_at) <= new Date()) {
      return NextResponse.json(
        { error: "Cannot cancel — betting window has closed" },
        { status: 400 }
      );
    }

    const amount = parseFloat(bet.amount);

    // Mark bet as cancelled
    const { error: updateError } = await supabase
      .from("race_bets")
      .update({ status: "cancelled", settled_at: new Date().toISOString() })
      .eq("id", betId)
      .eq("status", "pending"); // concurrency guard — only cancel if still pending

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to cancel bet" },
        { status: 500 }
      );
    }

    // Refund the stake
    const { data: newBalance, error: refundError } = await supabase.rpc(
      "update_balance",
      {
        p_user_id: userId,
        p_amount: amount,
        p_type: "push_refund",
      }
    );

    if (refundError) {
      console.error("Refund failed for cancelled bet:", refundError);
      // Bet is cancelled but refund failed — this needs manual reconciliation
      return NextResponse.json(
        { error: "Bet cancelled but refund failed. Contact support." },
        { status: 500 }
      );
    }

    // Reverse the race totals (decrement both amount and count)
    const { data: currentRace } = await supabase
      .from("races")
      .select("total_bet_amount, bet_count")
      .eq("id", bet.race_id)
      .single();

    if (currentRace) {
      await supabase
        .from("races")
        .update({
          total_bet_amount: Math.max(0, parseFloat(currentRace.total_bet_amount) - amount),
          bet_count: Math.max(0, currentRace.bet_count - 1),
        })
        .eq("id", bet.race_id);
    }

    return NextResponse.json({
      cancelled: true,
      betId,
      refunded: amount,
      newBalance: parseFloat(newBalance),
    });
  } catch (error) {
    console.error("Race bet cancel error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
