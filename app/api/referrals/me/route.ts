import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

const TIER_NAMES = ["Rookie", "Trainer", "Owner"] as const;
const TIER_RATES = [0.35, 0.40, 0.45];
const TIER_THRESHOLDS = [0, 25_000, 100_000];
const TIER_MAX = [25_000, 100_000, Infinity];

const REFERRAL_RATE = 0.10; // 10% of NGR for regular referrals
const REFERRAL_WINDOW_DAYS = 90;

function tierName(tier: number) {
  return TIER_NAMES[Math.max(0, Math.min(2, tier - 1))];
}
function tierRate(tier: number) {
  return TIER_RATES[Math.max(0, Math.min(2, tier - 1))];
}

/**
 * GET /api/referrals/me
 *
 * Returns referral/affiliate data depending on the user's status:
 *
 * REGULAR REFERRER (is_affiliate = false):
 *   - referralCode, rate (10%), window (90 days)
 *   - stats (claimable, lifetime, total/active referrals)
 *   - referrals list with per-user earnings
 *   - No tier system, no periods, no hold
 *
 * APPROVED AFFILIATE (is_affiliate = true):
 *   - All of the above, PLUS:
 *   - Tier info (tier level, rate, NGR progress, thresholds)
 *   - Weekly periods with hold/claimable status
 *   - Held + unrolled pending earnings breakdown
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const authed = await verifyRequest(request, devUserId ? { userId: devUserId } : undefined);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authed.dbUserId;

  try {
    const { data: me, error: meError } = await supabase
      .from("users")
      .select(
        "referral_code, referral_earnings, referral_lifetime_earned, affiliate_tier, is_affiliate"
      )
      .eq("id", userId)
      .single();

    if (meError || !me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAffiliate = me.is_affiliate === true;

    // Get referred users
    const { data: referrals } = await supabase
      .from("users")
      .select("id, username, created_at, total_wagered, referral_activated")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    const referredIds = (referrals || []).map((r) => r.id);

    // Per-referred earnings from referral_rewards
    const rewardsByReferred = new Map<string, number>();
    if (referredIds.length > 0) {
      const { data: rewards } = await supabase
        .from("referral_rewards")
        .select("referred_id, amount, status")
        .eq("referrer_id", userId)
        .in("referred_id", referredIds);

      for (const r of rewards || []) {
        // For affiliates: only count held/claimable/paid
        // For regular referrals: count 'paid' (immediately credited)
        const validStatuses = isAffiliate
          ? ["held", "claimable", "paid"]
          : ["paid"];
        if (!validStatuses.includes(r.status)) continue;
        const existing = rewardsByReferred.get(r.referred_id) || 0;
        rewardsByReferred.set(r.referred_id, existing + parseFloat(String(r.amount)));
      }
    }

    const referralsList = (referrals || []).map((r) => {
      const wagered = parseFloat(String(r.total_wagered));

      // For regular referrals: show if within the 90-day window
      const createdAt = new Date(r.created_at).getTime();
      const windowExpires = createdAt + REFERRAL_WINDOW_DAYS * 24 * 3600 * 1000;
      const windowActive = Date.now() < windowExpires;
      const daysRemaining = Math.max(0, Math.ceil((windowExpires - Date.now()) / (24 * 3600 * 1000)));

      let status: "pending" | "active" | "activated" | "expired";
      if (isAffiliate) {
        // Affiliate: activation gate determines status
        if (r.referral_activated) status = "activated";
        else if (wagered > 0) status = "active";
        else status = "pending";
      } else {
        // Regular referral: 90-day window
        if (!windowActive) status = "expired";
        else if (wagered > 0) status = "active";
        else status = "pending";
      }

      return {
        id: r.id,
        username: r.username,
        joinedAt: r.created_at,
        totalWagered: wagered,
        earnings: rewardsByReferred.get(r.id) || 0,
        status,
        ...(isAffiliate ? {} : { daysRemaining, windowActive }),
      };
    });

    const totalReferrals = referralsList.length;
    const activatedReferrals = referralsList.filter(
      (r) => r.status === "activated" || r.status === "active"
    ).length;
    const claimable = parseFloat(String(me.referral_earnings)) || 0;
    const lifetime = parseFloat(String(me.referral_lifetime_earned)) || 0;

    // ===== AFFILIATE-ONLY DATA =====
    let affiliateData = null;
    let periodsList: unknown[] = [];
    let heldInPeriods = 0;
    let unrolledPending = 0;

    if (isAffiliate) {
      const tier = me.affiliate_tier || 1;
      const currentRate = tierRate(tier);
      const tierFloor = TIER_THRESHOLDS[tier - 1];
      const tierCeiling = TIER_MAX[tier - 1];

      // Rolling 30-day NGR
      let rolling30dNgr = 0;
      if (referredIds.length > 0) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: bets } = await supabase
          .from("race_bets")
          .select("amount, payout")
          .in("user_id", referredIds)
          .in("status", ["won", "lost"])
          .gte("settled_at", thirtyDaysAgo);

        rolling30dNgr = (bets || []).reduce((sum, b) => {
          const stake = parseFloat(String(b.amount));
          const payout = parseFloat(String(b.payout || 0));
          return sum + (stake - payout);
        }, 0);
      }

      affiliateData = {
        tier,
        tierName: tierName(tier),
        rate: currentRate,
        rolling30dNgr,
        tierFloor,
        tierCeiling: isFinite(tierCeiling) ? tierCeiling : null,
        nextTier: tier < 3 ? tier + 1 : null,
        nextTierName: tier < 3 ? tierName(tier + 1) : null,
        nextTierFloor: tier < 3 ? TIER_THRESHOLDS[tier] : null,
      };

      // Weekly periods
      const { data: periods } = await supabase
        .from("affiliate_periods")
        .select("*")
        .eq("affiliate_id", userId)
        .order("period_end", { ascending: false })
        .limit(12);

      periodsList = (periods || []).map((p) => ({
        id: p.id,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        ngrGenerated: parseFloat(String(p.ngr_generated)),
        grossCommission: parseFloat(String(p.gross_commission)),
        netCommission: parseFloat(String(p.net_commission)),
        status: p.status,
        heldUntil: p.held_until,
        paidAt: p.paid_at,
      }));

      heldInPeriods = (periodsList as { status: string; netCommission: number }[])
        .filter((p) => p.status === "held")
        .reduce((sum, p) => sum + p.netCommission, 0);

      // Unrolled pending rewards
      const { data: pendingRewards } = await supabase
        .from("referral_rewards")
        .select("amount")
        .eq("referrer_id", userId)
        .in("status", ["pending", "held"])
        .is("period_id", null);
      unrolledPending = (pendingRewards || []).reduce(
        (sum, r) => sum + parseFloat(String(r.amount)),
        0
      );
    }

    return NextResponse.json({
      referralCode: me.referral_code,
      isAffiliate,

      // Regular referral info (shown to everyone)
      referralRate: isAffiliate ? null : REFERRAL_RATE,
      referralWindow: isAffiliate ? null : REFERRAL_WINDOW_DAYS,

      // Affiliate-only (null for regular referrers)
      affiliate: affiliateData,

      stats: {
        totalReferrals,
        activatedReferrals,
        claimable,
        lifetime,
        ...(isAffiliate ? { heldInPeriods, unrolledPending } : {}),
      },
      referrals: referralsList,
      ...(isAffiliate ? { periods: periodsList } : {}),
    });
  } catch (error) {
    console.error("Referrals fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
