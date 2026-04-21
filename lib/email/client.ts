import { Resend } from "resend";

/**
 * Shared Resend client. No-ops gracefully when RESEND_API_KEY is unset so
 * local dev doesn't error — returns null and send.ts skips the send.
 */
let cached: Resend | null | undefined;

export function getResend(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Resend(key);
  return cached;
}

export const EMAIL_FROM =
  process.env.EMAIL_FROM || "throws.gg <no-reply@throws.gg>";
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO || "support@throws.gg";
