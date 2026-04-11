import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/admin-password";

/**
 * Admin middleware.
 *
 * Guards every /admin/* page and /api/admin/* route with a valid session
 * cookie. Routes that are exempt:
 *   - /admin/login                (the login page itself)
 *   - /api/admin/login            (the login endpoint)
 *   - /api/admin/logout           (cookie clear)
 *
 * Invalid or missing cookies:
 *   - HTML routes → redirect to /admin/login
 *   - API routes  → JSON 401
 */

const EXEMPT_PATHS = new Set([
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard admin paths
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  // Exempt paths (login, logout) are always allowed
  if (EXEMPT_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Check the session cookie
  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (await verifySessionToken(cookie)) {
    return NextResponse.next();
  }

  // Not authenticated
  if (isAdminApi) {
    return NextResponse.json(
      { error: "admin auth required" },
      { status: 401 }
    );
  }

  // Redirect HTML requests to login
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
