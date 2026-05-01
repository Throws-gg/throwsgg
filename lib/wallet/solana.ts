import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

// Solana RPC endpoint — use Helius or other RPC provider in production
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_MINT_STRING = USDC_MINT.toBase58();

// Solana Token Program (classic SPL). PYUSD / USDT / USDC all live here.
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// Well-known non-USDC mints we explicitly name in the warning. Anything not
// in this list is still rejected; it just gets labeled "Unknown token".
const KNOWN_FOREIGN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", decimals: 6 },
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": { symbol: "PYUSD", decimals: 6 },
};

export interface ForeignTokenBalance {
  mint: string;
  symbol: string;
  amount: number;
  rawAmount: string;
  decimals: number;
}

let connection: Connection | null = null;

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, "confirmed");
  }
  return connection;
}

/**
 * Get the SOL balance of a wallet in lamports.
 */
export async function getSolBalance(walletAddress: string): Promise<number> {
  const conn = getConnection();
  const pubkey = new PublicKey(walletAddress);
  const balance = await conn.getBalance(pubkey);
  return balance;
}

/**
 * Get the SOL balance in USD-equivalent.
 */
export async function getSolBalanceUsd(walletAddress: string): Promise<number> {
  const lamports = await getSolBalance(walletAddress);
  const sol = lamports / LAMPORTS_PER_SOL;
  const price = await getSolPrice();
  return sol * price;
}

/**
 * Get the USDC balance of a wallet.
 */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
  const conn = getConnection();
  const pubkey = new PublicKey(walletAddress);

  try {
    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
      mint: USDC_MINT,
    });

    if (tokenAccounts.value.length === 0) return 0;

    const usdcAccount = tokenAccounts.value[0];
    const amount = usdcAccount.account.data.parsed.info.tokenAmount.uiAmount;
    return amount || 0;
  } catch {
    return 0;
  }
}

/**
 * Enumerate every non-USDC SPL token sitting in the wallet with a non-zero
 * balance. We don't credit these — USDC is the only supported SPL — but we
 * need to detect them so the deposit endpoint can warn the user (and so the
 * admin refund tool can see what's actually there). Silent-ignore is the
 * user-funds-loss event; this function is the detection half of the fix.
 */
export async function getForeignTokenBalances(
  walletAddress: string
): Promise<ForeignTokenBalance[]> {
  const conn = getConnection();
  const pubkey = new PublicKey(walletAddress);

  try {
    // Pull every SPL token account the wallet owns — not just USDC.
    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    });

    const foreign: ForeignTokenBalance[] = [];
    for (const acct of tokenAccounts.value) {
      const info = acct.account.data.parsed?.info;
      const mint = info?.mint as string | undefined;
      if (!mint || mint === USDC_MINT_STRING) continue;

      const rawAmount = info.tokenAmount?.amount as string | undefined;
      const uiAmount = info.tokenAmount?.uiAmount as number | null | undefined;
      const decimals = info.tokenAmount?.decimals as number | undefined;
      if (!rawAmount || rawAmount === "0" || !uiAmount || uiAmount <= 0) continue;

      const known = KNOWN_FOREIGN_MINTS[mint];
      foreign.push({
        mint,
        symbol: known?.symbol ?? "UNKNOWN",
        amount: uiAmount,
        rawAmount,
        decimals: decimals ?? known?.decimals ?? 0,
      });
    }
    return foreign;
  } catch {
    return [];
  }
}

/**
 * Get both SOL and USDC balances for a wallet, plus any foreign SPL tokens
 * sitting in the wallet. Foreign tokens are NOT credited — the caller is
 * responsible for surfacing a warning and/or queuing a refund flow.
 */
export async function getWalletBalances(walletAddress: string): Promise<{
  solLamports: number;
  solUsd: number;
  usdc: number;
  totalUsd: number;
  foreignTokens: ForeignTokenBalance[];
}> {
  const [solLamports, usdc, foreignTokens] = await Promise.all([
    getSolBalance(walletAddress),
    getUsdcBalance(walletAddress),
    getForeignTokenBalances(walletAddress),
  ]);

  const sol = solLamports / LAMPORTS_PER_SOL;
  const solPrice = await getSolPrice();
  const solUsd = sol * solPrice;

  return {
    solLamports,
    solUsd,
    usdc,
    totalUsd: solUsd + usdc,
    foreignTokens,
  };
}

