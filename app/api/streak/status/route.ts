import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/streak/status
 *
 * Returns the requesting user's daily bet streak state:
 *   {
 *     current,        // current streak in days
 *     longest,        // best ever
 *     lastDay,        // ISO date string of most recent streak day, or null
 *     atRisk,         // true if last day = yesterday and we're past the
 *                     // "act today" threshold (UTC). Drives the "streak
 *                     // at risk" UI nudge on the racing page.
 *     bettedToday,    // true if last day = today UTC
 *   }
 */
export async function GET(request: NextRequest) {
  const authed = await verifyRequest(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("current_streak, longest_streak, last_streak_day")
    .eq("id", authed.dbUserId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const todayIso = todayUtc.toISOString().slice(0, 10);
  const yesterdayIso = yesterdayUtc.toISOString().slice(0, 10);

  const lastDay = user.last_streak_day as string | null;
  const bettedToday = lastDay === todayIso;
  const onYesterday = lastDay === yesterdayIso;

  // "At risk" = streak is meaningful (>=3), last day was yesterday, and
  // there are <8 hours of UTC day left. Mirrors the cron's 20:00 UTC trigger.
  const hourUtc = now.getUTCHours();
  const atRisk =
    onYesterday && (user.current_streak ?? 0) >= 1 && hourUtc >= 16;

  return NextResponse.json({
    current: Number(user.current_streak ?? 0),
    longest: Number(user.longest_streak ?? 0),
    lastDay,
    bettedToday,
    atRisk,
  });
}
