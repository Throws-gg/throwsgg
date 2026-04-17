import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentRace, tick } from "@/lib/racing/engine";
import { simulateRace } from "@/lib/racing/simulation";
import { RACE_TIMING } from "@/lib/racing/constants";
import type { RacePhase, RaceState, GroundCondition, RaceDistance } from "@/lib/racing/constants";

// In-memory cache — avoids hitting Supabase on every 2s poll
let cachedState: { data: unknown; raceId: string; status: string; timestamp: number } | null = null;
const CACHE_TTL = 1500; // 1.5 seconds

export async function GET() {
  const supabase = createAdminClient();

  try {
    // Check cache first — return immediately if fresh
    const cacheNow = Date.now();
    if (cachedState && cacheNow - cachedState.timestamp < CACHE_TTL) {
      // Still advance the engine in the background so the next cache miss
      // gets fresh data, but don't block this response.
      tick().catch(() => {});
      return NextResponse.json(cachedState.data);
    }

    // On cache miss, peek at the current race and decide: if the race looks
    // fresh (its server-side phase roughly matches wall clock), we can advance
    // the engine in background. If the race is *stale* (wall clock far past a
    // phase boundary), we block on a tick so the first-load user sees correct
    // state instead of the stale DB row.
    let current = await getCurrentRace();
    const staleThresholdMs = 2000;
    if (current) {
      const bettingClosesMs = new Date(current.betting_closes_at).getTime();
      const closedEndMs = bettingClosesMs + RACE_TIMING.CLOSED_DURATION * 1000;
      const raceEndMs = closedEndMs + RACE_TIMING.RACE_DURATION * 1000;
      const resultsEndMs = raceEndMs + RACE_TIMING.RESULTS_DURATION * 1000;

      const isStale =
        (current.status === "betting" && cacheNow >= bettingClosesMs + staleThresholdMs) ||
        (current.status === "closed" && cacheNow >= closedEndMs + staleThresholdMs) ||
        (current.status === "racing" && cacheNow >= raceEndMs + staleThresholdMs) ||
        (current.status === "settled" && cacheNow >= resultsEndMs + staleThresholdMs);

      if (isStale) {
        // Block on ticks so the response reflects the catch-up. A single
        // tick only advances one phase boundary (betting→closed, etc.), so
        // iterate up to a safety cap in case we're many phases behind.
        for (let i = 0; i < 5; i++) {
          await tick().catch(() => {});
          current = await getCurrentRace();
          if (!current) break;
          const bc = new Date(current.betting_closes_at).getTime();
          const ce = bc + RACE_TIMING.CLOSED_DURATION * 1000;
          const re = ce + RACE_TIMING.RACE_DURATION * 1000;
          const rx = re + RACE_TIMING.RESULTS_DURATION * 1000;
          const stillStale =
            (current.status === "betting" && cacheNow >= bc + staleThresholdMs) ||
            (current.status === "closed" && cacheNow >= ce + staleThresholdMs) ||
            (current.status === "racing" && cacheNow >= re + staleThresholdMs) ||
            (current.status === "settled" && cacheNow >= rx + staleThresholdMs);
          if (!stillStale) break;
        }
      } else {
        tick().catch(() => {});
      }
    } else {
      // No current race at all — block on a tick to kick one off.
      await tick().catch(() => {});
      current = await getCurrentRace();
    }

    if (!current) {
      return NextResponse.json({ waiting: true, message: "No active race" });
    }

    // Get entries with horse data
    const { data: entries } = await supabase
      .from("race_entries")
      .select("*, horses(*)")
      .eq("race_id", current.id)
      .order("gate_position", { ascending: true });

    // Get last settled race
    let lastRaceData = null;
    const { data: lastSettled } = await supabase
      .from("races")
      .select("*")
      .eq("status", "settled")
      .order("race_number", { ascending: false })
      .limit(1)
      .single();

    if (lastSettled && lastSettled.id !== current.id) {
      const { data: lastEntries } = await supabase
        .from("race_entries")
        .select("*, horses(name, color)")
        .eq("race_id", lastSettled.id)
        .order("finish_position", { ascending: true });

      lastRaceData = {
        id: lastSettled.id,
        raceNumber: lastSettled.race_number,
        entries: lastEntries || [],
        winningHorseId: lastSettled.winning_horse_id,
        commentary: lastSettled.commentary,
        serverSeed: lastSettled.server_seed,
      };
    }

    // Recent winners
    const { data: recentRaces } = await supabase
      .from("races")
      .select("race_number, winning_horse_id, race_entries!inner(horse_id, finish_position, horses(name, color))")
      .eq("status", "settled")
      .order("race_number", { ascending: false })
      .limit(10);

    const recentWinners = (recentRaces || [])
      .filter((r) => r.winning_horse_id)
      .map((r) => {
        const winnerEntry = (r.race_entries as unknown as { horse_id: number; finish_position: number; horses: { name: string; color: string } }[])
          ?.find((e) => e.finish_position === 1);
        return {
          raceNumber: r.race_number,
          horseName: winnerEntry?.horses?.name || "Unknown",
          horseColor: winnerEntry?.horses?.color || "#fff",
        };
      });

    // Calculate phase + time remaining
    const now = Date.now();
    const bettingClosesAt = new Date(current.betting_closes_at).getTime();
    const closedEndsAt = bettingClosesAt + RACE_TIMING.CLOSED_DURATION * 1000;
    const raceEndsAt = closedEndsAt + RACE_TIMING.RACE_DURATION * 1000;
    const resultsEndAt = raceEndsAt + RACE_TIMING.RESULTS_DURATION * 1000;

    let phase: RacePhase;
    let timeRemaining: number;

    if (current.status === "betting") {
      phase = "betting";
      timeRemaining = Math.max(0, Math.ceil((bettingClosesAt - now) / 1000));
    } else if (current.status === "closed") {
      phase = "closed";
      timeRemaining = Math.max(0, Math.ceil((closedEndsAt - now) / 1000));
    } else if (current.status === "racing") {
      phase = "racing";
      timeRemaining = Math.max(0, Math.ceil((raceEndsAt - now) / 1000));
    } else {
      phase = "results";
      timeRemaining = Math.max(0, Math.ceil((resultsEndAt - now) / 1000));
    }

    // Format entries
    const formattedEntries = (entries || []).map((e) => {
      const h = e.horses as unknown as Record<string, unknown>;
      return {
        id: e.id,
        horseId: e.horse_id,
        horse: {
          id: h.id as number,
          name: h.name as string,
          slug: h.slug as string,
          color: h.color as string,
          speed: h.speed as number,
          stamina: h.stamina as number,
          form: h.form as number,
          consistency: h.consistency as number,
          groundPreference: h.ground_preference as GroundCondition,
          careerRaces: h.career_races as number,
          careerWins: h.career_wins as number,
          careerPlaces: h.career_places as number,
          careerShows: h.career_shows as number,
          last5Results: (h.last_5_results as { raceNumber: number; position: number }[]) || [],
          distanceRecord: (h.distance_record as Record<string, { starts: number; wins: number; places: number }>) || {},
          groundRecord: (h.ground_record as Record<string, { starts: number; wins: number; places: number }>) || {},
          gateRecord: (h.gate_record as Record<string, { starts: number; wins: number }>) || {},
          speedRating: (h.speed_rating as number) || 70,
          avgFinish: (h.avg_finish as number) || 4.5,
        },
        gatePosition: e.gate_position,
        openingOdds: parseFloat(e.opening_odds),
        currentOdds: parseFloat(e.current_odds),
        placeOdds: e.place_odds ? parseFloat(e.place_odds) : parseFloat(e.current_odds) * 0.5,
        showOdds: e.show_odds ? parseFloat(e.show_odds) : parseFloat(e.current_odds) * 0.3,
        trueProbability: parseFloat(e.true_probability),
        powerScore: e.power_score ? parseFloat(e.power_score) : undefined,
        finishPosition: e.finish_position || undefined,
        margin: e.margin ? parseFloat(e.margin) : undefined,
      };
    });

    // Compute raceStartsAt — the moment the race phase begins.
    // If race_starts_at is set in DB (from runRace()), use that.
    // Otherwise derive it from betting_closes_at + CLOSED_DURATION.
    const raceStartsAt = current.race_starts_at
      ? current.race_starts_at
      : new Date(bettingClosesAt + RACE_TIMING.CLOSED_DURATION * 1000).toISOString();

    const state: RaceState = {
      currentRace: {
        id: current.id,
        raceNumber: current.race_number,
        status: current.status,
        distance: current.distance as RaceDistance,
        ground: current.ground as GroundCondition,
        serverSeedHash: current.server_seed_hash,
        bettingOpensAt: current.betting_opens_at,
        bettingClosesAt: current.betting_closes_at,
        raceStartsAt,
        betCount: current.bet_count,
        totalVolume: parseFloat(current.total_bet_amount),
        entries: formattedEntries,
        winningHorseId: current.winning_horse_id,
        commentary: current.commentary,
        // Include animation checkpoints during racing/results
        checkpoints: (current.status === "racing" || current.status === "settled")
          ? (() => {
              try {
                const simHorses = formattedEntries.map((e) => ({
                  id: e.horseId,
                  speed: e.horse.speed,
                  stamina: e.horse.stamina,
                  form: e.horse.form,
                  consistency: e.horse.consistency,
                  groundPreference: e.horse.groundPreference,
                }));
                const simResult = simulateRace(
                  current.server_seed, current.client_seed, current.nonce,
                  simHorses, current.distance as RaceDistance, current.ground as GroundCondition
                );
                return simResult.checkpoints;
              } catch { return undefined; }
            })()
          : undefined,
      },
      lastRace: lastRaceData,
      recentWinners,
      timeRemaining,
      phase,
    };

    // Cache the response
    cachedState = {
      data: state,
      raceId: current.id,
      status: current.status,
      timestamp: Date.now(),
    };

    return NextResponse.json(state);
  } catch (error) {
    console.error("Race state error:", error);
    // Return stale cache if available on error
    if (cachedState) return NextResponse.json(cachedState.data);
    return NextResponse.json({ error: "Failed to get race state" }, { status: 500 });
  }
}
