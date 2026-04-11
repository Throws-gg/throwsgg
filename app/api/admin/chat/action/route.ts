import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";
import { logAdminAction } from "@/lib/auth/admin-actions";

/**
 * POST /api/admin/chat/action
 *
 * Body: {
 *   messageId: string,
 *   action: "delete" | "undelete",
 *   reason?: string
 * }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason : null;

  if (!messageId || !["delete", "undelete"].includes(action)) {
    return NextResponse.json({ error: "messageId and valid action required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: before } = await supabase
    .from("chat_messages")
    .select("id, user_id, username, message, is_deleted")
    .eq("id", messageId)
    .single();

  if (!before) return NextResponse.json({ error: "message not found" }, { status: 404 });

  const newState = action === "delete";
  const { error } = await supabase
    .from("chat_messages")
    .update({ is_deleted: newState })
    .eq("id", messageId);

  if (error) {
    console.error("[admin/chat/action] update error:", error);
    return NextResponse.json({ error: "failed to update message" }, { status: 500 });
  }

  await logAdminAction({
    admin,
    actionType: action === "delete" ? "delete_chat" : "undelete_chat",
    targetType: "chat_message",
    targetId: messageId,
    beforeValue: {
      is_deleted: before.is_deleted,
      message: before.message,
      username: before.username,
    },
    afterValue: { is_deleted: newState },
    reason,
  });

  return NextResponse.json({ success: true });
}
