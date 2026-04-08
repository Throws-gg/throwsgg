import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateServerSeed,
  hashServerSeed,
  generateOutcome,
} from "./provably-fair";
import { TIMING, CLIENT_SEED_DEFAULT } from "./constants";
import { postRoundResult } from "@/lib/chat/system-messages";
import type { Move, RoundResult, RoundStatus } from "./constants";

// Lazy-init: avoid build-time crash when env vars aren't set
let _supabase: ReturnType<typeof createAdminClient> | null = null;
function db() {
  if (!_supabase) _supabase = createAdminClient();
  return _supabase;
}

/**
 * Get the current active round.
 * Includes settled rounds that are still within their results display window.
 */
export async function getCurrentRound() {
  // First try non-settled rounds
  const { data: active, error: activeError } = await db()
    .from("rounds")
    .select("*")
    .neq("status", "settled")
    .order("round_number", { ascending: false })
    .limit(1)
    .single();

  if (active) return active;

  if (activeError && activeError.code !== "PGRST116") {
    throw new Error(`Failed to get current round: ${activeError.message}`);
  }

  // Check if the most recent settled round is still in its results display window
  const { data: lastSettled } = await db()
    .from("rounds")
    .select("*")
    .eq("status", "settled")
    .order("round_number", { ascending: false })
    .limit(1)
    .single();

  if (lastSettled) {
    const bettingClosesAt = new Date(lastSettled.betting_closes_at).getTime();
    const resultsEndAt =
      bettingClosesAt +
      (TIMING.COUNTDOWN_DURATION + TIMING.BATTLE_DURATION + TIMING.RESULTS_DURATION) * 1000;

    if (Date.now() < resultsEndAt) {
      return lastSettled; // Still in results display window
    }
  }

  return null;
}

/**
 * Get the next round number.
 */
async function getNextRoundNumber(): Promise<number> {
  const { data } = await db()
    .from("rounds")
    .select("round_number")
    .order("round_number", { ascending: false })
    .limit(1)
    .single();

  return data ? data.round_number + 1 : 1;
}

/**
 * Create a new round with provably fair seeds and timing.
 */
export async function createNextRound() {
  const roundNumber = await getNextRoundNumber();
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);

  const now = new Date();
  const bettingOpensAt = now.toISOString();
  const bettingClosesAt = new Date(
    now.getTime() + TIMING.BETTING_WINDOW * 1000
  ).toISOString();

  const { data, error } = await db()
    .from("rounds")
    .insert({
      round_number: roundNumber,
      status: "betting",
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: CLIENT_SEED_DEFAULT,
      nonce: roundNumber,
      betting_opens_at: bettingOpensAt,
      betting_closes_at: bettingClosesAt,
    })
    .select()
    .single();

  if (error) {
    // Duplicate key = another tick already created this round, just fetch it
    if (error.code === "23505") {
      const { data: existing } = await db()
        .from("rounds")
        .select("*")
        .eq("round_number", roundNumber)
        .single();
      if (existing) return existing;
    }
    throw new Error(`Failed to create round: ${error.message}`);
  }

  return data;
}

/**
 * Lock the round — no more bets accepted.
 */
export async function lockRound(roundId: string) {
  const { error } = await db()
    .from("rounds")
    .update({ status: "locked" })
    .eq("id", roundId)
    .eq("status", "betting");

  if (error) {
    throw new Error(`Failed to lock round: ${error.message}`);
  }
}

/**
 * Play the round — generate outcome and update to 'playing'.
 */
export async function playRound(roundId: string) {
  // Get the round to access seeds
  const { data: round, error: fetchError } = await db()
    .from("rounds")
    .select("server_seed, client_seed, nonce")
    .eq("id", roundId)
    .single();

  if (fetchError || !round) {
    throw new Error(`Failed to fetch round: ${fetchError?.message}`);
  }

  const outcome = generateOutcome(
    round.server_seed,
    round.client_seed,
    round.nonce
  );

  const { error } = await db()
    .from("rounds")
    .update({
      status: "playing",
      violet_move: outcome.violetMove,
      magenta_move: outcome.magentaMove,
      result: outcome.result,
      winning_move: outcome.winningMove,
    })
    .eq("id", roundId)
    .eq("status", "locked");

  if (error) {
    throw new Error(`Failed to play round: ${error.message}`);
  }

  return outcome;
}

/**
 * Settle the round — pay out winners via the settle_round SQL function.
 */
export async function settleRound(roundId: string) {
  // Get the round data needed for settlement
  const { data: round, error: fetchError } = await db()
    .from("rounds")
    .select("violet_move, magenta_move, result, winning_move, server_seed")
    .eq("id", roundId)
    .single();

  if (fetchError || !round) {
    throw new Error(`Failed to fetch round for settlement: ${fetchError?.message}`);
  }

  const { error } = await db().rpc("settle_round", {
    p_round_id: roundId,
    p_violet_move: round.violet_move,
    p_magenta_move: round.magenta_move,
    p_result: round.result,
    p_winning_move: round.winning_move,
    p_server_seed: round.server_seed,
  });

  if (error) {
    throw new Error(`Failed to settle round: ${error.message}`);
  }
}

// Simple in-memory lock to prevent concurrent ticks
let tickInProgress = false;

/**
 * Main tick function — called periodically to advance game state.
 * Checks the current round's timing and transitions as needed.
 * Uses a lock to prevent concurrent ticks from racing.
 */
export async function tick() {
  if (tickInProgress) {
    return { action: "skipped", status: "tick_in_progress" };
  }
  tickInProgress = true;
  try {
    return await tickInner();
  } finally {
    tickInProgress = false;
  }
}

async function tickInner() {
  const now = Date.now();
  let round = await getCurrentRound();

  // No active round — create one
  if (!round) {
    round = await createNextRound();
    return { action: "created", roundId: round.id, status: "betting" };
  }

  const bettingClosesAt = new Date(round.betting_closes_at).getTime();
  const countdownEndsAt = bettingClosesAt + TIMING.COUNTDOWN_DURATION * 1000;
  const battleEndsAt = countdownEndsAt + TIMING.BATTLE_DURATION * 1000;
  const resultsEndAt = battleEndsAt + TIMING.RESULTS_DURATION * 1000;

  const status: RoundStatus = round.status;

  // BETTING → LOCKED (when betting window closes)
  if (status === "betting" && now >= bettingClosesAt) {
    await lockRound(round.id);
    return { action: "locked", roundId: round.id, status: "locked" };
  }

  // LOCKED → PLAYING (after countdown)
  if (status === "locked" && now >= countdownEndsAt) {
    const outcome = await playRound(round.id);
    return { action: "played", roundId: round.id, status: "playing", outcome };
  }

  // PLAYING → SETTLED (after battle animation)
  if (status === "playing" && now >= battleEndsAt) {
    await settleRound(round.id);

    // Post round result to chat
    try {
      await postRoundResult(
        round.round_number,
        round.result,
        round.winning_move,
        round.violet_move,
        round.magenta_move
      );
    } catch {
      // Non-fatal — chat message failure shouldn't break the game
    }

    return { action: "settled", roundId: round.id, status: "settled" };
  }

  // SETTLED → new round (after results display)
  if (status === "settled" && now >= resultsEndAt) {
    const newRound = await createNextRound();
    return { action: "new_round", roundId: newRound.id, status: "betting" };
  }

  return { action: "waiting", roundId: round.id, status };
}
