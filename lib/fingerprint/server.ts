/**
 * Server-side FingerprintJS Pro verification.
 *
 * The visitor ID the client sends is useless for abuse detection on its own —
 * an attacker can paste any string into the /api/auth/sync request body. To
 * trust it, we hit Fingerprint's Server API with our secret key and confirm:
 *   1. The visitor ID exists and was seen recently (within a few minutes)
 *   2. The request IP matches (prevents replay from a different device)
 *   3. No bot signals (incognito-ok, but headless/automation is suspicious)
 *
 * If FINGERPRINT_SECRET_KEY isn't set, this returns { verified: false,
 * reason: "not_configured" } so the rest of the flow can continue without
 * fingerprint protection in dev.
 */
export interface FingerprintVerification {
  verified: boolean;
  visitorId: string | null;
  reason?: string;
  botDetected?: boolean;
  incognito?: boolean;
  ip?: string | null;
  lastSeenAt?: string | null;
}

const REGIONS = ["us", "eu", "ap"] as const;

interface VisitEvent {
  requestId: string;
  visitorId: string;
  ip?: string;
  incognito?: boolean;
  timestamp?: number;
  botd?: { bot?: { result?: string } };
}

async function fetchVisitor(
  visitorId: string,
  secretKey: string
): Promise<VisitEvent | null> {
  // Fingerprint's Server API is region-scoped. We default to `us` but fall
  // back to eu/ap if the visitor isn't found — the key works across regions
  // once the correct one responds.
  for (const region of REGIONS) {
    const host =
      region === "us"
        ? "https://api.fpjs.io"
        : `https://${region}.api.fpjs.io`;
    try {
      const res = await fetch(
        `${host}/visitors/${encodeURIComponent(visitorId)}?limit=1`,
        {
          headers: { "Auth-API-Key": secretKey },
          cache: "no-store",
        }
      );
      if (res.status === 404) continue;
      if (!res.ok) continue;
      const json = (await res.json()) as { visits?: VisitEvent[] };
      const visit = json.visits?.[0];
      if (visit) return visit;
    } catch {
      // try next region
    }
  }
  return null;
}

export async function verifyFingerprint(
  visitorId: string | null,
  requestIp: string | null
): Promise<FingerprintVerification> {
  if (!visitorId) {
    return { verified: false, visitorId: null, reason: "missing" };
  }

  const secretKey = process.env.FINGERPRINT_SECRET_KEY;
  if (!secretKey) {
    return { verified: false, visitorId, reason: "not_configured" };
  }

  const visit = await fetchVisitor(visitorId, secretKey);
  if (!visit) {
    return { verified: false, visitorId, reason: "not_found" };
  }

  // Freshness — the visit must have happened in the last 5 minutes. Stops
  // an attacker from capturing one real visitor ID and reusing it forever.
  const ageMs = visit.timestamp ? Date.now() - visit.timestamp : Infinity;
  if (ageMs > 5 * 60 * 1000) {
    return {
      verified: false,
      visitorId,
      reason: "stale",
      lastSeenAt: visit.timestamp ? new Date(visit.timestamp).toISOString() : null,
    };
  }

  // IP check — the visit's IP should match the request's IP. We only enforce
  // this when we have both values; reverse proxies can strip it.
  if (requestIp && visit.ip && visit.ip !== requestIp) {
    return {
      verified: false,
      visitorId,
      reason: "ip_mismatch",
      ip: visit.ip,
    };
  }

  const botDetected = visit.botd?.bot?.result === "bad";

  return {
    verified: true,
    visitorId,
    botDetected,
    incognito: visit.incognito,
    ip: visit.ip ?? null,
    lastSeenAt: visit.timestamp ? new Date(visit.timestamp).toISOString() : null,
  };
}
