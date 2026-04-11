import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/big-wins
 *
 * Returns recent "big wins" — race bets where the user won AND either:
 *   - profit (payout - amount) >= $100, OR
 *   - locked_odds >= 8.0 (regardless of stake size)
 *
 * Enriched with horse data, race data, and user display info so the
 * admin page can render a shareable RaceWinCard inline.
 *
 * Query params:
 *   - limit (default 50, max 200)
 *   - filter: "all" | "amount" | "multiplier" (default all)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const filter = (searchParams.get("filter") || "all") as "all" | "amount" | "multiplier";
  const supabase = createAdminClient();

  // Pull won bets with the richest query in one pass.
  // We over-fetch slightly (~3x) and filter in-memory because Postgres doesn't
  // let us do an OR with a computed column (payout - amount) cleanly in one query.
  const overfetch = limit * 3;

  const { data: bets, error } = await supabase
    .from("race_bets")
    .select(
      `
      id,
      user_id,
      race_id,
      horse_id,
      amount,
      locked_odds,
      potential_payout,
      payout,
      status,
      settled_at,
      users:user_id ( id, username ),
      horses:horse_id ( id, name, slug, color, speed, stamina, form, consistency, ground_preference, career_races, career_wins, career_places, career_shows, last_5_results ),
      races:race_id ( id, race_number, distance, ground )
      `
    )
    .eq("status", "won")
    .order("settled_at", { ascending: false })
    .limit(overfetch);

  if (error) {
    console.error("[admin/big-wins] fetch error:", error);
    return NextResponse.json({ error: "failed to load big wins" }, { status: 500 });
  }

  interface BetRow {
    id: string;
    user_id: string;
    race_id: string;
    horse_id: number;
    amount: string | number;
    locked_odds: string | number;
    potential_payout: string | number;
    payout: string | number;
    status: string;
    settled_at: string;
    users: { id: string; username: string } | null;
    horses: {
      id: number;
      name: string;
      slug: string;
      color: string;
      speed: number;
      stamina: number;
      form: number;
      consistency: number;
      ground_preference: string;
      career_races: number;
      career_wins: number;
      career_places: number;
      career_shows: number;
      last_5_results: Array<{ raceNumber: number; position: number }>;
    } | null;
    races: { id: string; race_number: number; distance: number; ground: string } | null;
  }

  // Also fetch gate positions for each race+horse combo
  const raceHorseKeys = ((bets as unknown as BetRow[]) || [])
    .map((b) => ({ race_id: b.race_id, horse_id: b.horse_id }))
    .filter((k) => k.race_id && k.horse_id);
  const uniqueRaceIds = Array.from(new Set(raceHorseKeys.map((k) => k.race_id)));

  const gateMap = new Map<string, number>();
  if (uniqueRaceIds.length > 0) {
    const { data: entries } = await supabase
      .from("race_entries")
      .select("race_id, horse_id, gate_position")
      .in("race_id", uniqueRaceIds);
    for (const e of entries || []) {
      gateMap.set(`${e.race_id}:${e.horse_id}`, e.gate_position);
    }
  }

  const enriched = ((bets as unknown as BetRow[]) || [])
    .map((b) => {
      const amount = parseFloat(String(b.amount));
      const payout = parseFloat(String(b.payout || 0));
      const lockedOdds = parseFloat(String(b.locked_odds));
      const profit = payout - amount;

      const qualifiesAmount = profit >= 100;
      const qualifiesMultiplier = lockedOdds >= 8;

      const matchesFilter =
        filter === "amount"
          ? qualifiesAmount
          : filter === "multiplier"
          ? qualifiesMultiplier
          : qualifiesAmount || qualifiesMultiplier;

      if (!matchesFilter) return null;

      return {
        id: b.id,
        userId: b.user_id,
        username: b.users?.username || "anon",
        amount,
        lockedOdds,
        payout,
        profit,
        settledAt: b.settled_at,
        qualifiesAmount,
        qualifiesMultiplier,

        // Race
        raceId: b.race_id,
        raceNumber: b.races?.race_number || 0,
        distance: b.races?.distance || 0,
        ground: b.races?.ground || "good",
        gatePosition: gateMap.get(`${b.race_id}:${b.horse_id}`) || 1,

        // Horse (full object for RaceWinCard)
        horse: b.horses
          ? {
              id: b.horses.id,
              name: b.horses.name,
              slug: b.horses.slug,
              color: b.horses.color,
              speed: b.horses.speed,
              stamina: b.horses.stamina,
              form: b.horses.form,
              consistency: b.horses.consistency,
              groundPreference: b.horses.ground_preference,
              careerRaces: b.horses.career_races,
              careerWins: b.horses.career_wins,
              careerPlaces: b.horses.career_places,
              careerShows: b.horses.career_shows,
              last5Results: b.horses.last_5_results || [],
            }
          : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, limit);

  return NextResponse.json({ bigWins: enriched });
}
