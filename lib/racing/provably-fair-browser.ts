/**
 * Browser-side provably-fair verification for horse races.
 *
 * Mirrors the server simulation in lib/racing/simulation.ts but uses the
 * Web Crypto API instead of Node's `crypto` module. Users can independently
 * re-run the exact same deterministic computation from the revealed server
 * seed and confirm the finish order the server published.
 */

import type { GroundCondition, RaceDistance } from "./constants";

// ======= Web Crypto primitives =======

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * HMAC_SHA256(key, message) returning hex — matches Node's createHmac output.
 */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * SHA-256(input) returning hex — used to verify the server-seed hash.
 */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

// ======= Deterministic helpers =======

function hmacToFloat(hmacHex: string): number {
  const int = parseInt(hmacHex.substring(0, 8), 16);
  return int / 0x100000000;
}

function uniformToGaussian(u1: number, u2: number): number {
  const safe1 = Math.max(0.0001, Math.min(0.9999, u1));
  const safe2 = Math.max(0.0001, Math.min(0.9999, u2));
  return Math.sqrt(-2 * Math.log(safe1)) * Math.cos(2 * Math.PI * safe2);
}

const GROUND_ORDER: GroundCondition[] = ["firm", "good", "soft", "heavy"];

function groundStepsBetween(
  pref: GroundCondition,
  actual: GroundCondition
): number {
  return Math.abs(GROUND_ORDER.indexOf(pref) - GROUND_ORDER.indexOf(actual));
}

// ======= Simulation (mirrors server simulateRace) =======

export interface VerifyHorse {
  id: number;
  name: string;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  groundPreference: GroundCondition;
}

export interface VerifyFinish {
  horseId: number;
  horseName: string;
  finishPosition: number;
  powerScore: number;
}

/**
 * Re-simulate a race deterministically from the revealed server seed.
 * Returns the computed finish order — caller compares against on-chain result.
 */
export async function verifyRaceOutcome(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  horses: VerifyHorse[],
  distance: RaceDistance,
  ground: GroundCondition
): Promise<VerifyFinish[]> {
  const scores: { horseId: number; horseName: string; powerScore: number }[] = [];

  for (let i = 0; i < horses.length; i++) {
    const horse = horses[i];

    const hmac1 = await hmacSha256Hex(
      serverSeed,
      `${clientSeed}:${nonce}:horse:${i}:0`
    );
    const hmac2 = await hmacSha256Hex(
      serverSeed,
      `${clientSeed}:${nonce}:horse:${i}:1`
    );

    const rand1 = hmacToFloat(hmac1);
    const rand2 = hmacToFloat(hmac2);

    // Distance factor — identical to server
    let distanceFactor = 1.0;
    if (distance <= 1200) {
      distanceFactor = 1.0 + (horse.speed - horse.stamina) * 0.003;
    } else if (distance >= 1600) {
      distanceFactor = 1.0 + (horse.stamina - horse.speed) * 0.003;
    }

    // Ground factor
    const steps = groundStepsBetween(horse.groundPreference, ground);
    let groundFactor = 1.0;
    if (steps === 0) groundFactor = 1.05;
    else if (steps === 1) groundFactor = 1.0;
    else if (steps === 2) groundFactor = 0.92;
    else groundFactor = 0.85;

    // Form factor
    const formFactor = 0.9 + (horse.form / 100) * 0.2;

    // Base power — sqrt compression
    const compressedSpeed = Math.sqrt(horse.speed) * 10;
    const basePower = compressedSpeed * distanceFactor * groundFactor * formFactor;

    // Noise
    const noiseFloor = 14;
    const noiseRange = 16;
    const noiseStdDev = noiseFloor + noiseRange * (1 - horse.consistency / 100);
    const gaussian = uniformToGaussian(rand1, rand2);
    const noise = gaussian * noiseStdDev;

    const powerScore = basePower + noise;
    scores.push({ horseId: horse.id, horseName: horse.name, powerScore });
  }

  scores.sort((a, b) => b.powerScore - a.powerScore);

  return scores.map((s, i) => ({
    horseId: s.horseId,
    horseName: s.horseName,
    finishPosition: i + 1,
    powerScore: Math.round(s.powerScore * 100) / 100,
  }));
}

/**
 * Verify the revealed server seed hashes to the committed hash.
 */
export async function verifyServerSeedHash(
  serverSeed: string,
  expectedHash: string
): Promise<boolean> {
  const actual = await sha256Hex(serverSeed);
  return actual.toLowerCase() === expectedHash.toLowerCase();
}
