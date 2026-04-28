import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import StreakAtRisk from "@/lib/email/templates/StreakAtRisk";

/**
 * Streak-at-risk cron.
 *
 * Schedule: daily at 20:00 UTC (vercel.json) — gives users ~4h of UTC day
 * left to act. Targets users who have a meaningful (>= 3 day) streak that
 * was alive yesterday but has not been kept today.
 *
 * Idempotent within a UTC day via email_log + last_streak_nudge_at cooldown.
 *
 * Returns { sent, skipped, candidates } for observability.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_STREAK = 3;
const BATCH_LIMIT = 500;
const NUDGE_COOLDOWN_HOURS = 20;

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterdayUtc.toISOString().slice(0, 10);
  const cooldownCutoff = new Date(
    Date.now() - NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Hours-of-UTC-day-remaining drives copy and is shown to the user.
  const hoursLeft = Math.max(1, 24 - now.getUTCHours());

  // Candidate set: streak >= 3, last day was yesterday, not banned, has
  // email and not unsubscribed, not nudged in cooldown window.
  const { data: candidates, error } = await supabase
    .from("users")
    .select(
      "id, username, email, current_streak, email_unsubscribed_at, last_streak_nudge_at"
    )
    .gte("current_streak", MIN_STREAK)
    .eq("last_streak_day", yesterdayIso)
    .eq("is_banned", false)
    .not("email", "is", null)
    .is("email_unsubscribed_at", null)
    .or(
      `last_streak_nudge_at.is.null,last_streak_nudge_at.lt.${cooldownCutoff}`
    )
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "Query failed", detail: error.message },
      { status: 500 }
    );
  }

  let sent = 0;
  let skipped = 0;
  const nowIso = now.toISOString();

  for (const u of candidates ?? []) {
    if (!u.email) {
      skipped++;
      continue;
    }

    const idempotencyKey = `streak-at-risk:${u.id}:${yesterdayIso}`;

    const result = await sendEmail({
      to: u.email,
      subject: `Your ${u.current_streak}-day streak is at risk`,
      category: "retention",
      userId: u.id,
      idempotencyKey,
      react: StreakAtRisk({
        username: u.username ?? "degen",
        streakDays: Number(u.current_streak ?? 0),
        hoursLeft,
      }),
    });

    if (result.sent) {
      sent++;
      await supabase
        .from("users")
        .update({ last_streak_nudge_at: nowIso })
        .eq("id", u.id);
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    candidates: candidates?.length ?? 0,
  });
}
