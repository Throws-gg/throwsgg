import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

/**
 * POST /api/unsubscribe
 *
 * Handles both:
 *   - Gmail/Yahoo one-click unsubscribe (List-Unsubscribe-Post header) — they
 *     POST here with the token in the body as `List-Unsubscribe=One-Click`.
 *   - Our own /unsubscribe page confirmation button.
 *
 * No Privy auth — the signed token IS the auth. Mirrors the tradeoff every
 * unsubscribe system makes: the user just wants to stop the emails, and
 * forcing a login defeats the point.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token");

  if (!token) {
    // One-click unsubscribe POSTs form-urlencoded: `List-Unsubscribe=One-Click`
    // The token is in the URL the email provider was given. If they called us
    // without ?token=... we also accept it in the body as a fallback.
    try {
      const ct = request.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const body = await request.json();
        token = body.token;
      } else {
        const body = await request.text();
        const params = new URLSearchParams(body);
        token = params.get("token");
      }
    } catch {
      // fall through
    }
  }

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ email_unsubscribed_at: new Date().toISOString() })
    .eq("id", verified.userId)
    .is("email_unsubscribed_at", null);

  if (error) {
    console.error("Unsubscribe update failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
