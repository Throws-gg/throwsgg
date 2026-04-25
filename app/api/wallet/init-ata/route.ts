import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSolanaEmbeddedAddress } from "@/lib/auth/privy";

/**
 * POST /api/wallet/init-ata
 *
 * Ensures the authenticated user's USDC Associated Token Account exists on
 * Solana. Pre-creating the ATA fixes the "deposit tx stuck on pending"
 * symptom that happens when the sender's wallet (Phantom, exchange, etc.)
 * won't auto-create a missing recipient ATA.
 *
 * The hot wallet pays the one-time rent (~0.002 SOL) to create the ATA.
 * Safe: it's a fixed per-user cost, deterministic, and only runs once per
 * user thanks to the idempotent on-chain getAccountInfo check.
 *
 * Idempotent:
 *   - Returns { status: "exists" } if the ATA is already there.
 *   - Returns { status: "created", signature } after a successful creation.
 *   - Returns { status: "skipped" } if the user already has ata_initialized
 *     set in the DB (avoids hot-wallet calls for repeat hits).
 *
 * Rate-limiting is implicit: we flip users.ata_initialized_at on success,
 * and a single retry by the client while the first call is in-flight will
 * either see the on-chain check hit (second call exits fast) or the DB
 * flag on the next sync.
 *
 * If HOT_WALLET_PRIVATE_KEY isn't configured, we return 503 rather than
 * throwing. The deposit flow still works for users — it just means new
 * deposits hang at the sender's end until they manually create the ATA.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export async function POST(request: NextRequest) {
  const authed = await verifyRequest(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hotKey = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!hotKey) {
    return NextResponse.json(
      { error: "Wallet initialization unavailable" },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();

  // Short-circuit if we already initialized this user's ATA. Avoids RPC calls.
  const { data: userRow } = await supabase
    .from("users")
    .select("wallet_address, ata_initialized_at")
    .eq("id", authed.dbUserId)
    .single();

  let walletAddress = userRow?.wallet_address;

  // Lazy backfill: TEE embedded wallets are provisioned a few seconds
  // after Privy auth completes, which sometimes lands AFTER our /auth/sync
  // call. If wallet_address is still null, re-fetch from Privy now and
  // persist.
  if (!walletAddress) {
    const fetched = await getSolanaEmbeddedAddress(authed.privyId);
    if (fetched) {
      await supabase
        .from("users")
        .update({ wallet_address: fetched })
        .eq("id", authed.dbUserId)
        .is("wallet_address", null);
      walletAddress = fetched;
    }
  }

  if (!walletAddress) {
    return NextResponse.json(
      { error: "No wallet linked to this account" },
      { status: 400 },
    );
  }

  if (userRow?.ata_initialized_at) {
    return NextResponse.json({ status: "skipped" });
  }

  try {
    const owner = new PublicKey(walletAddress);
    const connection = new Connection(RPC_URL, "confirmed");

    // ATA is a PDA — allowOwnerOffCurve=true lets us derive it for Privy
    // embedded wallets which are themselves PDAs.
    const ata = await getAssociatedTokenAddress(USDC_MINT, owner, true);

    // Check on-chain. If the account already exists, just flag the DB and exit.
    const accountInfo = await connection.getAccountInfo(ata);
    if (accountInfo) {
      await supabase
        .from("users")
        .update({ ata_initialized_at: new Date().toISOString() })
        .eq("id", authed.dbUserId);
      return NextResponse.json({ status: "exists" });
    }

    // Create it. Hot wallet pays the rent; we credit it to the user.
    const hotWallet = Keypair.fromSecretKey(bs58.decode(hotKey));
    const createIx = createAssociatedTokenAccountInstruction(
      hotWallet.publicKey, // payer
      ata,                 // ata address
      owner,               // owner of the ATA (user's wallet)
      USDC_MINT,
    );

    const tx = new Transaction().add(createIx);
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [hotWallet],
      { commitment: "confirmed", maxRetries: 3 },
    );

    await supabase
      .from("users")
      .update({ ata_initialized_at: new Date().toISOString() })
      .eq("id", authed.dbUserId);

    return NextResponse.json({ status: "created", signature });
  } catch (err) {
    console.error("init-ata failed:", err);
    return NextResponse.json(
      { error: "Failed to initialize token account" },
      { status: 500 },
    );
  }
}
