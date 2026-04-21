import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyFingerprint } from "@/lib/fingerprint/server";
import { trackServer } from "@/lib/analytics/posthog-server";

/**
 * POST /api/bonus/daily/claim
 *
 * Claims the user's daily login bonus. Atomic via claim_daily_bonus() RPC.
 *
 * Body:
 *   { fingerprint?: string }  // FingerprintJS visitorId — verified server-side
 *
 * Returns:
 *   200 { granted: true, amount, tier, nextClaimAt, wageringAdded, newBonusBalance, newWageringRemaining }
 *   200 { granted: false, reason: "already_claimed"|"deposit_required"|"duplicate_fingerprint"|"duplicate_ip"|"banned", ... }
 *   401 on unauthed
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let body: { fingerprint?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const authed = await verifyRequest(request, body as Record<string, unknown>);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    null;

  // Verify fingerprint via Fingerprint Server API. If unverified, null it out
  // before passing to the RPC — can't have an attacker paste random visitor IDs
  // to dodge dedup. Matches the auth/sync pattern.
  let trustedFingerprint: string | null = null;
  let fpReason: string | undefined;
  if (body.fingerprint) {
    const verification = await verifyFingerprint(body.fingerprint, clientIp);
    if (verification.verified && !verification.botDetected) {
      trustedFingerprint = verification.visitorId;
    } else {
      fpReason = verification.reason;
    }
  }

  const { data, error } = await supabase.rpc("claim_daily_bonus", {
    p_user_id: authed.dbUserId,
    p_fingerprint: trustedFingerprint,
    p_ip: clientIp,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: "Claim failed", detail: error?.message },
      { status: 500 }
    );
  }

  if (!data.granted) {
    return NextResponse.json({
      granted: false,
      reason: data.reason,
      nextClaimAt: data.next_claim_at,
      depositRequired: data.required_deposit,
      currentDeposits: data.current_deposits,
    });
  }

  // Pull fresh user snapshot so the client can update its store without a refetch.
  const { data: user } = await supabase
    .from("users")
    .select("balance, bonus_balance, wagering_remaining, bonus_expires_at")
    .eq("id", authed.dbUserId)
    .single();

  trackServer(authed.dbUserId, "daily_bonus_claimed", {
    tier: data.tier,
    amount: Number(data.amount),
    wagering_added: Number(data.wagering_added),
    fingerprint_verified: trustedFingerprint !== null,
    fingerprint_reason: fpReason,
  });

  return NextResponse.json({
    granted: true,
    amount: Number(data.amount),
    tier: data.tier,
    wageringAdded: Number(data.wagering_added),
    nextClaimAt: data.next_claim_at,
    user: user
      ? {
          balance: Number(user.balance),
          bonusBalance: Number(user.bonus_balance),
          wageringRemaining: Number(user.wagering_remaining),
          bonusExpiresAt: user.bonus_expires_at,
        }
      : null,
  });
}
