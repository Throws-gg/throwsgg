import { PrivyClient, type WalletWithMetadata } from "@privy-io/server-auth";

let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret || appId === "your_privy_app_id") {
      throw new Error("Privy credentials not configured");
    }

    // PRIVY_AUTHORIZATION_KEY is the secret half of the "Sweeping Key"
    // authorization keypair from the Privy dashboard. With it, calls to
    // privy.walletApi.solana.signAndSendTransaction() will be signed by
    // this key — and the policy attached to the key (sweep-usdc-prod)
    // restricts what those signatures can authorize: USDC SPL transfers
    // to our hot wallet ATA only, transferChecked only.
    //
    // Without it, walletApi calls to delegated wallets fail authorization.
    // Optional in dev/local — if unset, the client still works for
    // non-walletApi calls (verifyAuthToken, getUserById, etc.).
    const authorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_KEY;

    privyClient = new PrivyClient(appId, appSecret, {
      walletApi: authorizationPrivateKey
        ? { authorizationPrivateKey }
        : undefined,
    });
  }
  return privyClient;
}

/**
 * Check whether a user has delegated their embedded Solana wallet to our
 * authorization key. Required before we can sweep their deposits.
 */
export async function isWalletDelegated(privyDid: string): Promise<{
  delegated: boolean;
  walletAddress: string | null;
}> {
  try {
    const client = getPrivyClient();
    const user = await client.getUserById(privyDid);
    const embedded = user.linkedAccounts.find((a): a is WalletWithMetadata =>
      a.type === "wallet" &&
      (a as WalletWithMetadata).walletClientType === "privy" &&
      (a as WalletWithMetadata).chainType === "solana"
    );
    if (!embedded) return { delegated: false, walletAddress: null };

    // The `delegated` flag on the WalletWithMetadata is true once the user
    // has consented via the delegateWallet flow.
    const delegated =
      (embedded as unknown as { delegated?: boolean }).delegated === true;

    return { delegated, walletAddress: embedded.address };
  } catch (err) {
    console.error("isWalletDelegated failed:", err);
    return { delegated: false, walletAddress: null };
  }
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
