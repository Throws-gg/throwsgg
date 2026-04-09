import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentRound, tick } from "@/lib/game/engine";
import { TIMING } from "@/lib/game/constants";
import type { GameState, RoundPhase, RoundResult, Move } from "@/lib/game/constants";

/**
 * GET /api/game/state
 * Returns the current game state for clients.
 * Public endpoint — no auth required.
 *
 * Also advances the game engine if needed — this ensures the game
 * keeps running even when no browser tab is actively ticking.
 */
export async function GET() {
  const supabase = createAdminClient();

  try {
    // Advance engine in background — don't block state response
    tick().catch(() => {});

    // Use the engine's getCurrentRound which handles the results window
    const current = await getCurrentRound();

    // Get the last settled round that ISN'T the current round
    const { data: last } = await supabase
      .from("rounds")
      .select("*")
      .eq("status", "settled")
      .order("round_number", { ascending: false })
      .limit(1)
      .single();

    // If the current round IS the last settled round, get the one before it
    let lastRoundData = last;
    if (current && last && current.id === last.id) {
      const { data: prev } = await supabase
        .from("rounds")
        .select("*")
        .eq("status", "settled")
        .lt("round_number", last.round_number)
        .order("round_number", { ascending: false })
        .limit(1)
        .single();
      lastRoundData = prev;
    }

    // Get recent results (last 20 settled rounds) with winning move
    const { data: recent } = await supabase
      .from("rounds")
      .select("result, winning_move")
      .eq("status", "settled")
      .order("round_number", { ascending: false })
      .limit(20);

    // Get round winner stats if current round is settled (results phase)
    let roundWinners: { winnerCount: number; totalPayout: number } | null =
      null;
    if (current && current.status === "settled") {
      const { data: winnerStats } = await supabase
        .from("bets")
        .select("payout")
        .eq("round_id", current.id)
        .eq("status", "won");

      if (winnerStats && winnerStats.length > 0) {
        roundWinners = {
          winnerCount: winnerStats.length,
          totalPayout: winnerStats.reduce(
            (sum: number, b: { payout: string | number | null }) =>
              sum + (b.payout ? parseFloat(String(b.payout)) : 0),
            0
          ),
        };
      }
    }

    if (!current) {
      return NextResponse.json({ waiting: true, message: "No active round" });
    }

    // Calculate phase and time remaining
    const now = Date.now();
    const bettingClosesAt = new Date(current.betting_closes_at).getTime();
    const countdownEndsAt = bettingClosesAt + TIMING.COUNTDOWN_DURATION * 1000;
    const battleEndsAt = countdownEndsAt + TIMING.BATTLE_DURATION * 1000;
    const resultsEndAt = battleEndsAt + TIMING.RESULTS_DURATION * 1000;

    let phase: RoundPhase;
    let timeRemaining: number;

    if (current.status === "betting") {
      phase = "betting";
      timeRemaining = Math.max(0, Math.ceil((bettingClosesAt - now) / 1000));
    } else if (current.status === "locked") {
      phase = "countdown";
      timeRemaining = Math.max(0, Math.ceil((countdownEndsAt - now) / 1000));
    } else if (current.status === "playing") {
      phase = "battle";
      timeRemaining = Math.max(0, Math.ceil((battleEndsAt - now) / 1000));
    } else {
      // settled — show as results phase
      phase = "results";
      timeRemaining = Math.max(0, Math.ceil((resultsEndAt - now) / 1000));
    }

    const state: GameState = {
      currentRound: {
        id: current.id,
        roundNumber: current.round_number,
        status: current.status,
        serverSeedHash: current.server_seed_hash,
        bettingOpensAt: current.betting_opens_at,
        bettingClosesAt: current.betting_closes_at,
        betCount: current.bet_count,
        totalVolume: parseFloat(current.total_bet_amount),
        violetMove: current.violet_move || null,
        magentaMove: current.magenta_move || null,
        result: current.result || null,
        winningMove: current.winning_move || null,
      },
      lastRound: lastRoundData
        ? {
            id: lastRoundData.id,
            roundNumber: lastRoundData.round_number,
            violetMove: lastRoundData.violet_move,
            magentaMove: lastRoundData.magenta_move,
            result: lastRoundData.result,
            winningMove: lastRoundData.winning_move,
            serverSeed: lastRoundData.server_seed,
          }
        : null,
      recentResults: (recent || []).map(
        (r: { result: string; winning_move: string | null }) => ({
          result: r.result as RoundResult,
          winningMove: (r.winning_move as Move) || null,
        })
      ),
      roundWinners,
      timeRemaining,
      phase,
      onlineCount: 0,
    };

    return NextResponse.json(state);
  } catch (error) {
    console.error("Game state error:", error);
    return NextResponse.json(
      { error: "Failed to get game state" },
      { status: 500 }
    );
  }
}
