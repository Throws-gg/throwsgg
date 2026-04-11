import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/check
 *
 * Called from the admin layout on mount. If the caller is an admin,
 * returns { ok: true }. Otherwise 403 — layout redirects to /.
 *
 * Dev mode: pass ?userId=<uuid> as a fallback.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    username: admin.username,
  });
}
