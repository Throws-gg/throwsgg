import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 60;

/**
 * GET /api/horses
 *
 * Public, unauthed. Returns all 16 horses with computed metrics for the
 * form-guide index. Cached for 60s — race-induced changes to career stats
 * don't need real-time freshness on the list view.
 */
export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("horses")
    .select("*")
    .order("speed_rating", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch horses" },
      { status: 500 },
    );
  }

  type HorseRow = {
    id: number;
    name: string;
    slug: string;
    color: string;
    speed: number;
    stamina: number;
    form: number;
    consistency: number;
    ground_preference: string;
    career_races: number | null;
    career_wins: number | null;
    career_places: number | null;
    career_shows: number | null;
    last_5_results: number[] | null;
    speed_rating: number | null;
    avg_finish: string | number | null;
    days_since_last_race: number | null;
  };

  const horses = ((data ?? []) as unknown as HorseRow[]).map((h) => {
    const races = h.career_races ?? 0;
    const wins = h.career_wins ?? 0;
    const places = h.career_places ?? 0;
    const shows = h.career_shows ?? 0;
    return {
      id: h.id,
      name: h.name,
      slug: h.slug,
      color: h.color,
      speed: h.speed,
      stamina: h.stamina,
      form: h.form,
      consistency: h.consistency,
      groundPreference: h.ground_preference,
      careerRaces: races,
      careerWins: wins,
      careerPlaces: places,
      careerShows: shows,
      winPct: races > 0 ? Math.round((wins / races) * 1000) / 10 : 0,
      itmPct:
        races > 0
          ? Math.round(((wins + places + shows) / races) * 1000) / 10
          : 0,
      last5Results: Array.isArray(h.last_5_results) ? h.last_5_results : [],
      speedRating: h.speed_rating ?? 70,
      avgFinish: parseFloat(String(h.avg_finish ?? 4.5)),
      daysSinceLastRace: h.days_since_last_race ?? 0,
    };
  });

  return NextResponse.json({ horses });
}
