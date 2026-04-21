import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import RakebackReady from "@/lib/email/templates/RakebackReady";
import { getRakebackTier } from "@/lib/rakeback/tiers";

/**
 * Weekly rakeback nudge cron.
 *
 * Schedule: Sunday 16:00 UTC (vercel.json). Finds users sitting on unclaimed
 * rakeback who haven't been nudged in the past 7 days, and sends one email
 * via the `retention` category (respects user preferences + global opt-out).
 *
 * Safe to run more often — the `last_rakeback_nudge_at` check is idempotent
 * against a 7-day window. If the schedule fires twice in a week only the
 * first one sends.
 *
 * No body input. Returns { nudged, skipped, candidates } for observability.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NUDGE_COOLDOWN_DAYS = 7;
const BATCH_LIMIT = 500;

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(
    Date.now() - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Pull candidates. We accept either last_rakeback_nudge_at IS NULL or
  // older than cutoff. Same for last_rakeback_claim_at — a user who claimed
  // yesterday doesn't need a "you have rakeback" nudge even if they earned
  // more after the claim.
  const { data: candidates, error } = await supabase
    .from("users")
    .select(
      "id, username, email, email_unsubscribed_at, rakeback_claimable, total_wagered, last_rakeback_nudge_at, last_rakeback_claim_at, is_banned"
    )
    .gt("rakeback_claimable", 0)
    .not("email", "is", null)
    .is("email_unsubscribed_at", null)
    .eq("is_banned", false)
    .or(`last_rakeback_nudge_at.is.null,last_rakeback_nudge_at.lt.${cutoff}`)
    .or(`last_rakeback_claim_at.is.null,last_rakeback_claim_at.lt.${cutoff}`)
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "Query failed", detail: error.message },
      { status: 500 }
    );
  }

  let nudged = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const u of candidates ?? []) {
    const amount = Number(u.rakeback_claimable ?? 0);
    if (amount <= 0 || !u.email) {
      skipped++;
      continue;
    }

    const tier = getRakebackTier(Number(u.total_wagered ?? 0));

    // Idempotency key bucketed per ISO-week so a rerun in the same week
    // hits the email_log dedup and no-ops. ISO week number changes weekly.
    const weekKey = getIsoWeek(new Date());
    const idempotencyKey = `rakeback-nudge:${u.id}:${weekKey}`;

    const result = await sendEmail({
      to: u.email,
      subject: `$${amount.toFixed(2)} rakeback ready to claim`,
      category: "retention",
      userId: u.id,
      idempotencyKey,
      react: RakebackReady({
        username: u.username ?? "degen",
        rakebackAmount: amount,
        tierName: tier.label,
        tierPct: Math.round(tier.tierPct * 100),
      }),
    });

    if (result.sent) {
      nudged++;
      // Stamp nudge cooldown regardless of whether Resend 200'd, because
      // the email_log row is what's authoritative for dedup. But stamping
      // also lets the next query skip this user without hitting email_log.
      await supabase
        .from("users")
        .update({ last_rakeback_nudge_at: now })
        .eq("id", u.id);
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    nudged,
    skipped,
    candidates: candidates?.length ?? 0,
  });
}

/**
 * ISO week key in the format `2026-W17`. Used as the idempotency bucket so
 * multiple cron firings within the same week don't double-nudge.
 */
function getIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
