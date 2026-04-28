import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/cron/verify";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import RakebackReady from "@/lib/email/templates/RakebackReady";
import { getRakebackTier } from "@/lib/rakeback/tiers";

/**
 * Weekly rakeback recap cron.
 *
 * Schedule: Sunday 16:00 UTC (vercel.json). After migration 033, rakeback
 * is auto-credited per bet — there's nothing to "claim". This cron now
 * sends a recap email summarising the past week's earned rakeback and
 * highlighting tier progress, so users feel the cumulative reward.
 *
 * Idempotent within an ISO-week via email_log dedup. last_rakeback_nudge_at
 * is still stamped to make the candidate query cheap.
 *
 * Returns { recapped, skipped, candidates } for observability.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COOLDOWN_DAYS = 6;          // 6 not 7 so a Sunday-noon firing stamps before next Sunday
const BATCH_LIMIT = 500;
const MIN_RECAP_AMOUNT = 0.05;    // skip nudges for trivial accruals

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(
    Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Candidate set: users with email + opted-in + not banned + not nudged in 6d.
  // We don't pre-filter on rakeback_lifetime > 0 because we need the LAST WEEK
  // earned amount, not lifetime — that comes from rakeback_accruals. We do
  // gate on total_wagered > 0 to skip dormant accounts.
  const { data: candidates, error } = await supabase
    .from("users")
    .select(
      "id, username, email, email_unsubscribed_at, total_wagered, last_rakeback_nudge_at, is_banned"
    )
    .not("email", "is", null)
    .is("email_unsubscribed_at", null)
    .eq("is_banned", false)
    .gt("total_wagered", 0)
    .or(`last_rakeback_nudge_at.is.null,last_rakeback_nudge_at.lt.${cutoff}`)
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "Query failed", detail: error.message },
      { status: 500 }
    );
  }

  let recapped = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const u of candidates ?? []) {
    if (!u.email) {
      skipped++;
      continue;
    }

    // Sum last-7d accruals for this user.
    const { data: accruals } = await supabase
      .from("rakeback_accruals")
      .select("amount")
      .eq("user_id", u.id)
      .gte("accrued_at", weekAgo);

    const weekEarned = (accruals ?? []).reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0
    );

    if (weekEarned < MIN_RECAP_AMOUNT) {
      skipped++;
      continue;
    }

    const tier = getRakebackTier(Number(u.total_wagered ?? 0));

    const weekKey = getIsoWeek(new Date());
    const idempotencyKey = `rakeback-recap:${u.id}:${weekKey}`;

    const result = await sendEmail({
      to: u.email,
      subject: `You earned $${weekEarned.toFixed(2)} in rakeback this week`,
      category: "retention",
      userId: u.id,
      idempotencyKey,
      react: RakebackReady({
        username: u.username ?? "degen",
        rakebackAmount: weekEarned,
        tierName: tier.label,
        tierPct: Math.round(tier.tierPct * 100),
      }),
    });

    if (result.sent) {
      recapped++;
      await supabase
        .from("users")
        .update({ last_rakeback_nudge_at: now })
        .eq("id", u.id);
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    recapped,
    skipped,
    candidates: candidates?.length ?? 0,
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
