import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface DistanceRecord {
  starts: number;
  wins: number;
  places?: number;
}

interface GroundRecord {
  starts: number;
  wins: number;
}

interface GateRecord {
  starts: number;
  wins: number;
}

/**
 * GET /api/horses/[slug]
 *
 * Public, unauthed. Returns one horse + last 12 race entries (joined with
 * races for distance/ground/date) so the detail page can render a form
 * history table without a second roundtrip.
 *
 * Race entries are filtered to settled races only — pending/in-flight races
 * have no finish_position yet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: horse, error: horseError } = await supabase
    .from("horses")
    .select("*")
    .eq("slug", slug)
    .single();

  if (horseError || !horse) {
    return NextResponse.json({ error: "Horse not found" }, { status: 404 });
  }

  // Pull last 12 settled race entries with the joined race info.
  const { data: entries, error: entriesError } = await supabase
    .from("race_entries")
    .select(
      "race_id, gate_position, finish_position, opening_odds, current_odds, snapshot_form, " +
        "races!inner(race_number, distance, ground, settled_at, status)",
    )
    .eq("horse_id", horse.id)
    .eq("races.status", "settled")
    .order("races(settled_at)", { ascending: false, nullsFirst: false })
    .limit(12);

  if (entriesError) {
    return NextResponse.json(
      { error: "Failed to load race history" },
      { status: 500 },
    );
  }

  type EntryRow = {
    race_id: string;
    gate_position: number;
    finish_position: number | null;
    opening_odds: number | string | null;
    current_odds: number | string | null;
    snapshot_form: unknown;
    races: {
      race_number: number;
      distance: number;
      ground: string;
      settled_at: string | null;
      status: string;
    };
  };

  const recentRaces = ((entries ?? []) as unknown as EntryRow[]).map((e) => ({
    raceId: e.race_id,
    raceNumber: e.races.race_number,
    distance: e.races.distance,
    ground: e.races.ground,
    settledAt: e.races.settled_at,
    gate: e.gate_position,
    finish: e.finish_position,
    openingOdds:
      e.opening_odds !== null ? parseFloat(String(e.opening_odds)) : null,
    closingOdds:
      e.current_odds !== null ? parseFloat(String(e.current_odds)) : null,
  }));

  const races = horse.career_races ?? 0;
  const wins = horse.career_wins ?? 0;
  const places = horse.career_places ?? 0;
  const shows = horse.career_shows ?? 0;

  return NextResponse.json({
    horse: {
      id: horse.id,
      name: horse.name,
      slug: horse.slug,
      color: horse.color,
      speed: horse.speed,
      stamina: horse.stamina,
      form: horse.form,
      consistency: horse.consistency,
      groundPreference: horse.ground_preference,
      careerRaces: races,
      careerWins: wins,
      careerPlaces: places,
      careerShows: shows,
      winPct: races > 0 ? Math.round((wins / races) * 1000) / 10 : 0,
      itmPct:
        races > 0
          ? Math.round(((wins + places + shows) / races) * 1000) / 10
          : 0,
      last5Results: Array.isArray(horse.last_5_results)
        ? horse.last_5_results
        : [],
      speedRating: horse.speed_rating ?? 70,
      avgFinish: parseFloat(String(horse.avg_finish ?? 4.5)),
      daysSinceLastRace: horse.days_since_last_race ?? 0,
      distanceRecord: (horse.distance_record ?? {}) as Record<
        string,
        DistanceRecord
      >,
      groundRecord: (horse.ground_record ?? {}) as Record<string, GroundRecord>,
      gateRecord: (horse.gate_record ?? {}) as Record<string, GateRecord>,
    },
    recentRaces,
  });
}
