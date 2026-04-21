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
 * Read-only. Returns the user's current rakeback state:
 *   {
 *     tier, tierLabel, tierPct, effectivePct,
 *     claimable, lifetime,
 *     totalWagered,
 *     nextTier: { tier, label, tierPct, effectivePct, wageredToReach } | null,
 *     lastClaimAt,
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
    .select(
      "total_wagered, rakeback_claimable, rakeback_lifetime, last_rakeback_claim_at"
    )
    .eq("id", authed.dbUserId)
    .single();

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const totalWagered = Number(user.total_wagered ?? 0);
  const tier = getRakebackTier(totalWagered);
  const next = getNextRakebackTier(totalWagered);

  return NextResponse.json({
    tier: tier.tier,
    tierLabel: tier.label,
    tierPct: tier.tierPct,
    effectivePct: tier.effectivePct,
    claimable: Number(user.rakeback_claimable ?? 0),
    lifetime: Number(user.rakeback_lifetime ?? 0),
    totalWagered,
    edgeRate: EDGE_RATE,
    lastClaimAt: user.last_rakeback_claim_at,
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
