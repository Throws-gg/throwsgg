import { PrivyClient, type WalletWithMetadata } from "@privy-io/server-auth";

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
 * Look up the Privy embedded Solana wallet address for a user.
 *
 * This is the race-free way to get the wallet — the client-side `useWallets`
 * hook populates asynchronously after auth, which caused the "users.wallet_address
 * is null" bug for 10/11 signups. The Privy server API is authoritative: the
 * user exists in Privy's system the moment verifyAuthToken succeeds, and their
 * embedded wallet is always present on the `linkedAccounts` array.
 *
 * Returns null if the user has no Solana embedded wallet yet (shouldn't happen
 * in prod since we force email+google login only and Privy auto-creates the
 * wallet on signup).
 */
export async function getSolanaEmbeddedAddress(privyDid: string): Promise<string | null> {
  try {
    const client = getPrivyClient();
    const user = await client.getUserById(privyDid);
    const embedded = user.linkedAccounts.find((a): a is WalletWithMetadata =>
      a.type === "wallet" &&
      (a as WalletWithMetadata).walletClientType === "privy" &&
      (a as WalletWithMetadata).chainType === "solana"
    );
    return embedded?.address ?? null;
  } catch (err) {
    console.error("getSolanaEmbeddedAddress failed:", err);
    return null;
  }
}

/**
 * Dev mode fallback — if Privy isn't configured, accept userId from request body.
 * ONLY works when PRIVY_APP_SECRET is not set AND NODE_ENV !== "production".
 * In production, a missing PRIVY_APP_SECRET throws at boot via lib/env.ts; this
 * guard is defense-in-depth against env-loader bypass.
 */
export function isDevMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const secret = process.env.PRIVY_APP_SECRET;
  return !secret || secret === "your_privy_app_secret";
}
