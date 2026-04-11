import { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "./admin-password";

export interface AuthedAdmin {
  username: string;
  dbUserId: string;
  privyId: string;
  role: "admin";
}

/**
 * Verify an admin request.
 *
 * Admin auth is now password-based — the middleware already blocks
 * unauthenticated requests at /admin/* and /api/admin/*. This helper
 * provides defense-in-depth: it re-verifies the session cookie and
 * returns a stub "admin" user object for audit logging.
 *
 * The `_body` parameter is kept for backwards compatibility with routes
 * that pass it through from the old role-based check, but no longer does
 * anything.
 */
export async function verifyAdmin(
  request: NextRequest,
  _body?: Record<string, unknown>
): Promise<AuthedAdmin | null> {
  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(cookie))) return null;

  return {
    username: "admin",
    dbUserId: "00000000-0000-0000-0000-000000000000",
    privyId: "admin",
    role: "admin",
  };
}
