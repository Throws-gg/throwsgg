import { PrivyClient } from "@privy-io/server-auth";

let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret || appId === "your_privy_app_id") {
      throw new Error("Privy credentials not configured");
    }

    privyClient = new PrivyClient(appId, appSecret);
  }
  return privyClient;
}

/**
 * Verify a Privy access token from the Authorization header.
 * Returns the Privy user ID (DID) if valid, null if invalid/missing.
 */
export async function verifyAuthToken(
  authHeader: string | null
): Promise<{ userId: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const client = getPrivyClient();
    const verified = await client.verifyAuthToken(token);
    return { userId: verified.userId };
  } catch {
    return null;
  }
}

/**
 * Dev mode fallback — if Privy isn't configured, accept userId from request body.
 * ONLY works when PRIVY_APP_SECRET is not set (dev mode).
 */
export function isDevMode(): boolean {
  const secret = process.env.PRIVY_APP_SECRET;
  return !secret || secret === "your_privy_app_secret";
}
