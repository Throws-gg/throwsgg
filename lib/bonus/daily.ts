// Daily login bonus — tier ladder.
// SQL (migration 027, `daily_bonus_tier()`) is source of truth.
// Keep this table in sync if SQL changes.
//
// Same ladder as rakeback (Phase 1 in CLAUDE.md): one progression layer
// across all retention mechanics so users feel a single VIP journey.

export type DailyBonusTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface DailyBonusTierSpec {
  tier: DailyBonusTier;
  label: string;
  minWagered: number;
  amountUsd: number;
}

export const DAILY_BONUS_TIERS: DailyBonusTierSpec[] = [
  { tier: "diamond",  label: "Diamond",  minWagered: 100_000, amountUsd: 1.00 },
  { tier: "platinum", label: "Platinum", minWagered: 25_000,  amountUsd: 0.50 },
  { tier: "gold",     label: "Gold",     minWagered: 5_000,   amountUsd: 0.35 },
  { tier: "silver",   label: "Silver",   minWagered: 500,     amountUsd: 0.20 },
  { tier: "bronze",   label: "Bronze",   minWagered: 0,       amountUsd: 0.10 },
];

export const DAILY_BONUS_MIN_DEPOSIT_USD = 5;
export const DAILY_BONUS_WAGERING_MULTIPLIER = 1;

export function getDailyBonusTier(totalWagered: number): DailyBonusTierSpec {
  for (const spec of DAILY_BONUS_TIERS) {
    if (totalWagered >= spec.minWagered) return spec;
  }
  return DAILY_BONUS_TIERS[DAILY_BONUS_TIERS.length - 1];
}

export function getNextDailyBonusTier(
  totalWagered: number,
): DailyBonusTierSpec | null {
  // DAILY_BONUS_TIERS is sorted high → low. Walk bottom-up to find the
  // next tier above the user's current wagered.
  const ascending = [...DAILY_BONUS_TIERS].reverse();
  for (const spec of ascending) {
    if (spec.minWagered > totalWagered) return spec;
  }
  return null; // already diamond
}
