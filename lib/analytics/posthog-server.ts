import { PostHog } from "posthog-node";
import { createHash } from "crypto";

/**
 * Server-side PostHog client for tracking backend events.
 *
 * Uses POSTHOG_SERVER_KEY (same key as the client NEXT_PUBLIC_POSTHOG_KEY,
 * but read server-side so it's not prefixed with NEXT_PUBLIC_ for clarity).
 * Falls back to NEXT_PUBLIC_POSTHOG_KEY if POSTHOG_SERVER_KEY isn't set.
 *
 * All calls are fire-and-forget — analytics should never block or crash
 * business logic. Every function wraps in try/catch.
 *
 * PII scrubbing: we never send raw wallet addresses, tx hashes, or raw
 * balances to PostHog. Wallet addresses are hashed (SHA-256, first 16 hex
 * chars — enough to correlate without revealing the address). Raw balance
 * fields get bucketed into tiers. tx_hash is dropped entirely. See
 * `scrubProperties` below for the field list.
 */

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (_client) return _client;

  const key =
    process.env.POSTHOG_SERVER_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    "https://us.i.posthog.com";

  if (!key || key === "your_posthog_key") return null;

  _client = new PostHog(key, { host, flushAt: 10, flushInterval: 5000 });
  return _client;
}

/**
 * Bucket a USD amount into a tier label. Used for balance properties on
 * user identify calls so PostHog doesn't hold raw financial figures.
 */
function bucketUsd(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "unknown";
  if (v <= 0) return "zero";
  if (v < 10) return "under_10";
  if (v < 100) return "under_100";
  if (v < 1000) return "under_1k";
  if (v < 10000) return "under_10k";
  return "over_10k";
}

/**
 * Hash a wallet address so we keep a stable correlation key without
 * shipping the raw address to PostHog. First 16 hex chars of SHA-256 is
 * ~10^19 space — collision-free at any realistic user count.
 */
function hashAddress(addr: unknown): string | null {
  if (typeof addr !== "string" || !addr) return null;
  return createHash("sha256").update(addr).digest("hex").slice(0, 16);
}

/**
 * Field-by-field scrub. Mutates a shallow copy of the properties object.
 *
 * - wallet_address → wallet_hash (SHA-256 prefix)
 * - destination_address → destination_hash
 * - referred_user_id / referrer_id → kept (internal DB UUIDs, not PII)
 * - tx_hash → dropped (blockchain-public but links PH identity to chain)
 * - current_balance / new_balance → *_tier bucket
 * - lifetime_wagered / lifetime_deposited / lifetime_withdrawn / total_wagered /
 *   total_profit / bonus_balance / wagering_remaining → *_tier bucket
 * - amount_usd / fee_usd / bonus_amount / signup_bonus_amount — KEPT. These
 *   are per-event business metrics, not linked-to-user balances, and are
 *   needed for funnel/revenue analysis. We already avoid attaching them to
 *   user identities.
 *
 * Anything else passes through untouched.
 */
function scrubProperties(
  props: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!props) return props;
  const out: Record<string, unknown> = { ...props };

  if ("wallet_address" in out) {
    out.wallet_hash = hashAddress(out.wallet_address);
    delete out.wallet_address;
  }
  if ("destination_address" in out) {
    out.destination_hash = hashAddress(out.destination_address);
    delete out.destination_address;
  }
  if ("address" in out && typeof out.address === "string" && out.address.length >= 32) {
    out.address_hash = hashAddress(out.address);
    delete out.address;
  }

  if ("tx_hash" in out) delete out.tx_hash;
  if ("signature" in out && typeof out.signature === "string" && out.signature.length > 40) {
    delete out.signature;
  }

  const bucketFields = [
    "current_balance",
    "new_balance",
    "lifetime_wagered",
    "lifetime_deposited",
    "lifetime_withdrawn",
    "total_wagered",
    "total_profit",
    "bonus_balance",
    "wagering_remaining",
  ];
  for (const f of bucketFields) {
    if (f in out) {
      out[`${f}_tier`] = bucketUsd(out[f]);
      delete out[f];
    }
  }

  return out;
}

/**
 * Track a server-side event. Fire-and-forget.
 *
 * @param userId  - The DB user id (UUID). Used as the PostHog distinct_id.
 * @param event   - Event name (snake_case).
 * @param properties - Arbitrary properties attached to the event. Scrubbed
 *                     for PII before send (wallet addresses hashed, raw
 *                     balances bucketed, tx_hash dropped).
 */
export function trackServer(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  try {
    const client = getClient();
    if (!client) return;
    client.capture({
      distinctId: userId,
      event,
      properties: {
        ...scrubProperties(properties),
        $lib: "posthog-node",
        source: "server",
      },
    });
  } catch {
    // Never crash on analytics
  }
}

/**
 * Set user properties server-side. Merges with existing properties.
 * Good for setting properties computed from DB data (lifetime totals,
 * deposit tier, VIP level, etc.) that the client doesn't know about.
 *
 * Scrubbed identically to trackServer.
 */
export function identifyServer(
  userId: string,
  properties: Record<string, unknown>
) {
  try {
    const client = getClient();
    if (!client) return;
    client.identify({
      distinctId: userId,
      properties: {
        ...scrubProperties(properties),
        $lib: "posthog-node",
      },
    });
  } catch {
    // Never crash on analytics
  }
}

/**
 * Flush pending events. Call this in edge cases where the process might
 * exit before the flush interval fires (e.g. Vercel serverless cold starts).
 * Not required in most cases — the client auto-flushes.
 */
export async function flushServer() {
  try {
    const client = getClient();
    if (!client) return;
    await client.flush();
  } catch {
    // ignore
  }
}
