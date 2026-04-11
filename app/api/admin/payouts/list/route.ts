import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/payouts/list
 *
 * Returns affiliate_periods rows with status "claimable" or "held"
 * joined with user info (username, wallet would need a separate
 * affiliate_applications join — for now we just return what's in users).
 *
 * Also returns a quick summary of unclaimed and pending totals.
 *
 * Query params:
 *   - status: 'all' | 'open' | 'held' | 'claimable' | 'paid'  (default 'claimable')
 *   - limit: default 100 max 500
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = searchParams.get("status") || "claimable";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const supabase = createAdminClient();

  let query = supabase
    .from("affiliate_periods")
    .select(
      "id, affiliate_id, period_start, period_end, ngr_generated, gross_commission, carryover_applied, net_commission, status, held_until, paid_at, created_at, users:affiliate_id ( username, referral_code, referral_lifetime_earned )"
    )
    .order("period_start", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/payouts/list] error:", error);
    return NextResponse.json({ error: "failed to load payouts" }, { status: 500 });
  }

  interface Row {
    id: string;
    affiliate_id: string;
    period_start: string;
    period_end: string;
    ngr_generated: string | number;
    gross_commission: string | number;
    carryover_applied: string | number;
    net_commission: string | number;
    status: string;
    held_until: string | null;
    paid_at: string | null;
    created_at: string;
    users: { username: string; referral_code: string; referral_lifetime_earned: string | number } | null;
  }

  const periods = ((data as unknown as Row[]) || []).map((p) => ({
    id: p.id,
    affiliateId: p.affiliate_id,
    username: p.users?.username || "unknown",
    referralCode: p.users?.referral_code || "",
    lifetimeEarned: parseFloat(String(p.users?.referral_lifetime_earned || 0)),
    periodStart: p.period_start,
    periodEnd: p.period_end,
    ngrGenerated: parseFloat(String(p.ngr_generated)),
    grossCommission: parseFloat(String(p.gross_commission)),
    carryoverApplied: parseFloat(String(p.carryover_applied)),
    netCommission: parseFloat(String(p.net_commission)),
    status: p.status,
    heldUntil: p.held_until,
    paidAt: p.paid_at,
    createdAt: p.created_at,
  }));

  // Also pull affiliate wallet info from affiliate_applications for paying
  const affiliateIds = Array.from(new Set(periods.map((p) => p.affiliateId)));
  const walletMap: Record<string, { wallet: string; chain: string }> = {};
  if (affiliateIds.length > 0) {
    const { data: apps } = await supabase
      .from("affiliate_applications")
      .select("linked_user_id, payout_wallet, payout_chain")
      .in("linked_user_id", affiliateIds)
      .eq("status", "approved");
    for (const a of apps || []) {
      if (a.linked_user_id) {
        walletMap[a.linked_user_id] = {
          wallet: a.payout_wallet,
          chain: a.payout_chain,
        };
      }
    }
  }

  const periodsWithWallet = periods.map((p) => ({
    ...p,
    payoutWallet: walletMap[p.affiliateId]?.wallet || null,
    payoutChain: walletMap[p.affiliateId]?.chain || null,
  }));

  const summary = periods.reduce(
    (acc, p) => {
      if (p.status === "claimable") acc.claimable += p.netCommission;
      if (p.status === "held") acc.held += p.netCommission;
      if (p.status === "paid") acc.paid += p.netCommission;
      return acc;
    },
    { claimable: 0, held: 0, paid: 0 }
  );

  return NextResponse.json({
    periods: periodsWithWallet,
    summary: {
      claimable: parseFloat(summary.claimable.toFixed(2)),
      held: parseFloat(summary.held.toFixed(2)),
      paid: parseFloat(summary.paid.toFixed(2)),
    },
  });
}
