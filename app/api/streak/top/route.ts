import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/streak/top
 *
 * PUBLIC. Returns the top current daily-bet streaks for chat-handle badges.
 * Only includes users with a streak that's still alive (last_streak_day is
 * today or yesterday UTC) and current_streak >= 3 — short streaks aren't
 * worth a badge.
 *
 * Query params:
 *   - limit: 1-50 (default 25)
 *
 * Response:
 *   { streaks: Array<{ username, current }> }
 *
 * Cached at the edge for 60s — streak counts only change on bet settle.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "25", 10), 1),
    50
  );

  const supabase = createAdminClient();

  // Compute today / yesterday in UTC at the API boundary so the query stays
  // a simple .in() lookup.
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const todayIso = todayUtc.toISOString().slice(0, 10);
  const yesterdayIso = yesterdayUtc.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("users")
    .select("username, current_streak")
    .gte("current_streak", 3)
    .in("last_streak_day", [todayIso, yesterdayIso])
    .eq("is_banned", false)
    .not("username", "is", null)
    .order("current_streak", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { streaks: [], error: "fetch_failed" },
      { status: 200 }
    );
  }

  const streaks = (data ?? []).map((u) => ({
    username: u.username as string,
    current: Number(u.current_streak ?? 0),
  }));

  return NextResponse.json(
    { streaks },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
