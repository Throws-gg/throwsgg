import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";
import { logAdminAction } from "@/lib/auth/admin-actions";

/**
 * POST /api/admin/users/action
 *
 * Destructive user mutations. All audit-logged.
 *
 * Body: {
 *   userId: string,
 *   action: "ban" | "unban" | "mute" | "unmute" | "adjust_balance",
 *   amount?: number,        // required for adjust_balance (can be negative)
 *   reason?: string,
 * }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  const action = typeof body.action === "string" ? body.action : "";
  const amount = typeof body.amount === "number" ? body.amount : 0;
  const reason = typeof body.reason === "string" ? body.reason : null;

  // Dev mode userId fallback is also coming in via body.userId — distinguish them
  // by looking for a separate targetUserId field. Client passes it explicitly.
  const resolvedTargetId = typeof body.targetUserId === "string" ? body.targetUserId : targetUserId;

  if (!resolvedTargetId || !action) {
    return NextResponse.json({ error: "targetUserId and action required" }, { status: 400 });
  }

  const validActions = ["ban", "unban", "mute", "unmute", "adjust_balance"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Snapshot before
  const { data: before, error: fetchError } = await supabase
    .from("users")
    .select("id, username, balance, is_banned, is_muted, role")
    .eq("id", resolvedTargetId)
    .single();

  if (fetchError || !before) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  if (before.role === "admin" && (action === "ban" || action === "adjust_balance")) {
    return NextResponse.json({ error: "cannot modify an admin" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let afterValue: Record<string, unknown> = {};

  switch (action) {
    case "ban":
      updates.is_banned = true;
      afterValue = { is_banned: true };
      break;
    case "unban":
      updates.is_banned = false;
      afterValue = { is_banned: false };
      break;
    case "mute":
      updates.is_muted = true;
      afterValue = { is_muted: true };
      break;
    case "unmute":
      updates.is_muted = false;
      afterValue = { is_muted: false };
      break;
    case "adjust_balance": {
      if (!Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ error: "amount required and must be non-zero" }, { status: 400 });
      }
      const currentBalance = parseFloat(String(before.balance));
      const newBalance = currentBalance + amount;
      if (newBalance < 0) {
        return NextResponse.json({ error: "adjustment would result in negative balance" }, { status: 400 });
      }
      updates.balance = newBalance;
      afterValue = { balance: newBalance, delta: amount };

      // Also log a transaction row so the user's tx history reflects it
      await supabase.from("transactions").insert({
        user_id: resolvedTargetId,
        type: "bonus",
        amount,
        balance_after: newBalance,
        currency: "USD",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        metadata: { source: "admin_adjust", admin_id: admin.dbUserId, reason },
      });
      break;
    }
  }

  const { error: updateError } = await supabase
    .from("users")
    .update(updates)
    .eq("id", resolvedTargetId);

  if (updateError) {
    console.error("[admin/users/action] update error:", updateError);
    return NextResponse.json({ error: "failed to apply action" }, { status: 500 });
  }

  await logAdminAction({
    admin,
    actionType: action,
    targetType: "user",
    targetId: resolvedTargetId,
    beforeValue: {
      balance: parseFloat(String(before.balance)),
      is_banned: before.is_banned,
      is_muted: before.is_muted,
      username: before.username,
    },
    afterValue,
    reason,
  });

  return NextResponse.json({ success: true });
}
