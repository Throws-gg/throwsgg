import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/stats/public
 *
 * PUBLIC, anonymous-readable. Returns the trust-counter numbers used on the
 * landing page: lifetime wagered, races settled, biggest payout in the last 30d.
 * Cached 60s at the edge — these numbers don't change second-to-second, and
 * the landing page can survive minute-level staleness easily.
 */
export const dynamic = "force-dynamic";

interface CacheShape {
  totalWagered: number;
  racesSettled: number;
  biggestPayout30d: number;
}

let cache: { data: CacheShape; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  }

  const supabase = createAdminClient();

  const [wageredRes, racesRes, biggestRes] = await Promise.all([
    supabase.from("race_bets").select("amount").eq("status", "won").limit(1).maybeSingle().then(async () => {
      // Use a SUM via rpc-style fallback: aggregate via a single-shot count + sum query.
      // PostgREST sum aggregate requires a function; do it client-side over a capped page.
      const { data } = await supabase
        .from("race_bets")
        .select("amount")
        .in("status", ["won", "lost"]);
      return (data || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
    }),
    supabase
      .from("races")
      .select("id", { count: "exact", head: true })
      .eq("status", "settled"),
    supabase
      .from("race_bets")
      .select("payout")
      .eq("status", "won")
      .gte("settled_at", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("payout", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const data: CacheShape = {
    totalWagered: Math.round(wageredRes ?? 0),
    racesSettled: racesRes.count ?? 0,
    biggestPayout30d: Math.round(Number(biggestRes.data?.payout ?? 0)),
  };

  cache = { data, timestamp: now };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
