import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/admin-password";
import { decideGeoBlock } from "@/lib/geo/blocklist";

/**
 * Edge middleware — two responsibilities:
 *
 *   1. Geo-block jurisdictions where we can't lawfully operate. Reads
 *      Vercel's x-vercel-ip-country / x-vercel-ip-country-region headers,
 *      cross-checks against `lib/geo/blocklist.ts`. Fails closed on missing
 *      geo (treat as hostile). Returns HTTP 451 "Unavailable For Legal
 *      Reasons" via a rewrite to `/blocked` — keeps the URL so auditors can
 *      see the intent clearly.
 *
 *   2. Admin auth — every /admin/* page + /api/admin/* route requires the
 *      admin session cookie.
 *
 * Order matters: geo-block runs first so even a valid admin session can't
 * reach the app from a restricted country. Only exception is the bypass
 * cookie (see BYPASS_COOKIE_NAME) for founder testing.
 *
 * Runs on the Edge Runtime. No Node APIs. Logging happens fire-and-forget
 * via a POST to /api/internal/log-geo-block so we don't block the response.
 */

const BYPASS_COOKIE_NAME = "throws_geo_bypass";
const ADMIN_AUTH_EXEMPT = new Set([
  "/admin/login",
  "/api/admin/login",
  "/api/admin/logout",
]);

// Paths that bypass the geo check entirely (statics, crons, health probes,
// and the /blocked page + bypass endpoint themselves — otherwise a blocked
// user couldn't see the blocked page).
const GEO_EXEMPT_PREFIXES = [
  "/_next/",
  "/assets/",
  "/api/cron/",
  "/api/internal/",
  "/api/webhooks/", // Resend webhooks come from Resend IPs, no user geo
  "/api/unsubscribe", // email one-click — must work from any region
  "/api/geo-bypass",
  "/blocked",
  "/favicon",
];

function isGeoExempt(pathname: string): boolean {
  if (pathname === "/favicon.ico" || pathname === "/icon.png") return true;
  for (const prefix of GEO_EXEMPT_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Fire-and-forget compliance log. Uses an INTERNAL_GEO_LOG_SECRET so only
 * middleware can reach the endpoint. Never awaits — we never block the
 * response on a failed log write.
 */
function logBlockedAttempt(
  request: NextRequest,
  reason: string,
  country: string | null | undefined,
  region: string | null | undefined,
): void {
  const secret = process.env.INTERNAL_GEO_LOG_SECRET;
  if (!secret) return; // dev mode — skip logging

  const url = new URL("/api/internal/log-geo-block", request.nextUrl.origin);
  const body = JSON.stringify({
    reason,
    country: country ?? null,
    region: region ?? null,
    path: request.nextUrl.pathname,
    user_agent: request.headers.get("user-agent") ?? null,
    referrer: request.headers.get("referer") ?? null,
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      null,
  });

  // Edge runtime supports fetch. waitUntil would be better but isn't
  // available in the middleware signature — fire and drop the promise.
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body,
    // Don't hold the response open on us.
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Compliance logging is best-effort. A failed insert must never
    // block the 451 response.
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Geo-block gate ────────────────────────────────────────────────────
  //
  // Development: skip entirely so local dev doesn't need a bypass cookie.
  // Production: check every non-exempt path. Bypass cookie (set via
  // /api/geo-bypass?key=SECRET) short-circuits for founder testing.
  //
  const isDev = process.env.NODE_ENV !== "production";
  const hasBypass =
    request.cookies.get(BYPASS_COOKIE_NAME)?.value === "ok";

  if (!isDev && !hasBypass && !isGeoExempt(pathname)) {
    const country = request.headers.get("x-vercel-ip-country");
    const region = request.headers.get("x-vercel-ip-country-region");
    const decision = decideGeoBlock(country, region);

    if (decision.blocked) {
      logBlockedAttempt(
        request,
        decision.reason ?? "unknown",
        decision.country,
        decision.region,
      );

      // For API routes, respond JSON 451 so the client gets a clean error
      // (rather than HTML from the /blocked page).
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "Unavailable for legal reasons",
            reason: decision.reason,
            country: decision.country,
          },
          { status: 451 },
        );
      }

      // HTML: rewrite to /blocked (preserves URL, no client-visible redirect).
      const url = request.nextUrl.clone();
      url.pathname = "/blocked";
      url.searchParams.set("r", decision.reason ?? "restricted");
      if (decision.country) url.searchParams.set("c", decision.country);
      if (decision.region) url.searchParams.set("rg", decision.region);
      return NextResponse.rewrite(url, { status: 451 });
    }
  }

  // ─── Admin auth gate ───────────────────────────────────────────────────
  //
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (ADMIN_AUTH_EXEMPT.has(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (await verifySessionToken(cookie)) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json(
      { error: "admin auth required" },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

/**
 * Match everything except Next internals and static files. The geo-exempt
 * list above is a secondary filter inside the handler.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
