import crypto from "node:crypto";

/**
 * Signed unsubscribe tokens — we don't want the token to be guessable and
 * we don't want it to leak on server logs if the user forwards an email.
 *
 * Format: `<userId>.<categoryOrAll>.<base64url-hmac>`
 *   - hmac = HMAC-SHA256(secret, `${userId}.${categoryOrAll}`)
 *   - secret = ADMIN_SESSION_SALT (already required ≥32 chars in prod)
 *
 * No expiry — unsubscribe links must work forever for CAN-SPAM compliance.
 */

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SALT;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SALT not set — cannot sign unsub token");
  }
  return secret;
}

export function signUnsubscribeToken(
  userId: string,
  scope: "all" | string = "all"
): string {
  const body = `${userId}.${scope}`;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");
  return `${userId}.${scope}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; scope: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, scope, providedSig] = parts;
  const body = `${userId}.${scope}`;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId, scope };
}

export function unsubscribeUrl(userId: string, scope: "all" | string = "all"): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || "https://throws.gg";
  const token = signUnsubscribeToken(userId, scope);
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}
