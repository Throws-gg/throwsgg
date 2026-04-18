import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

const COOLDOWN_DAYS = 7;
const RESERVED = new Set([
  "admin", "api", "system", "support", "mod", "moderator", "throws", "owner",
  "anon", "anonymous", "null", "undefined", "root", "staff",
]);

/**
 * POST /api/user/username
 * Body: { username: string, userId?: string (dev mode) }
 * Rate-limited to one change per 7 days.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const user = await verifyRequest(request, body);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = typeof body.username === "string" ? body.username.trim() : "";
  const username = raw.toLowerCase();

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 chars, lowercase letters, numbers, or underscores" },
      { status: 400 }
    );
  }

  if (RESERVED.has(username)) {
    return NextResponse.json({ error: `"${username}" is reserved` }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Load current record (for cooldown + no-op check)
  const { data: current } = await supabase
    .from("users")
    .select("username, username_changed_at")
    .eq("id", user.dbUserId)
    .single();

  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (current.username === username) {
    return NextResponse.json({ error: "That's already your username" }, { status: 400 });
  }

  if (current.username_changed_at) {
    const last = new Date(current.username_changed_at).getTime();
    const nextAllowed = last + COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() < nextAllowed) {
      const daysLeft = Math.ceil((nextAllowed - Date.now()) / (24 * 60 * 60 * 1000));
      return NextResponse.json(
        { error: `You can change your username again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` },
        { status: 429 }
      );
    }
  }

  // Uniqueness check (case-insensitive — usernames are stored lowercase)
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing && existing.id !== user.dbUserId) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({
      username,
      username_changed_at: new Date().toISOString(),
    })
    .eq("id", user.dbUserId);

  if (updateErr) {
    // Race condition on unique constraint
    if (updateErr.code === "23505") {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    console.error("username update failed:", updateErr);
    return NextResponse.json({ error: "Failed to update username" }, { status: 500 });
  }

  return NextResponse.json({ success: true, username });
}
