import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import WeeklyLeaderboardResult from "@/lib/email/templates/WeeklyLeaderboardResult";

/**
 * Weekly tipster leaderboard recap email.
 *
 * Schedule: Monday 00:30 UTC (vercel.json) — runs after the affiliate
 * weekly rollup (00:05) so the prior ISO week is fully settled.
 *
 * Calls tipster_leaderboard(window='week', limit=50) to get the prior 7d
 * ranking, emails each ranked user a personalised recap. Top 10 get the
 * "nice finish" copy; ranks 11-50 get a "you qualified, didn't place" line.
 *
 * Users who didn't qualify (< 10 bets / < $50 staked) get NO email — saves
 * inbox fatigue and avoids "you came last" vibes.
 *
 * Prize pool is OFF at launch: prizeAmount=0 → template renders the no-prize
 * variant. Switch on once we have volume.
 *
 * Idempotency: keyed by ISO week — multiple firings within the same week
 * hit the email_log dedup and no-op.
 *
 * Returns { sent, skipped, qualified } for observability.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PRIZE_AMOUNT_AT_LAUNCH = 0;
const LIMIT = 50;
const MIN_BETS = 10;
const MIN_CASH = 50;

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Pull last week's leaderboard. Reusing the same SQL function as
  // /api/leaderboard so the rankings can never drift between page + email.
  const { data: rows, error: lbError } = await supabase.rpc(
    "tipster_leaderboard",
    {
      p_window: "week",
      p_limit: LIMIT,
      p_min_bets: MIN_BETS,
      p_min_cash: MIN_CASH,
    }
  );

  if (lbError) {
    return NextResponse.json(
      { error: "Leaderboard query failed", detail: lbError.message },
      { status: 500 }
    );
  }

  interface LbRow {
    user_id: string;
    username: string;
  }

  const ranked = (rows ?? []) as LbRow[];
  const totalEntrants = ranked.length;
  const weekEndingIso = new Date().toISOString();
  const weekKey = getIsoWeek(new Date());

  let sent = 0;
  let skipped = 0;

  // Pull email + prefs for everyone in one shot.
  const userIds = ranked.map((r) => r.user_id);
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, email_unsubscribed_at, is_banned")
      .in("id", userIds);

    for (const u of users ?? []) {
      if (!u.email) continue;
      if (u.email_unsubscribed_at) continue;
      if (u.is_banned) continue;
      emailMap.set(u.id, u.email);
    }
  }

  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i];
    const rank = i + 1;
    const email = emailMap.get(r.user_id);
    if (!email) {
      skipped++;
      continue;
    }

    const idempotencyKey = `weekly-leaderboard:${r.user_id}:${weekKey}`;

    const result = await sendEmail({
      to: email,
      subject:
        rank <= 10
          ? `You finished #${rank} on the weekly leaderboard`
          : `Your weekly leaderboard result`,
      category: "retention",
      userId: r.user_id,
      idempotencyKey,
      react: WeeklyLeaderboardResult({
        username: r.username,
        rank,
        totalEntrants,
        prizeAmount: PRIZE_AMOUNT_AT_LAUNCH,
        weekEndingIso,
      }),
    });

    if (result.sent) {
      sent++;
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    qualified: totalEntrants,
    weekKey,
  });
}

function getIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