export interface UsdcTransferIn {
  signature: string;
  slot: number;
  blockTime: number | null;
  uiAmount: number; // USDC units, e.g. 10.5
}

/**
 * Enumerate incoming USDC transfers to this wallet's USDC associated token
 * account since the given slot (or the last 1000 if no cursor given). Only
 * returns transfers that INCREASE the wallet's USDC balance (rules out
 * outgoing sends that a caller might own or reversed txs).
 *
 * Returns most-recent-first (same order Solana gives us). The deposit
 * endpoint iterates oldest-to-newest so earlier signatures are credited
 * before later ones — makes the visible audit trail match chain order.
 */
export async function getUsdcTransfersIn(
  walletAddress: string,
  options: { sinceSlot?: number; limit?: number } = {}
): Promise<UsdcTransferIn[]> {
  const conn = getConnection();
  const owner = new PublicKey(walletAddress);

  // USDC ATA for this owner. This is deterministic; we don't need the account
  // to exist to derive it.
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner, true);

  // getSignaturesForAddress returns newest-first. Cap at 1000 for safety.
  const limit = Math.min(options.limit ?? 200, 1000);
  const sigInfos = await conn.getSignaturesForAddress(ata, { limit });

  const filtered = options.sinceSlot
    ? sigInfos.filter((s) => s.slot > options.sinceSlot!)
    : sigInfos;

  if (filtered.length === 0) return [];

  // Batch fetch parsed transactions. The RPC endpoint may rate-limit — we
  // serialise rather than parallelise to stay friendly with public endpoints.
  const transfers: UsdcTransferIn[] = [];
  for (const info of filtered) {
    if (info.err) continue; // skip failed txs
    try {
      const tx = await conn.getParsedTransaction(info.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (!tx) continue;

      // Inspect pre/post token balances for the exact USDC ATA. Matching only
      // by owner+mint is unsafe: a transaction can touch this ATA while moving
      // USDC into a different token account owned by the same wallet.
      const pre = tx.meta?.preTokenBalances ?? [];
      const post = tx.meta?.postTokenBalances ?? [];
      const ataStr = ata.toBase58();
      const accounts = tx.transaction.message.accountKeys;
      const ataIndex = accounts.findIndex((a) =>
        (typeof a === "string" ? a : a.pubkey.toBase58()) === ataStr
      );
      if (ataIndex < 0) continue;

      const preEntry = pre.find(
        (b) => b.accountIndex === ataIndex && b.mint === USDC_MINT_STRING
      );
      const postEntry = post.find(
        (b) => b.accountIndex === ataIndex && b.mint === USDC_MINT_STRING
      );

      const preAmount = preEntry ? Number(preEntry.uiTokenAmount.uiAmount ?? 0) : 0;
      const postAmount = postEntry ? Number(postEntry.uiTokenAmount.uiAmount ?? 0) : 0;

      const delta = postAmount - preAmount;
      if (delta <= 0) continue;

      transfers.push({
        signature: info.signature,
        slot: info.slot,
        blockTime: info.blockTime ?? null,
        uiAmount: delta,
      });
    } catch {
      // Skip signatures we can't parse; they'll be retried on the next poll.
      continue;
    }
  }

  return transfers;
}

/**
 * Get SOL price in USD. Cached for 60 seconds.
 */
let cachedSolPrice: { price: number; timestamp: number } | null = null;

async function getSolPrice(): Promise<number> {
  if (cachedSolPrice && Date.now() - cachedSolPrice.timestamp < 60_000) {
    return cachedSolPrice.price;
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const data = await res.json();
    const price = data.solana?.usd || 150; // Fallback price
    cachedSolPrice = { price, timestamp: Date.now() };
    return price;
  } catch {
    return cachedSolPrice?.price || 150;
  }
}
