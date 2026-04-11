import { NextRequest, NextResponse } from "next/server";
import {
  verifyPassword,
  computeSessionToken,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_MAX_AGE,
} from "@/lib/auth/admin-password";

// Simple in-memory rate limiter — prevents password brute force.
// Keyed by IP, window: 10 attempts per 15 minutes.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60_000;

function checkRateLimit(ip: string): { ok: boolean; retryIn?: number } {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return { ok: false, retryIn: Math.ceil((record.resetAt - now) / 1000) };
  }

  record.count += 1;
  return { ok: true };
}

/**
 * POST /api/admin/login
 *
 * Body: { password: string }
 *
 * On success, sets the admin session cookie and returns 200.
 * On failure, returns 401. Rate limited to 10 attempts per 15 min per IP.
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `too many attempts. retry in ${rl.retryIn}s` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  // Success — reset the rate limit for this IP
  attempts.delete(ip);

  const token = await computeSessionToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
