import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics/posthog-server";
import { getRakebackTier } from "@/lib/rakeback/tiers";

/**
 * POST /api/rakeback/claim — LEGACY (post-033 rakeback is auto-credited).
 *
 * After migration 033, rakeback is credited to balance the moment a bet
 * settles. This endpoint is kept ONLY as a back-compat drain for any user
 * who somehow ended up with rakeback_claimable > 0 (e.g. a row that escaped
 * the backfill, or a stale client retrying an old in-flight claim).
 *
 * Modern clients no longer call this route. Returns 200 with claimed:false
 * if there's nothing pending — safe and silent.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const authed = await verifyRequest(request, body);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: claimedAmount, error } = await supabase.rpc("claim_rakeback", {
    p_user_id: authed.dbUserId,
  });

  if (error) {
    return NextResponse.json(
      { error: "Claim failed", detail: error.message },
      { status: 500 }
    );
  }

  const amount = Number(claimedAmount ?? 0);

  if (amount <= 0) {
    return NextResponse.json({
      claimed: false,
      reason: "instant_rakeback_active",
      amount: 0,
    });
  }

  // Legacy drain executed — fetch fresh balance for client.
  const { data: user } = await supabase
    .from("users")
    .select("balance, total_wagered, rakeback_lifetime")
    .eq("id", authed.dbUserId)
    .single();

  const totalWagered = Number(user?.total_wagered ?? 0);
  const tier = getRakebackTier(totalWagered);

  trackServer(authed.dbUserId, "rakeback_legacy_drain", {
    amount,
    tier: tier.tier,
    lifetime_total: Number(user?.rakeback_lifetime ?? 0),
  });

  return NextResponse.json({
    claimed: true,
    amount,
    newBalance: Number(user?.balance ?? 0),
    tier: tier.tier,
    tierLabel: tier.label,
    lifetime: Number(user?.rakeback_lifetime ?? 0),
  });
}
