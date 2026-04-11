import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/affiliates/list
 *
 * Returns two lists:
 *   1. applications — all affiliate_applications rows with status filter
 *   2. affiliates — users with referral activity (referrer of at least one other user)
 *      plus stats: total refs, activated refs, 30d NGR, lifetime commission,
 *      clicks count from affiliate_clicks
 *
 * Query params:
 *   - status: "pending" | "approved" | "rejected" | "terminated" | "all" (applications filter)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statusFilter = (searchParams.get("status") || "pending").toLowerCase();
  const supabase = createAdminClient();

  // ======== 1. Applications ========
  let appsQuery = supabase
    .from("affiliate_applications")
    .select(
      "id, handle, x_handle, email, audience_size, primary_channels, secondary_channels, content_link, notes, payout_wallet, payout_chain, status, review_notes, linked_user_id, created_at, reviewed_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter !== "all") {
    appsQuery = appsQuery.eq("status", statusFilter);
  }

  const { data: applications, error: appsError } = await appsQuery;
  if (appsError) {
    console.error("[admin/affiliates/list] applications error:", appsError);
    return NextResponse.json({ error: "Failed to load applications" }, { status: 500 });
  }

  // ======== 2. Active affiliates with stats ========
  // A user is an "affiliate" if at least one other user has referrer_id = this user.id
  const { data: affiliateUsers, error: affError } = await supabase
    .from("users")
    .select("id, username, referral_code, affiliate_tier, referral_earnings, referral_lifetime_earned, created_at")
    .eq("role", "player")
    .not("referral_code", "is", null)
    .order("referral_lifetime_earned", { ascending: false })
    .limit(100);

  if (affError) {
    console.error("[admin/affiliates/list] affiliate users error:", affError);
    return NextResponse.json({ error: "Failed to load affiliates" }, { status: 500 });
  }

  const affiliateIds = (affiliateUsers || []).map((u) => u.id);
  const affiliateCodes = (affiliateUsers || [])
    .map((u) => u.referral_code)
    .filter(Boolean) as string[];

  // Count refs per affiliate + activated refs
  const refStats: Record<string, { total: number; activated: number }> = {};
  if (affiliateIds.length > 0) {
    const { data: refs } = await supabase
      .from("users")
      .select("referrer_id, referral_activated")
      .in("referrer_id", affiliateIds);

    for (const r of refs || []) {
      if (!r.referrer_id) continue;
      if (!refStats[r.referrer_id]) refStats[r.referrer_id] = { total: 0, activated: 0 };
      refStats[r.referrer_id].total += 1;
      if (r.referral_activated) refStats[r.referrer_id].activated += 1;
    }
  }

  // Count clicks per affiliate code
  const clickStats: Record<string, number> = {};
  if (affiliateCodes.length > 0) {
    const { data: clicks } = await supabase
      .from("affiliate_clicks")
      .select("code")
      .in("code", affiliateCodes);

    for (const c of clicks || []) {
      clickStats[c.code] = (clickStats[c.code] || 0) + 1;
    }
  }

  // Calculate 30d NGR per affiliate (rolling window)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const ngrStats: Record<string, number> = {};

  if (affiliateIds.length > 0) {
    // Get all refs by each affiliate first
    const { data: allRefs } = await supabase
      .from("users")
      .select("id, referrer_id")
      .in("referrer_id", affiliateIds);

    const refToAff: Record<string, string> = {};
    const refUserIds: string[] = [];
    for (const r of allRefs || []) {
      if (r.referrer_id) {
        refToAff[r.id] = r.referrer_id;
        refUserIds.push(r.id);
      }
    }

    if (refUserIds.length > 0) {
      const { data: bets } = await supabase
        .from("race_bets")
        .select("user_id, amount, payout, status, settled_at")
        .in("user_id", refUserIds)
        .in("status", ["won", "lost"])
        .gte("settled_at", thirtyDaysAgo);

      for (const b of bets || []) {
        const affId = refToAff[b.user_id];
        if (!affId) continue;
        const ngrDelta = parseFloat(b.amount) - parseFloat(b.payout || 0);
        ngrStats[affId] = (ngrStats[affId] || 0) + ngrDelta;
      }
    }
  }

  const affiliates = (affiliateUsers || []).map((u) => ({
    id: u.id,
    username: u.username,
    referralCode: u.referral_code,
    tier: u.affiliate_tier || 1,
    totalRefs: refStats[u.id]?.total || 0,
    activatedRefs: refStats[u.id]?.activated || 0,
    clicks30d: clickStats[u.referral_code || ""] || 0,
    ngr30d: parseFloat((ngrStats[u.id] || 0).toFixed(2)),
    pendingEarnings: parseFloat(u.referral_earnings || 0),
    lifetimeEarnings: parseFloat(u.referral_lifetime_earned || 0),
    createdAt: u.created_at,
  }));

  return NextResponse.json({
    applications: (applications || []).map((a) => ({
      id: a.id,
      handle: a.handle,
      xHandle: a.x_handle,
      email: a.email,
      audienceSize: a.audience_size,
      primaryChannels: a.primary_channels || [],
      secondaryChannels: a.secondary_channels,
      contentLink: a.content_link,
      notes: a.notes,
      payoutWallet: a.payout_wallet,
      payoutChain: a.payout_chain,
      status: a.status,
      reviewNotes: a.review_notes,
      linkedUserId: a.linked_user_id,
      createdAt: a.created_at,
      reviewedAt: a.reviewed_at,
    })),
    affiliates,
  });
}
