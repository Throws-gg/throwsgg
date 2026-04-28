import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/race/wins-feed
 *
 * PUBLIC, anonymous-readable. Returns recent winning bets for the social-proof
 * ticker on the landing page + racing page. No PII — username is the only
 * user field, and users self-set those.
 *
 * Filter: status='won' AND (profit >= $5 OR locked_odds >= 5.0). The combined
 * threshold avoids the ticker being dominated by penny-stake show bets while
 * still surfacing interesting longshot wins from small wagers.
 *
 * Query params:
 *   - limit (default 20, max 50)
 *
 * Response shape per row:
 *   { id, username, horseName, lockedOdds, payout, profit, raceNumber, settledAt }
 *
 * Response is cached at the edge for 10s — high cache-hit rate on a 3-min race
 * cycle, low DB load even with everyone-on-the-landing-page traffic.
 */
export const dynamic = "force-dynamic";

const MIN_PROFIT = 5;
const MIN_ODDS = 5.0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "20", 10), 1),
    50
  );

  const supabase = createAdminClient();

  // Over-fetch and filter — Postgres can't do an OR with a computed column
  // (payout - amount) cleanly. 3x is plenty of headroom at our volume.
  const { data: bets, error } = await supabase
    .from("race_bets")
    .select(
      `
      id,
      amount,
      locked_odds,
      payout,
      settled_at,
      users:user_id ( username ),
      horses:horse_id ( name, slug ),
      races:race_id ( race_number )
      `
    )
    .eq("status", "won")
    .order("settled_at", { ascending: false })
    .limit(limit * 3);

  if (error) {
    return NextResponse.json(
      { wins: [], error: "fetch_failed" },
      { status: 200 }
    );
  }

  interface Row {
    id: string;
    amount: string | number;
    locked_odds: string | number;
    payout: string | number | null;
    settled_at: string;
    users: { username: string | null } | null;
    horses: { name: string; slug: string } | null;
    races: { race_number: number } | null;
  }

  const wins = ((bets as unknown as Row[]) || [])
    .map((b) => {
      const amount = Number(b.amount);
      const payout = Number(b.payout ?? 0);
      const lockedOdds = Number(b.locked_odds);
      const profit = payout - amount;
      if (profit < MIN_PROFIT && lockedOdds < MIN_ODDS) return null;
      return {
        id: b.id,
        username: b.users?.username || "anon",
        horseName: b.horses?.name || "—",
        horseSlug: b.horses?.slug || "",
        lockedOdds,
        payout,
        profit,
        raceNumber: b.races?.race_number ?? 0,
        settledAt: b.settled_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(0, limit);

  return NextResponse.json(
    { wins },
    {
      headers: {
        // 10s cache at the edge — race cycle is 3 min so this is plenty fresh.
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
      },
    }
  );
}
