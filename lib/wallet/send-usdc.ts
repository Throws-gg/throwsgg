import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import bs58 from "bs58";

const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
const USDC_DECIMALS = 6;

/**
 * Load the platform hot wallet keypair from env.
 * HOT_WALLET_PRIVATE_KEY should be a base58-encoded secret key.
 */
function getHotWallet(): Keypair {
  const key = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!key) {
    throw new Error("HOT_WALLET_PRIVATE_KEY not configured");
  }
  return Keypair.fromSecretKey(bs58.decode(key));
}

export type SendUsdcResult =
  | {
      // Transaction submitted to the network AND confirmation seen.
      // Balance debit is safe to keep; do NOT refund.
      status: "confirmed";
      signature: string;
    }
  | {
      // Transaction was submitted but confirmation timed out or threw.
      // The caller MUST NOT auto-refund — query chain state before deciding.
      // We hand back the signature so the caller can do that.
      status: "unknown";
      signature: string;
      error: string;
    }
  | {
      // Transaction was NEVER submitted (pre-flight failure: no source ATA,
      // destination invalid, hot wallet out of SOL for gas, RPC down, etc.).
      // Safe to refund the user's balance.
      status: "not_submitted";
      error: string;
    };

/**
 * Send USDC from the platform hot wallet. Split into two phases so the caller
 * can distinguish "confirmation failed but tx may have landed" from "tx was
 * never submitted at all". See SendUsdcResult for refund-safety rules.
 */
export async function sendUsdc(
  destinationAddress: string,
  amountUsd: number
): Promise<SendUsdcResult> {
  const connection = new Connection(RPC_URL, "confirmed");
  const hotWallet = getHotWallet();
  const destination = new PublicKey(destinationAddress);

  const amountLamports = Math.floor(amountUsd * 10 ** USDC_DECIMALS);
  if (amountLamports <= 0) {
    return { status: "not_submitted", error: "Amount too small to send" };
  }

  // --- Pre-flight (any failure here is safe to refund) ---

  let sourceAtaAddress: PublicKey;
  let destAtaAddress: PublicKey;

  try {
    const sourceTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      hotWallet,
      USDC_MINT,
      hotWallet.publicKey
    );
    sourceAtaAddress = sourceTokenAccount.address;

    const destTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      hotWallet, // hot wallet pays rent if the user's ATA doesn't exist yet
      USDC_MINT,
      destination
    );
    destAtaAddress = destTokenAccount.address;
  } catch (err) {
    return {
      status: "not_submitted",
      error: err instanceof Error ? err.message : "ATA setup failed",
    };
  }

  // Build transaction.
  const transferIx = createTransferInstruction(
    sourceAtaAddress,
    destAtaAddress,
    hotWallet.publicKey,
    amountLamports
  );
  const tx = new Transaction().add(transferIx);

  // --- Send + confirm (if anything fails AFTER this line, the tx may have landed) ---

  let signature: string;
  try {
    signature = await sendAndConfirmTransaction(connection, tx, [hotWallet], {
      commitment: "confirmed",
      maxRetries: 3,
    });
    return { status: "confirmed", signature };
  } catch (err) {
    // sendAndConfirmTransaction throws a ConfirmTransactionError with the
    // signature attached when confirmation times out but the tx was sent.
    const errObj = err as { signature?: string; message?: string } & Error;
    const maybeSig = errObj?.signature;
    const message = errObj?.message ?? "Unknown send error";

    if (typeof maybeSig === "string" && maybeSig.length > 0) {
      return { status: "unknown", signature: maybeSig, error: message };
    }

    // No signature attached — the network never accepted the tx.
    return { status: "not_submitted", error: message };
  }
}

/**
 * Check the on-chain status of a previously-submitted signature. Used when
 * send returned `unknown` — if the signature is in fact confirmed/finalized,
 * the debit stays; if it's known-failed, refund is safe.
 */
export async function checkSignatureStatus(
  signature: string
): Promise<"confirmed" | "failed" | "unknown"> {
  const connection = new Connection(RPC_URL, "confirmed");
  try {
    const resp = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    const s = resp.value;
    if (!s) return "unknown";
    if (s.err) return "failed";
    if (
      s.confirmationStatus === "confirmed" ||
      s.confirmationStatus === "finalized"
    ) {
      return "confirmed";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Check the hot wallet's USDC balance.
 */
export async function getHotWalletUsdcBalance(): Promise<number> {
  const connection = new Connection(RPC_URL, "confirmed");
  const hotWallet = getHotWallet();

  try {
    const tokenAddress = await getAssociatedTokenAddress(
      USDC_MINT,
      hotWallet.publicKey
    );
    const balance = await connection.getTokenAccountBalance(tokenAddress);
    return balance.value.uiAmount || 0;
  } catch {
    return 0;
  }
}

/**
 * Validate that a string is a valid Solana public key.
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
