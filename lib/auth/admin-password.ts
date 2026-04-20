/**
 * Simple password-based admin auth.
 *
 * Uses an HMAC-signed cookie so the password itself never leaves the server.
 * Cookie value = HMAC-SHA256(ADMIN_PASSWORD) keyed by ADMIN_SESSION_SALT.
 *
 * Required env vars:
 *   ADMIN_PASSWORD       — the password admins enter at /admin/login
 *   ADMIN_SESSION_SALT   — random string, invalidates all sessions if changed
 *
 * In production both vars are required — enforced by lib/env.ts boot check.
 * In dev, long/obvious placeholders are used so it's clear if they leak into prod logs.
 *
 * Implementation note: this module uses the Web Crypto API (globalThis.crypto.subtle)
 * so it can run in both the Node.js runtime (API routes) AND the Edge Runtime
 * (middleware.ts). Node's built-in `crypto` module would break middleware builds.
 */

export const ADMIN_COOKIE_NAME = "throws_admin_session";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

function getPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw) return pw;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_PASSWORD is not set in production");
  }
  return "dev-only-admin-password-do-not-use-in-prod";
}

function getSalt(): string {
  const salt = process.env.ADMIN_SESSION_SALT;
  if (salt) return salt;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SALT is not set in production");
  }
  return "dev-only-admin-session-salt-do-not-use-in-prod-32chars";
}

/**
 * Convert a byte array to a hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Convert a hex string to a Uint8Array. Returns null on malformed input.
 */
function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/**
 * Constant-time byte comparison.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Compute the session token that gets stored in the cookie.
 *
 * token = HMAC-SHA256(key = ADMIN_SESSION_SALT, message = ADMIN_PASSWORD)
 *
 * Deterministic — same password + salt always produces the same token.
 * Rotating either env var invalidates all existing sessions.
 */
export async function computeSessionToken(): Promise<string> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(getSalt()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(getPassword())
  );
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Verify that the given cookie value matches the expected session token.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifySessionToken(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await computeSessionToken();
  const a = hexToBytes(cookieValue);
  const b = hexToBytes(expected);
  if (!a || !b) return false;
  return constantTimeEqual(a, b);
}

/**
 * Check if a submitted password matches the configured admin password.
 * Constant-time comparison.
 */
export function verifyPassword(submitted: string): boolean {
  if (!submitted) return false;
  const expected = getPassword();
  const encoder = new TextEncoder();
  const a = encoder.encode(submitted);
  const b = encoder.encode(expected);
  return constantTimeEqual(a, b);
}
