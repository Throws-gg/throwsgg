import { NextRequest } from "next/server";

/**
 * Verify a cron request is authentic.
 *
 * In production: requires `Authorization: Bearer <CRON_SECRET>`.
 * In dev: if CRON_SECRET is unset, allows unauthenticated calls for local testing.
 *
 * Uses constant-time comparison to avoid timing leaks.
 */
export function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRON_SECRET is not set in production");
    }
    return true;
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  if (header.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < header.length; i++) {
    diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
