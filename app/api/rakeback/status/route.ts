import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRakebackTier,
  getNextRakebackTier,
  EDGE_RATE,
} from "@/lib/rakeback/tiers";

/**
 * GET /api/rakeback/status
 *
 * Read-only. Returns the user's current rakeback state.
 *
 * After migration 033, rakeback is auto-credited per settled bet — there is
 * no claimable balance to drain. We surface "earned this week" + lifetime
 * + tier instead.
 *
 *   {
 *     tier, tierLabel, tierPct, effectivePct,
 *     weekEarned,            // sum(amount) from rakeback_accruals over last 7 days
 *     lifetime,
 *     totalWagered,
 *     nextTier,              // unchanged
 *     edgeRate,
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
    .select("total_wagered, rakeback_lifetime")
    .eq("id", authed.dbUserId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Sum the last 7 days of accruals for the "this week" headline number.
  // rakeback_accruals.accrued_at is the source of truth. claimed_at is
  // stamped at the same instant for instant accruals.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: weekRows } = await supabase
    .from("rakeback_accruals")
    .select("amount")
    .eq("user_id", authed.dbUserId)
    .gte("accrued_at", weekAgo);

  const weekEarned = (weekRows ?? []).reduce(
    (sum, r) => sum + Number(r.amount ?? 0),
    0
  );

  const totalWagered = Number(user.total_wagered ?? 0);
  const tier = getRakebackTier(totalWagered);
  const next = getNextRakebackTier(totalWagered);

  return NextResponse.json({
    tier: tier.tier,
    tierLabel: tier.label,
    tierPct: tier.tierPct,
    effectivePct: tier.effectivePct,
    weekEarned,
    lifetime: Number(user.rakeback_lifetime ?? 0),
    totalWagered,
    edgeRate: EDGE_RATE,
    nextTier: next
      ? {
          tier: next.tier,
          label: next.label,
          tierPct: next.tierPct,
          effectivePct: next.effectivePct,
          wageredToReach: Math.max(0, next.minWagered - totalWagered),
          threshold: next.minWagered,
        }
      : null,
  });
}
