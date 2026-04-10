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

    // Validate bet type
    if (!["win", "place", "show"].includes(betType)) {
      return NextResponse.json({ error: "Invalid bet type" }, { status: 400 });
    }

    // Check race is open
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

    // Get horse odds from this race
    const { data: entry } = await supabase
      .from("race_entries")
      .select("current_odds, place_odds, show_odds")
      .eq("race_id", raceId)
      .eq("horse_id", horseId)
      .single();

    if (!entry) {
      return NextResponse.json({ error: "Horse not in this race" }, { status: 400 });
    }

    const lockedOdds = betType === "place"
      ? parseFloat(entry.place_odds || entry.current_odds * 0.5)
      : betType === "show"
        ? parseFloat(entry.show_odds || entry.current_odds * 0.3)
        : parseFloat(entry.current_odds);
    const potentialPayout = amount * lockedOdds;

    // Liability check — total potential payout on this horse shouldn't exceed max
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
      const maxBetForLiability = remainingLiability / lockedOdds;
      return NextResponse.json(
        { error: "Liability limit reached for this horse", maxBet: Math.floor(maxBetForLiability * 100) / 100 },
        { status: 400 }
      );
    }

    // Atomic bet placement with bonus-aware balance handling
    // Returns: { bet_id, cash_balance, bonus_balance, wagering_remaining,
    //            from_cash, from_bonus, bonus_converted, wagering_counted }
    const { data: result, error: betError } = await supabase.rpc(
      "place_race_bet_atomic",
      {
        p_user_id: userId,
        p_race_id: raceId,
        p_horse_id: horseId,
        p_amount: amount,
        p_odds: lockedOdds,
        p_potential_payout: potentialPayout,
        p_bet_type: betType,
      }
    );

    if (betError) {
      const msg = betError.message || "Failed to place bet";
      // Map known DB errors to clean HTTP responses
      if (msg.includes("Insufficient balance")) {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }
      if (msg.includes("Account is banned")) {
        return NextResponse.json({ error: "Account is banned" }, { status: 403 });
      }
      if (msg.includes("Max bet")) {
        return NextResponse.json({ error: msg.replace("ERROR:", "").trim() }, { status: 400 });
      }
      console.error("place_race_bet_atomic failed:", betError);
      return NextResponse.json({ error: "Failed to place bet" }, { status: 500 });
    }

    // If the referred user was just activated by this bet, flip the gate
    // (fire-and-forget — don't block the bet response)
    supabase.rpc("check_referral_activation", { p_user_id: userId }).then(() => {});

    return NextResponse.json({
      bet: {
        id: result.bet_id,
        horseId,
        amount,
        lockedOdds,
        potentialPayout,
        betType,
        status: "pending",
      },
      newBalance: parseFloat(result.cash_balance),
      bonusBalance: parseFloat(result.bonus_balance),
      wageringRemaining: parseFloat(result.wagering_remaining),
      fromCash: parseFloat(result.from_cash),
      fromBonus: parseFloat(result.from_bonus),
      bonusConverted: result.bonus_converted,
      wageringCounted: result.wagering_counted,
    });
  } catch (error) {
    console.error("Race bet error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
