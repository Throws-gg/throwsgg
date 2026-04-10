import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * GET /api/referrals/me
 *
 * Returns the authenticated user's referral data:
 * - Their referral code
 * - Stats: total referrals, lifetime earned, pending earnings
 * - List of referred users
 *
 * Accepts either:
 * - Privy auth header (production)
 * - ?userId query param (dev mode)
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  // Support both auth header (Privy) and userId query param (dev)
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  // Build a fake body for verifyRequest so it can check dev mode
  const authed = await verifyRequest(request, devUserId ? { userId: devUserId } : undefined);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authed.dbUserId;

  try {
    // Get the current user's referral data
    const { data: me, error: meError } = await supabase
      .from("users")
      .select("referral_code, referral_earnings, referral_lifetime_earned")
      .eq("id", userId)
      .single();

    if (meError || !me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get all users this user has referred
    const { data: referred } = await supabase
      .from("users")
      .select("id, username, created_at, total_wagered")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get per-referral earnings totals
    const referredIds = (referred || []).map((r) => r.id);
    const { data: rewardsPerReferred } = await supabase
      .from("referral_rewards")
      .select("referred_id, amount")
      .eq("referrer_id", userId)
      .in("referred_id", referredIds.length > 0 ? referredIds : [""]);

    // Aggregate earnings per referred user
    const earningsMap = new Map<string, number>();
    for (const r of rewardsPerReferred || []) {
      const existing = earningsMap.get(r.referred_id) || 0;
      earningsMap.set(r.referred_id, existing + parseFloat(String(r.amount)));
    }

    const referrals = (referred || []).map((r) => {
      const wagered = parseFloat(String(r.total_wagered));
      return {
        id: r.id,
        username: r.username,
        joinedAt: r.created_at,
        totalWagered: wagered,
        earnings: earningsMap.get(r.id) || 0,
        status: wagered > 0 ? "active" : "pending",
      };
    });

    const totalReferrals = referrals.length;
    const activeReferrals = referrals.filter((r) => r.status === "active").length;
    const pendingEarnings = parseFloat(String(me.referral_earnings)) || 0;
    const lifetimeEarned = parseFloat(String(me.referral_lifetime_earned)) || 0;

    return NextResponse.json({
      referralCode: me.referral_code,
      stats: {
        totalReferrals,
        activeReferrals,
        pendingEarnings,
        lifetimeEarned,
      },
      referrals,
    });
  } catch (error) {
    console.error("Referrals fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
