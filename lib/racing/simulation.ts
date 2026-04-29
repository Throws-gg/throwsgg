import { createHmac } from "crypto";
import type { GroundCondition, RaceDistance } from "./constants";

interface HorseStats {
  id: number;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  groundPreference: GroundCondition;
}

interface SimulationResult {
  finishOrder: {
    horseId: number;
    finishPosition: number;
    powerScore: number;
    margin: number;
  }[];
  // Animation checkpoints: 10 points in time showing relative positions (0-100%)
  // Used by the frontend to animate horses changing positions during the race
  checkpoints: {
    horseId: number;
    positions: number[]; // 10 values from 0% to ~100%
  }[];
}

const GROUND_ORDER: GroundCondition[] = ["firm", "good", "soft", "heavy"];

function groundStepsBetween(pref: GroundCondition, actual: GroundCondition): number {
  const prefIdx = GROUND_ORDER.indexOf(pref);
  const actualIdx = GROUND_ORDER.indexOf(actual);
  return Math.abs(prefIdx - actualIdx);
}

/**
 * Extract a deterministic random float [0, 1) from an HMAC hex string.
 */
function hmacToFloat(hmacHex: string): number {
  const int = parseInt(hmacHex.substring(0, 8), 16);
  return int / 0x100000000;
}

/**
 * Convert a uniform random [0,1) to a gaussian-ish value using Box-Muller.
 * Uses two HMAC values for the two uniform inputs.
 */
function uniformToGaussian(u1: number, u2: number): number {
  // Clamp to avoid log(0)
  const safe1 = Math.max(0.0001, Math.min(0.9999, u1));
  const safe2 = Math.max(0.0001, Math.min(0.9999, u2));
  return Math.sqrt(-2 * Math.log(safe1)) * Math.cos(2 * Math.PI * safe2);
}

/**
 * Simulate a race. Deterministic given the same inputs.
 *
 * For each horse, computes a power score based on:
 * - Base power from stats (speed, stamina, form, consistency weighted)
 * - Distance factor (speed vs stamina preference)
 * - Ground factor (bonus/penalty based on preference match)
 * - Random noise (gaussian, scaled by consistency — low consistency = high variance)
 *
 * All randomness derived from HMAC_SHA256(serverSeed, clientSeed:nonce:horse:index)
 */
