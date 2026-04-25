import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getPrivyClient } from "@/lib/auth/privy";

/**
 * Sweep a user's USDC embedded wallet balance to our hot wallet.
 *
 * Pre-requisites:
 *   - User has delegated their wallet to our authorization key (one-time consent
 *     via the Privy delegation modal). See lib/auth/privy.ts:isWalletDelegated.
 *   - PRIVY_AUTHORIZATION_KEY is set in env (passed to PrivyClient).
 *   - The "sweep-usdc-prod" policy is attached to that key in Privy dashboard,
 *     restricting signing to: TransferChecked, USDC mint, destination = hot ATA.
 *
 * Mechanics:
 *   - Hot wallet pays the SOL transaction fee via the fee-payer pattern. User's
 *     embedded wallet doesn't need any SOL.
 *   - User's embedded wallet signs the SPL transferChecked instruction (via
 *     Privy walletApi).
 *   - Idempotent on-chain: transferring 0 is a no-op (we early-return).
 *   - Idempotent against double-sweep: we read the current on-chain balance
 *     and sweep that exact amount — concurrent sweeps would just see 0 left.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DECIMALS = 6;
const HOT_WALLET_PUBKEY = new PublicKey(
  "AUnU6WA1EXJwZnSHjiAWGzXzWn2As27XEAUmj7YFNxZT"
);
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
// CAIP-2 mainnet for Solana — required by Privy's signAndSendTransaction.
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;

export interface SweepResult {
  status: "swept" | "skipped_zero" | "skipped_disabled" | "skipped_no_hot_key" | "failed";
  amount?: number; // ui amount (USDC)
  signature?: string;
  error?: string;
}

/**
 * Sweep all USDC out of `userWalletAddress` into the hot wallet ATA.
 * Caller is responsible for verifying the user has delegated.
 */
export async function sweepUserUsdc(
  userWalletAddress: string
): Promise<SweepResult> {
  // Master kill-switch — flip in Vercel env if anything weird happens in prod.
  if (process.env.SWEEP_ENABLED !== "true") {
    return { status: "skipped_disabled" };
  }

  const hotKey = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!hotKey) {
    return {
      status: "skipped_no_hot_key",
      error: "HOT_WALLET_PRIVATE_KEY not configured",
    };
  }

  try {
    const userPubkey = new PublicKey(userWalletAddress);
    const conn = new Connection(RPC_URL, "confirmed");

    // Find the user's USDC ATA + read its current balance. allowOwnerOffCurve
    // because Privy embedded wallets are PDAs.
    const userAta = await getAssociatedTokenAddress(USDC_MINT, userPubkey, true);
    const accountInfo = await conn.getAccountInfo(userAta);
    if (!accountInfo) {
      // No ATA = no USDC ever sent. Nothing to sweep.
      return { status: "skipped_zero" };
    }

    const balResp = await conn.getTokenAccountBalance(userAta);
    const rawAmount = BigInt(balResp.value.amount);
    if (rawAmount === BigInt(0)) {
      return { status: "skipped_zero" };
    }

    // Hot wallet ATA — must already exist (we keep float there for withdrawals).
    const hotAta = await getAssociatedTokenAddress(
      USDC_MINT,
      HOT_WALLET_PUBKEY,
      false
    );

    // Build a fee-payer transaction:
    //   - feePayer = hot wallet (so user's embedded wallet doesn't need SOL)
    //   - signers  = hot wallet (for fee) + user's embedded wallet (for transfer authority)
    // Privy will sign for the user's wallet; we sign for the fee payer locally.
    const hotWallet = Keypair.fromSecretKey(bs58.decode(hotKey));

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

    const tx = new Transaction({
      feePayer: hotWallet.publicKey,
      blockhash,
      lastValidBlockHeight,
    });

    // Defensive: if the hot ATA somehow doesn't exist (extremely unlikely since
    // we hold $3K+ there), create it. The fee payer (hot wallet) covers rent.
    const hotAtaInfo = await conn.getAccountInfo(hotAta);
    if (!hotAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          hotWallet.publicKey,
          hotAta,
          HOT_WALLET_PUBKEY,
          USDC_MINT
        )
      );
    }

    // The actual sweep — TransferChecked is the policy-allowed instruction.
    // Authority = the user's embedded wallet (Privy will sign for it).
    tx.add(
      createTransferCheckedInstruction(
        userAta, // source — user's USDC ATA
        USDC_MINT,
        hotAta, // destination — hot wallet's USDC ATA
        userPubkey, // authority — user's embedded wallet
        rawAmount, // raw amount in base units (6 decimals for USDC)
        USDC_DECIMALS
      )
    );

    // Hot wallet signs the fee. Privy will sign as `userPubkey` via the
    // walletApi call below — Privy's signature is added to the tx by the API,
    // not by us. We pre-sign as the fee payer so the tx is partial-signed
    // when handed to Privy.
    tx.partialSign(hotWallet);

    // Hand the partial-signed tx to Privy. Privy adds the user's signature
    // (gated by the policy) and broadcasts. The policy ensures Privy will
    // ONLY sign if the destination is the hot ATA, mint is USDC, and
    // instruction is transferChecked. Anything else → policy denial → throws.
    const privy = getPrivyClient();
    const result = await privy.walletApi.solana.signAndSendTransaction({
      address: userWalletAddress,
      chainType: "solana",
      caip2: SOLANA_MAINNET_CAIP2,
      transaction: tx,
    });

    const uiAmount = Number(rawAmount) / 10 ** USDC_DECIMALS;
    return {
      status: "swept",
      amount: uiAmount,
      signature: result.hash,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sweepUserUsdc failed:", { userWalletAddress, error: message });
    return { status: "failed", error: message };
  }
}
