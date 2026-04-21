/**
 * Email categories — users can opt out per category from /settings.
 *
 * `transactional` is always sent (deposit/withdrawal confirmations, security).
 * Everything else respects the user's preference.
 *
 * Default preferences: all true except `promotional` = false until the user
 * explicitly opts in. This keeps us clear of CAN-SPAM/CASL on day one.
 */
export type EmailCategory =
  | "transactional" // deposit/withdrawal/security — always sent
  | "lifecycle" // welcome, first deposit nudge, first bet
  | "retention" // streaks, rakeback, cashback, bonus expiring
  | "reactivation" // D7/D14/D30 winback
  | "leaderboard" // weekly leaderboard result
  | "big_win" // win > $50 share nudge
  | "responsible_gambling" // monthly high-wager check-in
  | "promotional"; // future — deposit matches, triggered offers

export const ALL_CATEGORIES: EmailCategory[] = [
  "transactional",
  "lifecycle",
  "retention",
  "reactivation",
  "leaderboard",
  "big_win",
  "responsible_gambling",
  "promotional",
];

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  transactional: "Account activity (deposits, withdrawals, security)",
  lifecycle: "Welcome & getting started",
  retention: "Streaks, rakeback, and cashback",
  reactivation: "We miss you emails",
  leaderboard: "Weekly leaderboard results",
  big_win: "Big win shoutouts",
  responsible_gambling: "Responsible gambling check-ins",
  promotional: "Promotions and special offers",
};

export const DEFAULT_PREFERENCES: Record<EmailCategory, boolean> = {
  transactional: true,
  lifecycle: true,
  retention: true,
  reactivation: true,
  leaderboard: true,
  big_win: true,
  responsible_gambling: true,
  promotional: false,
};

/**
 * Transactional never respects opt-out — regulatory requirement to confirm
 * money movement. Keep this function honest and check isTransactional first.
 */
export function isTransactional(category: EmailCategory): boolean {
  return category === "transactional";
}