export function simulateRace(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  horses: HorseStats[],
  distance: RaceDistance,
  ground: GroundCondition,
  // When only finish order is needed (Monte Carlo for odds pricing), skip
  // animation checkpoint generation. Each checkpoint costs an HMAC, and at
  // 20 checkpoints × 8 horses × 4,000 MC iterations that's ~640k extra HMACs
  // per priced race that get discarded. Pricing-only callers should pass false.
  generateCheckpoints: boolean = true,
): SimulationResult {
  const scores: { horseId: number; powerScore: number }[] = [];

  for (let i = 0; i < horses.length; i++) {
    const horse = horses[i];

    // Generate random values from HMAC
    const hmac1 = createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}:horse:${i}:0`)
      .digest("hex");
    const hmac2 = createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}:horse:${i}:1`)
      .digest("hex");

    const rand1 = hmacToFloat(hmac1);
    const rand2 = hmacToFloat(hmac2);

    // --- Distance factor ---
    // Short races favor speed, long races favor stamina
    let distanceFactor = 1.0;
    if (distance <= 1200) {
      distanceFactor = 1.0 + (horse.speed - horse.stamina) * 0.003;
    } else if (distance >= 1600) {
      distanceFactor = 1.0 + (horse.stamina - horse.speed) * 0.003;
    }

    // --- Ground factor ---
    // Match = +5%, one step off = neutral, two+ steps off = penalty
    const steps = groundStepsBetween(horse.groundPreference, ground);
    let groundFactor = 1.0;
    if (steps === 0) groundFactor = 1.05;
    else if (steps === 1) groundFactor = 1.0;
    else if (steps === 2) groundFactor = 0.92;
    else groundFactor = 0.85;

    // --- Form factor ---
    // Form 1-100 maps to 0.9-1.1
    const formFactor = 0.9 + (horse.form / 100) * 0.2;

    // --- Base power ---
    // Compress the range: use sqrt to bring stats closer together
    // A horse with 90 speed vs 70 speed: sqrt gives 9.49 vs 8.37 — much closer
    const compressedSpeed = Math.sqrt(horse.speed) * 10;
    const basePower = compressedSpeed * distanceFactor * groundFactor * formFactor;

    // --- Random noise ---
    // High noise creates competitive races with regular upsets
    // Target: favourite wins ~30-33% (like real racing)
    const noiseFloor = 14; // Everyone gets significant noise
    const noiseRange = 16; // Additional noise for inconsistent horses
    const noiseStdDev = noiseFloor + noiseRange * (1 - horse.consistency / 100);
    const gaussian = uniformToGaussian(rand1, rand2);
    const noise = gaussian * noiseStdDev;

    const powerScore = basePower + noise;

    scores.push({ horseId: horse.id, powerScore });
  }

  // Sort by power score descending (highest wins)
  scores.sort((a, b) => b.powerScore - a.powerScore);

  const winnerScore = scores[0].powerScore;

  const finishOrder = scores.map((s, i) => ({
    horseId: s.horseId,
    finishPosition: i + 1,
    powerScore: Math.round(s.powerScore * 100) / 100,
    margin: i === 0 ? 0 : Math.round((winnerScore - s.powerScore) * 0.3 * 100) / 100,
  }));

  // Pricing-only path skips checkpoints — same finish order, ~99% less compute.
  if (!generateCheckpoints) {
    return { finishOrder, checkpoints: [] };
  }

  // Generate animation checkpoints (20 points for smoother animation)
  // Each horse has a progress curve from 0 to ~100 showing position changes
  const NUM_CHECKPOINTS = 20;
  const checkpoints = scores.map((s, finalIdx) => {
    const positions: number[] = [0]; // Start at 0%

    // Final progress: winner at 100, last at ~79
    const finalProgress = 100 - finalIdx * 3;

    for (let cp = 1; cp < NUM_CHECKPOINTS - 1; cp++) {
      const baseProgress = (cp / (NUM_CHECKPOINTS - 1)) * finalProgress;

      // Generate variation using HMAC
      const cpHmac = createHmac("sha256", serverSeed)
        .update(`${clientSeed}:${nonce}:checkpoint:${s.horseId}:${cp}`)
        .digest("hex");
      const cpRand = parseInt(cpHmac.substring(0, 8), 16) / 0x100000000;
      const cpRand2 = parseInt(cpHmac.substring(8, 16), 16) / 0x100000000;

      // Position variation — creates overtaking mid-race but converges to finish order
      const horse = horses.find(h => h.id === s.horseId);
      const consistencyFactor = horse ? (1 - horse.consistency / 100) : 0.5;

      const raceProgress = cp / (NUM_CHECKPOINTS - 1);

      // Variation peaks at 30-60% of race, then fades strongly toward the finish
      // By 80% of the race, horses are mostly in their final positions
      const variationCurve = raceProgress < 0.3
        ? raceProgress / 0.3 // ramp up
        : raceProgress < 0.6
          ? 1.0 // full variation
          : Math.max(0, 1.0 - (raceProgress - 0.6) / 0.25); // fade out by 85%

      const swingAmount = (6 + consistencyFactor * 10) * variationCurve;
      const swing = (cpRand - 0.5) * swingAmount;

      // Small burst only in the first 70% of the race
      const burst = (raceProgress < 0.7 && cpRand2 > 0.88) ? (cpRand - 0.3) * 5 : 0;

      positions.push(Math.max(1, Math.min(98, baseProgress + swing + burst)));
    }

    positions.push(finalProgress); // Lock in final position
    return { horseId: s.horseId, positions };
  });

  return { finishOrder, checkpoints };
}

/**
 * Select 8 horses from 16 deterministically using the server seed.
 * Also selects distance and ground condition.
 */
export function selectRaceField(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  allHorseIds: number[]
): { selectedIds: number[]; distance: RaceDistance; ground: GroundCondition } {
  // Generate selection HMAC
  const hmac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}:selection`)
    .digest("hex");

  // Fisher-Yates shuffle using HMAC bytes for randomness
  const shuffled = [...allHorseIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const byteOffset = (i * 2) % (hmac.length - 2);
    const randByte = parseInt(hmac.substring(byteOffset, byteOffset + 2), 16);
    const j = randByte % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selectedIds = shuffled.slice(0, 8);

  // Distance from HMAC
  const DISTANCES: RaceDistance[] = [1000, 1200, 1600, 2000];
  const distIdx = parseInt(hmac.substring(48, 50), 16) % DISTANCES.length;
  const distance = DISTANCES[distIdx];

  // Ground condition from HMAC
  const GROUNDS: GroundCondition[] = ["firm", "good", "soft", "heavy"];
  const groundIdx = parseInt(hmac.substring(50, 52), 16) % GROUNDS.length;
  const ground = GROUNDS[groundIdx];

  return { selectedIds, distance, ground };
}
