import type { Move, RoundResult } from "./constants";

const MOVES: Move[] = ["rock", "paper", "scissors"];

/**
 * Browser-safe provably fair verification using Web Crypto API.
 * Used on the /verify page so users can verify rounds client-side.
 */

async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToMove(hmacHex: string): Move {
  const int = parseInt(hmacHex.substring(0, 8), 16);
  return MOVES[int % 3];
}

function determineResult(
  violet: Move,
  magenta: Move
): { result: RoundResult; winningMove: Move | null } {
  if (violet === magenta) {
    return { result: "draw", winningMove: null };
  }

  const violetWins =
    (violet === "rock" && magenta === "scissors") ||
    (violet === "paper" && magenta === "rock") ||
    (violet === "scissors" && magenta === "paper");

  if (violetWins) {
    return { result: "violet_win", winningMove: violet };
  }

  return { result: "magenta_win", winningMove: magenta };
}

export async function generateOutcomeBrowser(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): Promise<{
  violetMove: Move;
  magentaMove: Move;
  result: RoundResult;
  winningMove: Move | null;
}> {
  const violetHmac = await hmacSha256(serverSeed, `${clientSeed}:${nonce}:0`);
  const magentaHmac = await hmacSha256(serverSeed, `${clientSeed}:${nonce}:1`);

  const violetMove = bytesToMove(violetHmac);
  const magentaMove = bytesToMove(magentaHmac);

  const { result, winningMove } = determineResult(violetMove, magentaMove);

  return { violetMove, magentaMove, result, winningMove };
}

export async function verifyRoundBrowser(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number
): Promise<{
  valid: boolean;
  hashMatches: boolean;
  outcome: {
    violetMove: Move;
    magentaMove: Move;
    result: RoundResult;
    winningMove: Move | null;
  };
}> {
  const computedHash = await sha256(serverSeed);
  const hashMatches = computedHash === serverSeedHash;
  const outcome = await generateOutcomeBrowser(serverSeed, clientSeed, nonce);

  return {
    valid: hashMatches,
    hashMatches,
    outcome,
  };
}
