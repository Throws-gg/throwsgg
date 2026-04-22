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

// Default From uses a personal-sounding address (real name + first-name
// inbox) which consistently outperforms no-reply@ in Gmail/Outlook inbox
// placement for new sending domains. The EMAIL_FROM env var overrides this.
// The inbox itself just needs to exist (Cloudflare Email Routing → a real
// mailbox is fine) so replies don't hard-bounce.
export const EMAIL_FROM =
  process.env.EMAIL_FROM || "Connor at throws.gg <connor@throws.gg>";
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO || "connor@throws.gg";
