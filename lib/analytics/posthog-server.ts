import { PostHog } from "posthog-node";

/**
 * Server-side PostHog client for tracking backend events.
 *
 * Uses POSTHOG_SERVER_KEY (same key as the client NEXT_PUBLIC_POSTHOG_KEY,
 * but read server-side so it's not prefixed with NEXT_PUBLIC_ for clarity).
 * Falls back to NEXT_PUBLIC_POSTHOG_KEY if POSTHOG_SERVER_KEY isn't set.
 *
 * All calls are fire-and-forget — analytics should never block or crash
 * business logic. Every function wraps in try/catch.
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
 * Track a server-side event. Fire-and-forget.
 *
 * @param userId  - The DB user id (UUID). Used as the PostHog distinct_id.
 * @param event   - Event name (snake_case).
 * @param properties - Arbitrary properties attached to the event.
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
        ...properties,
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
        ...properties,
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
