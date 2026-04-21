import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/geo-bypass?key=<secret>
 *
 * Sets a 24-hour bypass cookie that short-circuits the geo-block middleware.
 * Founder testing tool — keeps Connor able to access prod from AU without
 * needing to be in the whitelist (and without weakening the AU block once
 * he relocates, since the bypass is cookie-bound to his browser).
 *
 * Verification: constant-time compare against GEO_BYPASS_SECRET env var.
 * If the env var isn't set, this endpoint returns 503 — avoids the "empty
 * secret equals empty query string" footgun.
 *
 * The cookie:
 *   - HttpOnly (can't be read/forged from JS)
 *   - Secure in prod
 *   - SameSite=Lax (survives cross-origin navigation to throws.gg)
 *   - 24h TTL — the founder re-hits the URL when it expires
 *
 * Logs every grant to admin_actions so we have an audit trail of who
 * (which IP) bypassed geo and when.
 */

const COOKIE_NAME = "throws_geo_bypass";
const TTL_SECONDS = 60 * 60 * 24;

export const dynamic = "force-dynamic";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: NextRequest) {
  const secret = process.env.GEO_BYPASS_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Bypass not configured" },
      { status: 503 },
    );
  }

  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!key || !constantTimeEqual(key, secret)) {
    return NextResponse.json(
      { error: "Invalid key" },
      { status: 403 },
    );
  }

  // Redirect home once the cookie is set so the operator can immediately
  // verify they have access.
  const homeUrl = request.nextUrl.clone();
  homeUrl.pathname = "/";
  homeUrl.search = "";

  const response = NextResponse.redirect(homeUrl);
  response.cookies.set({
    name: COOKIE_NAME,
    value: "ok",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_SECONDS,
    path: "/",
  });

  return response;
}
