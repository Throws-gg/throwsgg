import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/internal/log-geo-block
 *
 * Receives compliance log events from the edge middleware (middleware.ts
 * can't call Supabase directly from the Edge Runtime). Fire-and-forget
 * caller — always returns 200 quickly.
 *
 * Auth: the middleware passes a shared secret in `x-internal-secret`.
 * Must match INTERNAL_GEO_LOG_SECRET env var. Without a match we 401 silently.
 *
 * Persists each block attempt as an admin_actions row:
 *   admin_identifier = "geo-block"
 *   admin_username   = "geo-block"
 *   action_type      = "geo_block"
 *   target_type      = "request"
 *   target_id        = null
 *   after_value      = { reason, country, region, path, user_agent, ip, referrer }
 *   reason           = human summary string
 *
 * This is not a full compliance_geo_blocks table (per research doc §4C that's
 * P1 work) — reusing admin_actions keeps us with zero new schema. Migrate to
 * a dedicated table if/when regulator requests require structured exports.
 *
 * Retention: admin_actions is never deleted by us, so we inherit 5-year
 * AML retention for free.
 */

interface LogBody {
  reason: string;
  country: string | null;
  region: string | null;
  path: string | null;
  user_agent: string | null;
  referrer: string | null;
  ip: string | null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const secret = process.env.INTERNAL_GEO_LOG_SECRET;
  if (!secret) {
    // Not configured — fail open, silently. We'd rather ship geo-block
    // without logging than hold up the whole middleware on a missing env.
    return NextResponse.json({ logged: false, reason: "not_configured" });
  }

  const provided = request.headers.get("x-internal-secret") ?? "";
  if (!provided || !constantTimeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LogBody;
  try {
    body = (await request.json()) as LogBody;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const countryLabel = body.country ?? "??";
  const regionLabel = body.region ? `/${body.region}` : "";

  // Swallow insert errors — best-effort logging must never break the
  // middleware response path.
  try {
    await supabase.from("admin_actions").insert({
      admin_identifier: "geo-block",
      admin_username: "geo-block",
      action_type: "geo_block",
      target_type: "request",
      target_id: null,
      after_value: {
        reason: body.reason,
        country: body.country,
        region: body.region,
        path: body.path,
        user_agent: body.user_agent,
        referrer: body.referrer,
        ip: body.ip,
      },
      reason: `${body.reason} — ${countryLabel}${regionLabel} hit ${body.path ?? "?"}`,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ logged: true });
}
