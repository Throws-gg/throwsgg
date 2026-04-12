import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

/**
 * POST /api/affiliates/click
 *
 * Called from the /r/[code] landing page to log a click against an
 * affiliate code. Validates the code exists (as a users.referral_code)
 * and inserts a row into affiliate_clicks for traffic visibility.
 *
 * Returns { valid: boolean } so the landing page can show a "this code
 * is invalid" state if someone types a garbage code.
 *
 * Rate limiting: none at launch. If this becomes a vector for spam,
 * add a simple per-IP cooldown.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawCode = typeof body.code === "string" ? body.code : "";
    const code = rawCode.trim().toUpperCase();

    if (!code || code.length < 4 || code.length > 32) {
      return NextResponse.json({ valid: false, reason: "invalid_format" }, { status: 200 });
    }

    const supabase = createAdminClient();

    // Resolve code → user_id. Checks vanity slugs first, then referral_code.
    const { data: resolvedUserId } = await supabase.rpc("resolve_referral_code", {
      p_code: code,
    });

    if (!resolvedUserId) {
      return NextResponse.json({ valid: false, reason: "not_found" }, { status: 200 });
    }

    // Hash the client IP for basic dedupe visibility without storing PII
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "";
    const ipHash = ip
      ? crypto.createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "throws")).digest("hex").slice(0, 32)
      : null;

    const referer = request.headers.get("referer") || null;
    const userAgent = request.headers.get("user-agent") || null;

    // Log the click. Fire-and-forget — don't block the response on a DB error.
    const { error } = await supabase.from("affiliate_clicks").insert({
      code,
      referer,
      user_agent: userAgent,
      ip_hash: ipHash,
    });

    if (error) {
      console.error("[affiliates/click] insert failed:", error);
      // Still return valid — the click is real even if we couldn't log it
    }

    return NextResponse.json({ valid: true });
  } catch (err) {
    console.error("[affiliates/click] fatal:", err);
    return NextResponse.json({ valid: false, reason: "error" }, { status: 500 });
  }
}
