import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics/posthog-server";
import { getRakebackTier } from "@/lib/rakeback/tiers";

/**
 * POST /api/rakeback/claim
 *
 * Atomically drains the user's rakeback_claimable → balance via the
 * claim_rakeback() RPC. No minimum. Returns the amount claimed, the new
 * balance, and the user's current tier.
 *
 * Returns:
 *   200 { claimed: true, amount, newBalance, tier, lifetime }
 *   200 { claimed: false, reason: "nothing_to_claim", amount: 0 }
 *   401 unauthed
 *   500 rpc failure
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
      reason: "nothing_to_claim",
      amount: 0,
    });
  }

  // Fresh snapshot so the client can update the store without another refetch.
  const { data: user } = await supabase
    .from("users")
    .select("balance, total_wagered, rakeback_lifetime")
    .eq("id", authed.dbUserId)
    .single();

  const totalWagered = Number(user?.total_wagered ?? 0);
  const tier = getRakebackTier(totalWagered);

  trackServer(authed.dbUserId, "rakeback_claimed", {
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
