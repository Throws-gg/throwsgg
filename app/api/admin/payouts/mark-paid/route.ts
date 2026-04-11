import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";
import { logAdminAction } from "@/lib/auth/admin-actions";

/**
 * POST /api/admin/payouts/mark-paid
 *
 * Marks an affiliate_period as paid with the given tx_hash.
 *
 * Body: {
 *   periodId: string,
 *   txHash: string,
 *   reason?: string
 * }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const periodId = typeof body.periodId === "string" ? body.periodId : "";
  const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason : null;

  if (!periodId || !txHash) {
    return NextResponse.json({ error: "periodId and txHash required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: before } = await supabase
    .from("affiliate_periods")
    .select("id, affiliate_id, net_commission, status")
    .eq("id", periodId)
    .single();

  if (!before) return NextResponse.json({ error: "period not found" }, { status: 404 });
  if (before.status !== "claimable") {
    return NextResponse.json({ error: "period is not claimable" }, { status: 400 });
  }

  const { error } = await supabase
    .from("affiliate_periods")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", periodId);

  if (error) {
    console.error("[admin/payouts/mark-paid] update error:", error);
    return NextResponse.json({ error: "failed to mark paid" }, { status: 500 });
  }

  // Also deduct the amount from the affiliate's claimable referral_earnings
  // since they're being paid outside the normal claim flow
  const amount = parseFloat(String(before.net_commission));
  if (amount > 0) {
    await supabase.rpc("credit_referral_reward", {
      p_referrer_id: before.affiliate_id,
      p_referred_id: before.affiliate_id, // self-ref to satisfy FK; doesn't matter
      p_race_bet_id: null,
      p_stake_amount: 0,
      p_commission_amount: -amount,
    }).then(() => {}, () => {
      // Fallback: direct update of earnings
      return supabase
        .from("users")
        .update({ referral_earnings: 0 })
        .eq("id", before.affiliate_id);
    });
  }

  await logAdminAction({
    admin,
    actionType: "payout_marked_paid",
    targetType: "affiliate_period",
    targetId: periodId,
    beforeValue: { status: "claimable", net_commission: amount },
    afterValue: { status: "paid", tx_hash: txHash, paid_at: new Date().toISOString() },
    reason,
  });

  return NextResponse.json({ success: true });
}
