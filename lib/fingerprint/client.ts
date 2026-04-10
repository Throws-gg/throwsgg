"use client";

/**
 * Lightweight client helper for FingerprintJS Pro.
 *
 * If NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY isn't set, this returns null without
 * throwing so the auth flow still works in dev.
 *
 * We only load FingerprintJS when we actually need a visitor ID (on signup)
 * so we don't pay the bundle cost on every page.
 */

let cached: string | null = null;
let inFlight: Promise<string | null> | null = null;

export async function getVisitorId(): Promise<string | null> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  const publicKey = process.env.NEXT_PUBLIC_FINGERPRINT_PUBLIC_KEY;
  if (!publicKey) return null;

  inFlight = (async () => {
    try {
      const { load } = await import("@fingerprintjs/fingerprintjs-pro");
      const fp = await load({ apiKey: publicKey });
      const result = await fp.get();
      cached = result.visitorId;
      return cached;
    } catch (err) {
      console.warn("FingerprintJS failed:", err);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
