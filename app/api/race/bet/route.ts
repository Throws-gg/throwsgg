import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BANKROLL_RACING } from "@/lib/racing/constants";
import { verifyRequest } from "@/lib/auth/verify-request";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const authed = await verifyRequest(request, body);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Always use the authenticated userId — ignore any client-provided value
    const userId = authed.dbUserId;
    const { raceId, horseId, amount, betType = "win" } = body;

    if (!raceId || !horseId || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (amount < 0.10) {
      return NextResponse.json({ error: "Minimum bet is $0.10" }, { status: 400 });
    }

    if (amount > BANKROLL_RACING.MAX_BET) {
      return NextResponse.json({ error: `Maximum bet is $${BANKROLL_RACING.MAX_BET}` }, { status: 400 });
    }

    // Check user
    const { data: user } = await supabase
      .from("users")
      .select("id, balance, is_banned")
      .eq("id", userId)
      .single();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (user.is_banned) return NextResponse.json({ error: "Account is banned" }, { status: 403 });
    if (parseFloat(user.balance) < amount) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // Check race
    const { data: race } = await supabase
      .from("races")
      .select("id, status, betting_closes_at")
      .eq("id", raceId)
      .single();

    if (!race) return NextResponse.json({ error: "Race not found" }, { status: 404 });
    if (race.status !== "betting") {
      return NextResponse.json({ error: "Betting is closed" }, { status: 400 });
    }
    if (new Date(race.betting_closes_at) <= new Date()) {
      return NextResponse.json({ error: "Betting window has closed" }, { status: 400 });
    }

    // Validate bet type
    if (!["win", "place", "show"].includes(betType)) {
      return NextResponse.json({ error: "Invalid bet type" }, { status: 400 });
    }

    // Check horse is in this race + get odds
    const { data: entry } = await supabase
      .from("race_entries")
      .select("current_odds, place_odds, show_odds")
      .eq("race_id", raceId)
      .eq("horse_id", horseId)
      .single();

    if (!entry) {
      return NextResponse.json({ error: "Horse not in this race" }, { status: 400 });
    }

    // Get the correct odds for the bet type
    const lockedOdds = betType === "place"
      ? parseFloat(entry.place_odds || entry.current_odds * 0.5)
      : betType === "show"
        ? parseFloat(entry.show_odds || entry.current_odds * 0.3)
        : parseFloat(entry.current_odds);
    const potentialPayout = amount * lockedOdds;

    // Check liability — total potential payout on this horse shouldn't exceed max
    const maxLiability = BANKROLL_RACING.INITIAL * BANKROLL_RACING.MAX_RACE_LIABILITY_RATIO;
    const { data: existingBets } = await supabase
      .from("race_bets")
      .select("potential_payout")
      .eq("race_id", raceId)
      .eq("horse_id", horseId)
      .eq("status", "pending");

    const currentLiability = (existingBets || []).reduce(
      (sum, b) => sum + parseFloat(b.potential_payout), 0
    );

    const remainingLiability = maxLiability - currentLiability;

    if (currentLiability + potentialPayout > maxLiability) {
      // Calculate max bet amount this user could place
      const maxBetForLiability = remainingLiability / lockedOdds;
      return NextResponse.json(
        { error: "Liability limit reached for this horse", maxBet: Math.floor(maxBetForLiability * 100) / 100 },
        { status: 400 }
      );
    }

    // Deduct balance
    const { data: newBalance, error: balanceError } = await supabase.rpc("update_balance", {
      p_user_id: userId,
      p_amount: -amount,
      p_type: "bet",
    });

    if (balanceError) {
      return NextResponse.json({ error: "Failed to deduct balance" }, { status: 400 });
    }

    // Place bet
    const { data: bet, error: betError } = await supabase
      .from("race_bets")
      .insert({
        user_id: userId,
        race_id: raceId,
        horse_id: horseId,
        amount,
        locked_odds: lockedOdds,
        potential_payout: potentialPayout,
        bet_type: betType,
      })
      .select()
      .single();

    if (betError) {
      // Refund on failure
      await supabase.rpc("update_balance", {
        p_user_id: userId,
        p_amount: amount,
        p_type: "push_refund",
      });
      return NextResponse.json({ error: "Failed to place bet" }, { status: 500 });
    }

    // Update race totals
    await supabase.rpc("increment_race_bets", { p_race_id: raceId, p_amount: amount });
    await supabase.rpc("increment_wagered", { p_user_id: userId, p_amount: amount });

    return NextResponse.json({
      bet: {
        id: bet.id,
        horseId: bet.horse_id,
        amount: parseFloat(bet.amount),
        lockedOdds: parseFloat(bet.locked_odds),
        potentialPayout: parseFloat(bet.potential_payout),
        betType: bet.bet_type,
        status: bet.status,
      },
      newBalance: parseFloat(newBalance),
    });
  } catch (error) {
    console.error("Race bet error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
