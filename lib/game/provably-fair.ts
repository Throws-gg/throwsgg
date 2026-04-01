import { createHmac, createHash, randomBytes } from "crypto";
import type { Move, RoundResult } from "./constants";

const MOVES: Move[] = ["rock", "paper", "scissors"];

/**
 * Generate a cryptographically random server seed (32 bytes hex).
 * Server-side only.
 */
export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

/**
 * SHA-256 hash of the server seed.
 * Shown to players during the betting phase so they can verify later.
 */
export function hashServerSeed(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Derive a move from an HMAC result.
 * Takes bytes 0-3 of the HMAC, converts to a uint32, mods by 3.
 */
function bytesToMove(hmacHex: string): Move {
  const int = parseInt(hmacHex.substring(0, 8), 16);
  return MOVES[int % 3];
}

/**
 * Generate the full outcome for a round.
 * Deterministic given the same inputs — this is what makes it provably fair.
 *
 * violet_move = HMAC_SHA256(serverSeed, "clientSeed:nonce:0") → mod 3
 * magenta_move = HMAC_SHA256(serverSeed, "clientSeed:nonce:1") → mod 3
 */
export function generateOutcome(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): {
  violetMove: Move;
  magentaMove: Move;
  result: RoundResult;
  winningMove: Move | null;
} {
  const violetHmac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:0`)
    .digest("hex");

  const magentaHmac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:1`)
    .digest("hex");

  const violetMove = bytesToMove(violetHmac);
  const magentaMove = bytesToMove(magentaHmac);

  const { result, winningMove } = determineResult(violetMove, magentaMove);

  return { violetMove, magentaMove, result, winningMove };
}

/**
 * Determine the result of a round given two moves.
 */
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

/**
 * Verify a round's outcome.
 * Can run client-side (verification page) or server-side.
 *
 * 1. Hash the server seed → must match the hash shown during betting
 * 2. Regenerate the outcome → must match what was displayed
 */
export function verifyRound(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: number
): {
  valid: boolean;
  hashMatches: boolean;
  outcome: ReturnType<typeof generateOutcome>;
} {
  const computedHash = hashServerSeed(serverSeed);
  const hashMatches = computedHash === serverSeedHash;
  const outcome = generateOutcome(serverSeed, clientSeed, nonce);

  return {
    valid: hashMatches,
    hashMatches,
    outcome,
  };
}
