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
  probability: number;    // True win probability
  winOdds: number;        // Decimal odds for win
  placeOdds: number;      // Decimal odds for place (top 2)
  showOdds: number;       // Decimal odds for show (top 3)
}

export const OVERROUND = 1.156;  // 115.6% — ~13.5% house edge, early-stage safety margin
// Actual house edge: (OVERROUND - 1) / OVERROUND ≈ 0.1349 (13.49%)
// Target range: 12-15% while we're building up the bankroll. Real bookmakers
// typically sit at 10-15% so this is firmly in range.
export const HOUSE_EDGE = (OVERROUND - 1) / OVERROUND;
const MIN_WIN_ODDS = 1.30;
const MAX_WIN_ODDS = 40.00;
const MIN_PLACE_ODDS = 1.10;
const MAX_PLACE_ODDS = 15.00;
const MIN_SHOW_ODDS = 1.05;
const MAX_SHOW_ODDS = 6.00;

/**
 * Monte Carlo odds — runs the simulation 1500 times to estimate
 * win, place (top 2), and show (top 3) probabilities for each horse.
 * Applies overround to all three bet types.
 */
export function calculateOddsMonteCarlo(
  horses: HorseForOdds[],
  distance: RaceDistance,
  ground: GroundCondition,
  baseSeed: string = "odds-calc",
  iterations: number = 1500
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

    const result = simulateRace(iterSeed, "throws.gg", i, horses, distance, ground);

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

  for (const h of horses) {
    const winProb = Math.max((winCounts.get(h.id) || 0) / iterations, 0.005);
    const placeProb = Math.max((placeCounts.get(h.id) || 0) / iterations, 0.01);
    const showProb = Math.max((showCounts.get(h.id) || 0) / iterations, 0.02);

    // Apply overround to each
    let winOdds = 1 / (winProb * OVERROUND);
    let placeOdds = 1 / (placeProb * OVERROUND);
    let showOdds = 1 / (showProb * OVERROUND);

    // Clamp
    winOdds = Math.max(MIN_WIN_ODDS, Math.min(MAX_WIN_ODDS, Math.round(winOdds * 100) / 100));
    placeOdds = Math.max(MIN_PLACE_ODDS, Math.min(MAX_PLACE_ODDS, Math.round(placeOdds * 100) / 100));
    showOdds = Math.max(MIN_SHOW_ODDS, Math.min(MAX_SHOW_ODDS, Math.round(showOdds * 100) / 100));

    // Ensure odds hierarchy: win > place > show
    if (placeOdds >= winOdds) placeOdds = Math.round((winOdds * 0.55) * 100) / 100;
    if (showOdds >= placeOdds) showOdds = Math.round((placeOdds * 0.65) * 100) / 100;

    result.set(h.id, { probability: winProb, winOdds, placeOdds, showOdds });
  }

  return result;
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
