import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";
import { logAdminAction } from "@/lib/auth/admin-actions";
import { tick } from "@/lib/racing/engine";

/**
 * GET /api/admin/control
 *   Returns current system_flags.
 *
 * POST /api/admin/control
 *   Body: {
 *     action: "pause_races" | "resume_races" | "force_tick",
 *     reason?: string
 *   }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: flags } = await supabase.from("system_flags").select("key, value, updated_at");

  const flagMap: Record<string, { value: unknown; updatedAt: string }> = {};
  for (const f of flags || []) {
    flagMap[f.key] = { value: f.value, updatedAt: f.updated_at };
  }

  // Also get current race status for quick reference
  const { data: currentRace } = await supabase
    .from("races")
    .select("id, race_number, status, betting_closes_at, settled_at")
    .in("status", ["betting", "closed", "racing"])
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ flags: flagMap, currentRace });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason : null;

  const supabase = createAdminClient();

  if (action === "pause_races" || action === "resume_races") {
    const newValue = action === "pause_races";
    const { error } = await supabase
      .from("system_flags")
      .update({
        value: newValue as unknown as object,
        updated_at: new Date().toISOString(),
        updated_by: admin.dbUserId,
      })
      .eq("key", "races_paused");

    if (error) {
      console.error("[admin/control] flag update error:", error);
      return NextResponse.json({ error: "failed to update flag" }, { status: 500 });
    }

    await logAdminAction({
      admin,
      actionType: action,
      targetType: "system",
      targetId: "races_paused",
      beforeValue: { races_paused: !newValue },
      afterValue: { races_paused: newValue },
      reason,
    });

    return NextResponse.json({ success: true, races_paused: newValue });
  }

  if (action === "force_tick") {
    try {
      const result = await tick();
      await logAdminAction({
        admin,
        actionType: "force_tick",
        targetType: "system",
        targetId: "engine",
        afterValue: result as unknown as object,
        reason,
      });
      return NextResponse.json({ success: true, result });
    } catch (err) {
      console.error("[admin/control] force_tick error:", err);
      return NextResponse.json({ error: "tick failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
