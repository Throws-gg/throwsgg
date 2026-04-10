import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

const TIER_NAMES = ["Rookie", "Trainer", "Owner"] as const;
const TIER_RATES = [0.35, 0.40, 0.45];
const TIER_THRESHOLDS = [0, 25_000, 100_000]; // NGR thresholds
const TIER_MAX = [25_000, 100_000, Infinity];

function tierName(tier: number) {
  return TIER_NAMES[Math.max(0, Math.min(2, tier - 1))];
}
function tierRate(tier: number) {
  return TIER_RATES[Math.max(0, Math.min(2, tier - 1))];
}

/**
 * GET /api/referrals/me
 *
 * Returns everything the referrals page needs to render:
 * - referralCode
 * - current affiliate tier + rate + progress to next tier
 * - stats (lifetime, claimable, pending-in-hold, total refs, active refs)
 * - list of referred users with their activation state
 * - recent weekly periods (for the affiliate dashboard)
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
    // Current user affiliate info
    const { data: me, error: meError } = await supabase
      .from("users")
      .select(
        "referral_code, referral_earnings, referral_lifetime_earned, affiliate_tier"
      )
      .eq("id", userId)
      .single();

    if (meError || !me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const tier = me.affiliate_tier || 1;
    const currentRate = tierRate(tier);
    const tierFloor = TIER_THRESHOLDS[tier - 1];
    const tierCeiling = TIER_MAX[tier - 1];
    const nextTierFloor = tier < 3 ? TIER_THRESHOLDS[tier] : null;

    // Rolling 30-day NGR from this user's referrals
    const { data: referrals } = await supabase
      .from("users")
      .select("id, username, created_at, total_wagered, referral_activated")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    const referredIds = (referrals || []).map((r) => r.id);

    // 30-day NGR: stake - payout over all settled bets by these users
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

    // Per-referred earnings — only count 'held', 'claimable', 'paid' (not pending/voided)
    const rewardsByReferred = new Map<string, number>();
    if (referredIds.length > 0) {
      const { data: rewards } = await supabase
        .from("referral_rewards")
        .select("referred_id, amount, status")
        .eq("referrer_id", userId)
        .in("referred_id", referredIds);

      for (const r of rewards || []) {
        if (!["held", "claimable", "paid"].includes(r.status)) continue;
        const existing = rewardsByReferred.get(r.referred_id) || 0;
        rewardsByReferred.set(r.referred_id, existing + parseFloat(String(r.amount)));
      }
    }

    const referralsList = (referrals || []).map((r) => {
      const wagered = parseFloat(String(r.total_wagered));
      let status: "pending" | "active" | "activated";
      if (r.referral_activated) status = "activated";
      else if (wagered > 0) status = "active";
      else status = "pending";

      return {
        id: r.id,
        username: r.username,
        joinedAt: r.created_at,
        totalWagered: wagered,
        earnings: rewardsByReferred.get(r.id) || 0,
        status,
      };
    });

    // Recent weekly periods
    const { data: periods } = await supabase
      .from("affiliate_periods")
      .select("*")
      .eq("affiliate_id", userId)
      .order("period_end", { ascending: false })
      .limit(12);

    const periodsList = (periods || []).map((p) => ({
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

    // Pending earnings currently locked in 'held' periods
    const heldInPeriods = periodsList
      .filter((p) => p.status === "held")
      .reduce((sum, p) => sum + p.netCommission, 0);

    // Pending rewards not yet rolled up (still 'pending' or 'held' at the reward level)
    const { data: pendingRewards } = await supabase
      .from("referral_rewards")
      .select("amount, status")
      .eq("referrer_id", userId)
      .in("status", ["pending", "held"])
      .is("period_id", null);
    const unrolledPending = (pendingRewards || []).reduce(
      (sum, r) => sum + parseFloat(String(r.amount)),
      0
    );

    const totalReferrals = referralsList.length;
    const activatedReferrals = referralsList.filter((r) => r.status === "activated").length;
    const claimable = parseFloat(String(me.referral_earnings)) || 0;
    const lifetime = parseFloat(String(me.referral_lifetime_earned)) || 0;

    return NextResponse.json({
      referralCode: me.referral_code,
      affiliate: {
        tier,
        tierName: tierName(tier),
        rate: currentRate,
        rolling30dNgr,
        tierFloor,
        tierCeiling: isFinite(tierCeiling) ? tierCeiling : null,
        nextTier: tier < 3 ? tier + 1 : null,
        nextTierName: tier < 3 ? tierName(tier + 1) : null,
        nextTierFloor,
      },
      stats: {
        totalReferrals,
        activatedReferrals,
        claimable,               // ready to claim to balance
        heldInPeriods,           // locked in 7-day hold
        unrolledPending,         // not yet in a period
        lifetime,
      },
      referrals: referralsList,
      periods: periodsList,
    });
  } catch (error) {
    console.error("Referrals fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
