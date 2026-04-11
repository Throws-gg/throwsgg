import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/chat/list
 *
 * Recent chat messages, newest first. Includes deleted ones so admins
 * can see the full history. Query params:
 *   - show_deleted: 'true' | 'false' (default true)
 *   - system: 'true' | 'false' — include system messages (default false)
 *   - limit: default 100 max 300
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const showDeleted = searchParams.get("show_deleted") !== "false";
  const includeSystem = searchParams.get("system") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 300);

  const supabase = createAdminClient();

  let query = supabase
    .from("chat_messages")
    .select("id, user_id, username, message, is_system, is_deleted, created_at, users:user_id ( is_banned, is_muted )")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!showDeleted) query = query.eq("is_deleted", false);
  if (!includeSystem) query = query.eq("is_system", false);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/chat/list] error:", error);
    return NextResponse.json({ error: "failed to load messages" }, { status: 500 });
  }

  interface Row {
    id: string;
    user_id: string | null;
    username: string;
    message: string;
    is_system: boolean;
    is_deleted: boolean;
    created_at: string;
    users: { is_banned: boolean; is_muted: boolean } | null;
  }

  const messages = ((data as unknown as Row[]) || []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    username: m.username,
    message: m.message,
    isSystem: m.is_system,
    isDeleted: m.is_deleted,
    isBanned: m.users?.is_banned || false,
    isMuted: m.users?.is_muted || false,
    createdAt: m.created_at,
  }));

  return NextResponse.json({ messages });
}
