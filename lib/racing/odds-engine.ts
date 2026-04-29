import { createHmac } from "crypto";
import { simulateRace } from "./simulation";
import { BANKROLL_RACING } from "./constants";
import type { GroundCondition, RaceDistance } from "./constants";

interface HorseForOdds {
  id: number;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  groundPreference: GroundCondition;
}

export interface FullOdds {
  probability: number;       // True win probability
  placeProbability: number;  // True place probability (top 2)
  showProbability: number;   // True show probability (top 3)
  winOdds: number;           // Decimal odds for win
  placeOdds: number;         // Decimal odds for place (top 2)
  showOdds: number;          // Decimal odds for show (top 3)
}

export const OVERROUND = 1.10;  // 110% — ~9.09% house edge
// Actual house edge: (OVERROUND - 1) / OVERROUND ≈ 0.0909 (9.09%)
// Sits inside the established virtual-sports category band (8–15% —
// Inspired, Coral, Kiron). Chosen over a 3–4% edge because a $10K
// bankroll on 480 races/day needs variance headroom: at 4% the 1%-tail
// 1-day drawdown was ~$3.15K (31% of bankroll). At ~9% the same tail
// cuts roughly in half. Users can verify the math on the /verify page —
// we don't hide the overround, we just don't headline it. Aim is to
// lower this over time as bankroll + handle grow.
export const HOUSE_EDGE = (OVERROUND - 1) / OVERROUND;
export const MAX_SUPPORTED_ODDS = BANKROLL_RACING.MAX_RACE_LIABILITY / BANKROLL_RACING.MIN_BET;

export const ODDS_LIMITS = {
  WIN_MIN: 1.01,
  WIN_MAX: MAX_SUPPORTED_ODDS,
  PLACE_MIN: 1.01,
  PLACE_MAX: MAX_SUPPORTED_ODDS,
  SHOW_MIN: 1.01,
  SHOW_MAX: MAX_SUPPORTED_ODDS,
} as const;

/**
 * Monte Carlo odds — runs the simulation N times to estimate win, place
 * (top 2), and show (top 3) probabilities for each horse.
 *
 * Pricing is deliberately per horse:
 *   decimal_odds = 1 / (empirical_probability * overround)
 *
 * The wide max caps are not the source of edge; they only bound impossible
 * tail prices for launch-bankroll liability. Any horse below the cap gets the
 * same target margin as every other horse.
 *
 * Iterations: 25,000 is enough to nail down rare-event probabilities at
 * the longshot tail. With fewer iterations a horse that truly wins ~1%
 * of the time gets a measured probability that swings widely from
 * sampling noise, which translates to ~10× swings in the priced odds
 * for the same horse. 25k cuts that sampling SD to ~0.06pp and the
 * longshot tail prices honestly. Per-race compute is <300ms — fine for
 * the once-per-3-min pricing cadence.
 */
export function calculateOddsMonteCarlo(
  horses: HorseForOdds[],
  distance: RaceDistance,
  ground: GroundCondition,
  baseSeed: string = "odds-calc",
  iterations: number = 25_000
): Map<number, FullOdds> {
  const winCounts = new Map<number, number>();
  const placeCounts = new Map<number, number>();  // Top 2
  const showCounts = new Map<number, number>();   // Top 3

  for (const h of horses) {
    winCounts.set(h.id, 0);
    placeCounts.set(h.id, 0);
    showCounts.set(h.id, 0);
  }

  for (let i = 0; i < iterations; i++) {
    const iterSeed = createHmac("sha256", baseSeed)
      .update(`mc-odds:${i}`)
      .digest("hex");

    // Pricing only needs finish order — skip the 20×8 checkpoint HMACs.
    const result = simulateRace(iterSeed, "throws.gg", i, horses, distance, ground, false);

    // Count win, place, show for each horse
    for (const finish of result.finishOrder) {
      if (finish.finishPosition === 1) {
        winCounts.set(finish.horseId, (winCounts.get(finish.horseId) || 0) + 1);
      }
      if (finish.finishPosition <= 2) {
        placeCounts.set(finish.horseId, (placeCounts.get(finish.horseId) || 0) + 1);
      }
      if (finish.finishPosition <= 3) {
        showCounts.set(finish.horseId, (showCounts.get(finish.horseId) || 0) + 1);
      }
    }
  }

  const result = new Map<number, FullOdds>();

  const EPS = 1 / (iterations * 4); // = 0.001% at 25k iters

  for (const h of horses) {
    const winProb = Math.max(EPS, (winCounts.get(h.id) || 0) / iterations);
    const placeProb = Math.max(EPS, (placeCounts.get(h.id) || 0) / iterations);
    const showProb = Math.max(EPS, (showCounts.get(h.id) || 0) / iterations);

    result.set(h.id, {
      probability: winProb,
      placeProbability: placeProb,
      showProbability: showProb,
      winOdds: priceProbability(winProb, ODDS_LIMITS.WIN_MIN, ODDS_LIMITS.WIN_MAX),
      placeOdds: priceProbability(placeProb, ODDS_LIMITS.PLACE_MIN, ODDS_LIMITS.PLACE_MAX),
      showOdds: priceProbability(showProb, ODDS_LIMITS.SHOW_MIN, ODDS_LIMITS.SHOW_MAX),
    });
  }

  return result;
}

function priceProbability(probability: number, minOdds: number, maxOdds: number): number {
  return round2(clamp(1 / (probability * OVERROUND), minOdds, maxOdds));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Shorten odds for a specific horse based on current liability.
 */
export function shortenOdds(
  currentOdds: number,
  liabilityOnHorse: number,
  maxLiability: number
): number {
  const liabilityRatio = liabilityOnHorse / maxLiability;
  if (liabilityRatio < 0.5) return currentOdds;

  const shortenFactor = 1 - (liabilityRatio - 0.5) * 0.5;
  const newOdds = Math.max(1.05, currentOdds * shortenFactor);
  return Math.round(newOdds * 100) / 100;
}
