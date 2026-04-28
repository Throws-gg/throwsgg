import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/leaderboard
 *
 * PUBLIC, anonymous-readable. Returns the tipster leaderboard for a given
 * time window. Powered by the tipster_leaderboard() SQL function (mig 034).
 *
 * Query params:
 *   - window: "day" | "week" | "month" | "all" (default "week")
 *   - limit:  1-50 (default 10)
 *
 * Response:
 *   {
 *     window,
 *     entries: Array<{
 *       userId, username, betCount, cashStaked, cashReturned,
 *       netProfit, roi, biggestPayout
 *     }>
 *   }
 *
 * Cached at the edge for 30s — the underlying ranking changes only on
 * settlement events (every 3 min), so 30s is fresh enough.
 */
export const dynamic = "force-dynamic";

const VALID_WINDOWS = new Set(["day", "week", "month", "all"]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const windowParam = (searchParams.get("window") || "week").toLowerCase();
  const window = VALID_WINDOWS.has(windowParam) ? windowParam : "week";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("tipster_leaderboard", {
    p_window: window,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json(
      { window, entries: [], error: "fetch_failed" },
      { status: 200 }
    );
  }

  interface Row {
    user_id: string;
    username: string;
    bet_count: number;
    cash_staked: string | number;
    cash_returned: string | number;
    net_profit: string | number;
    roi: string | number;
    biggest_payout: string | number;
  }

  const entries = ((data as Row[]) || []).map((r) => ({
    userId: r.user_id,
    username: r.username,
    betCount: Number(r.bet_count),
    cashStaked: Number(r.cash_staked),
    cashReturned: Number(r.cash_returned),
    netProfit: Number(r.net_profit),
    roi: Number(r.roi),
    biggestPayout: Number(r.biggest_payout),
  }));

  return NextResponse.json(
    { window, entries },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    }
  );
}
