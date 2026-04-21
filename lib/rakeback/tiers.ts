/**
 * Rakeback tier ladder — mirrors the SQL function `rakeback_tier` in
 * migration 028. Keep these in sync. If you change tier thresholds or %
 * here, update the SQL too (and vice versa).
 *
 * Edge rate is pulled from OVERROUND in lib/racing/odds-engine.ts. Current
 * value: 1.10 → 9.09% edge. If overround changes, EDGE_RATE here and the
 * constant in accrue_rakeback() must both change.
 */

export const EDGE_RATE = 0.0909; // matches OVERROUND = 1.10

export type RakebackTier =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond";

export interface TierInfo {
  tier: RakebackTier;
  label: string;
  tierPct: number;        // fraction of edge (e.g. 0.05 for Bronze = 5% of edge)
  effectivePct: number;   // tierPct * EDGE_RATE — headline "% of wager"
  minWagered: number;     // lifetime wager threshold to reach this tier
  nextTierAt: number | null;
}

const LADDER: TierInfo[] = [
  {
    tier: "bronze",
    label: "Bronze",
    tierPct: 0.05,
    effectivePct: 0.05 * EDGE_RATE,
    minWagered: 0,
    nextTierAt: 500,
  },
  {
    tier: "silver",
    label: "Silver",
    tierPct: 0.10,
    effectivePct: 0.10 * EDGE_RATE,
    minWagered: 500,
    nextTierAt: 5000,
  },
  {
    tier: "gold",
    label: "Gold",
    tierPct: 0.15,
    effectivePct: 0.15 * EDGE_RATE,
    minWagered: 5000,
    nextTierAt: 25000,
  },
  {
    tier: "platinum",
    label: "Platinum",
    tierPct: 0.20,
    effectivePct: 0.20 * EDGE_RATE,
    minWagered: 25000,
    nextTierAt: 100000,
  },
  {
    tier: "diamond",
    label: "Diamond",
    tierPct: 0.25,
    effectivePct: 0.25 * EDGE_RATE,
    minWagered: 100000,
    nextTierAt: null,
  },
];

/**
 * Resolve a lifetime wagered amount to its current rakeback tier.
 */
export function getRakebackTier(totalWagered: number): TierInfo {
  for (let i = LADDER.length - 1; i >= 0; i--) {
    if (totalWagered >= LADDER[i].minWagered) {
      return LADDER[i];
    }
  }
  return LADDER[0];
}

/**
 * Next tier info for the UI progress bar. Returns null if already at top tier.
 */
export function getNextRakebackTier(totalWagered: number): TierInfo | null {
  const current = getRakebackTier(totalWagered);
  const idx = LADDER.findIndex((t) => t.tier === current.tier);
  return LADDER[idx + 1] ?? null;
}

export function getAllRakebackTiers(): TierInfo[] {
  return LADDER.slice();
}
