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
// Odds caps — kept wide so the book percentage lands near OVERROUND and
// longshots price honestly. A horse with true 0.5% prob needs ~170x to
// break even for the bettor; under 100x we were charging the bettor a
// structural 50%+ house edge on bombs. Liability is capped separately
// via BANKROLL_RACING.MAX_RACE_LIABILITY_RATIO so a single 200x bet on
// a $100 max stake can only expose us to $20k (2× the $10k bankroll max
// race liability — clipped in bet placement).
const MIN_WIN_ODDS = 1.30;
const MAX_WIN_ODDS = 200.00;
const MIN_PLACE_ODDS = 1.10;
const MAX_PLACE_ODDS = 40.00;
const MIN_SHOW_ODDS = 1.05;
const MAX_SHOW_ODDS = 18.00;

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
  iterations: number = 4000
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

  // Laplace smoothing per horse: (count + alpha) / (iterations + 2*alpha).
  // Treat each horse as running a Bernoulli trial per race (won/didn't,
  // placed/didn't, showed/didn't). Adding alpha=1 pseudo-observations of
  // "win" and "loss" prevents zero-win horses from being priced at the cap.
  //
  // At 4000 iterations a horse with 0 wins gets probability 1/4002 ≈ 0.025%,
  // pricing at ~345x (clamped to 100x cap). A horse with 1 win gets
  // 2/4002 ≈ 0.05%, pricing at ~173x (still clamped). Only horses with
  // more than ~5 wins in the sim break away from the cap.
  const alpha = 1;
  const denom = iterations + 2 * alpha;

  for (const h of horses) {
    const winProb = ((winCounts.get(h.id) || 0) + alpha) / denom;
    const placeProb = ((placeCounts.get(h.id) || 0) + alpha) / denom;
    const showProb = ((showCounts.get(h.id) || 0) + alpha) / denom;

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
