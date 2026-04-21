import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/webhooks/resend
 *
 * Resend → Svix-signed webhook. Handles opened/clicked/bounced/complained
 * events by updating the corresponding row in `email_log` (matched on
 * resend_message_id). Silently skips unknown events.
 *
 * Signature verification:
 *   Svix format — the signing payload is `${svix_id}.${svix_timestamp}.${rawBody}`,
 *   signed with HMAC-SHA256 using the secret (base64-decoded, stripped of the
 *   "whsec_" prefix if present). The header contains one or more signatures in
 *   the form `v1,<base64-sig> v1,<base64-sig>` — we compare against each.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed in prod; in dev, log and accept.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  const rawBody = await request.text();

  if (secret) {
    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json(
        { error: "Missing signature headers" },
        { status: 401 }
      );
    }

    // Reject replays older than 5 minutes
    const ts = parseInt(svixTimestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json(
        { error: "Timestamp out of range" },
        { status: 401 }
      );
    }

    const secretBytes = Buffer.from(
      secret.startsWith("whsec_") ? secret.slice(6) : secret,
      "base64"
    );

    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expected = crypto
      .createHmac("sha256", secretBytes)
      .update(signedPayload)
      .digest("base64");

    // Header may contain multiple space-separated `v1,sig` pairs
    const provided = svixSignature
      .split(" ")
      .map((p) => p.split(",")[1])
      .filter(Boolean);

    const ok = provided.some((sig) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig, "base64"),
          Buffer.from(expected, "base64")
        );
      } catch {
        return false;
      }
    });

    if (!ok) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }
  }

  let payload: {
    type?: string;
    data?: { email_id?: string; created_at?: string };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = payload.data?.email_id;
  const type = payload.type;
  if (!messageId || !type) {
    return NextResponse.json({ ok: true, skipped: "no_message_id" });
  }

  const eventTimestamp = payload.data?.created_at ?? new Date().toISOString();

  const column: Record<string, string> = {
    "email.opened": "opened_at",
    "email.clicked": "clicked_at",
    "email.bounced": "bounced_at",
    "email.complained": "complaint_at",
  };

  const col = column[type];
  if (!col) {
    // delivered/sent/failed — ignore for now
    return NextResponse.json({ ok: true, skipped: "event_ignored" });
  }

  const supabase = createAdminClient();

  // Only write if the column is still null — first event wins so the
  // sent→opened→clicked sequence records the earliest timestamp for each.
  const { error } = await supabase
    .from("email_log")
    .update({ [col]: eventTimestamp })
    .eq("resend_message_id", messageId)
    .is(col, null);

  if (error) {
    console.error("Resend webhook update failed:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // A complaint (spam report) is a signal to globally unsubscribe the user.
  // Flip email_unsubscribed_at via a lookup by message_id → user_id.
  if (type === "email.complained") {
    const { data: row } = await supabase
      .from("email_log")
      .select("user_id")
      .eq("resend_message_id", messageId)
      .single();
    if (row?.user_id) {
      await supabase
        .from("users")
        .update({ email_unsubscribed_at: new Date().toISOString() })
        .eq("id", row.user_id)
        .is("email_unsubscribed_at", null);
    }
  }

  return NextResponse.json({ ok: true });
}
