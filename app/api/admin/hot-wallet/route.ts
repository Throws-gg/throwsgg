import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";
import { logAdminAction } from "@/lib/auth/admin-actions";

/**
 * POST /api/admin/hot-wallet
 *
 * Manually update the hot wallet balance system flag.
 * Used by the admin after topping up or draining the hot wallet on-chain.
 *
 * Body: { balance: number, reason?: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const balance = typeof body.balance === "number" ? body.balance : NaN;
  const reason = typeof body.reason === "string" ? body.reason : null;

  if (!Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({ error: "balance must be a non-negative number" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get old value for audit
  const { data: before } = await supabase
    .from("system_flags")
    .select("value")
    .eq("key", "hot_wallet_balance")
    .maybeSingle();

  const { error } = await supabase
    .from("system_flags")
    .update({
      value: balance as unknown as object,
      updated_at: new Date().toISOString(),
      updated_by: admin.dbUserId,
    })
    .eq("key", "hot_wallet_balance");

  if (error) {
    console.error("[admin/hot-wallet] update error:", error);
    return NextResponse.json({ error: "failed to update" }, { status: 500 });
  }

  await logAdminAction({
    admin,
    actionType: "hot_wallet_update",
    targetType: "system",
    targetId: "hot_wallet_balance",
    beforeValue: { balance: parseFloat(String(before?.value ?? 0)) },
    afterValue: { balance },
    reason,
  });

  return NextResponse.json({ success: true, balance });
}
