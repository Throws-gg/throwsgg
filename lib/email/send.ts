import { render } from "@react-email/render";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, EMAIL_FROM, EMAIL_REPLY_TO } from "./client";
import {
  EmailCategory,
  DEFAULT_PREFERENCES,
  isTransactional,
} from "./categories";
import { unsubscribeUrl } from "./unsubscribe-token";

interface SendArgs {
  to: string;
  subject: string;
  category: EmailCategory;
  userId?: string | null; // for preference lookup + logging
  react: React.ReactElement;
  // Optional idempotency key — if passed, we skip sending when an email with
  // this key already exists in `email_log`. Use for "big win" / "bonus
  // expiring" etc. where the same trigger could fire twice on a retry.
  idempotencyKey?: string;
}

interface SendResult {
  sent: boolean;
  skipped?:
    | "no_api_key"
    | "no_recipient"
    | "opted_out"
    | "already_sent"
    | "error";
  error?: string;
  messageId?: string;
}

/**
 * Send an email. Handles:
 *   - preference gating (transactional always sends)
 *   - idempotency (dedup via email_log)
 *   - rendering the React Email component to HTML
 *   - logging to email_log for retention analytics
 *   - graceful no-op when RESEND_API_KEY is unset
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const resend = getResend();
  if (!resend) return { sent: false, skipped: "no_api_key" };
  if (!args.to) return { sent: false, skipped: "no_recipient" };

  const supabase = createAdminClient();

  // Preference check (skipped for transactional)
  if (!isTransactional(args.category) && args.userId) {
    const allowed = await isCategoryAllowed(args.userId, args.category);
    if (!allowed) return { sent: false, skipped: "opted_out" };
  }

  // Idempotency check
  if (args.idempotencyKey) {
    const { data: existing } = await supabase
      .from("email_log")
      .select("id")
      .eq("idempotency_key", args.idempotencyKey)
      .maybeSingle();
    if (existing) return { sent: false, skipped: "already_sent" };
  }

  // Render both HTML and a plain-text fallback. Multipart messages score
  // better with spam filters (Gmail/Outlook both use plaintext presence as a
  // legitimacy signal) and any client that doesn't render HTML (or chooses
  // not to, like text-mode Apple Mail) gets readable copy.
  const html = await render(args.react);
  const text = await render(args.react, { plainText: true });

  // Gmail + Yahoo bulk sender requirements: every non-transactional email
  // needs one-click unsubscribe. We attach both even on transactional
  // (`ONE_CLICK` header is harmless there — receivers just don't render it).
  const headers: Record<string, string> = {
    "X-Email-Category": args.category,
  };
  if (args.userId) {
    try {
      const url = unsubscribeUrl(args.userId, "all");
      headers["List-Unsubscribe"] = `<${url}>, <mailto:unsubscribe@throws.gg>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    } catch {
      // ADMIN_SESSION_SALT missing in dev — send without unsub header
    }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: args.to,
      replyTo: EMAIL_REPLY_TO,
      subject: args.subject,
      html,
      text,
      headers,
    });

    if (error) {
      console.error("Resend send error:", error);
      return { sent: false, skipped: "error", error: String(error) };
    }

    // Log for analytics + idempotency
    await supabase.from("email_log").insert({
      user_id: args.userId ?? null,
      to_email: args.to,
      category: args.category,
      subject: args.subject,
      idempotency_key: args.idempotencyKey ?? null,
      resend_message_id: data?.id ?? null,
    });

    return { sent: true, messageId: data?.id };
  } catch (err) {
    console.error("Email send threw:", err);
    return { sent: false, skipped: "error", error: String(err) };
  }
}

async function isCategoryAllowed(
  userId: string,
  category: EmailCategory
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("email_preferences, email_unsubscribed_at")
    .eq("id", userId)
    .single();

  if (!data) return false;
  // Global unsubscribe wins over category prefs
  if (data.email_unsubscribed_at) return isTransactional(category);

  const prefs = (data.email_preferences ?? {}) as Record<string, boolean>;
  if (category in prefs) return prefs[category] === true;
  return DEFAULT_PREFERENCES[category];
}
