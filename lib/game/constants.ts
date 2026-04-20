export const CLIENT_SEED_DEFAULT = "throws.gg";

// All bets push on draw (refund). This makes the effective odds:
// Move bets: win 1/3, lose 2/3 (ignoring draws). 2.91x → 3% house edge.
// Player bets: win 1/2, lose 1/2 (ignoring draws). 1.94x → 3% house edge.
// Draw bet: wins 1/3 of the time. 2.91x → 3% house edge.
export const PAYOUTS = {
  rock: 2.91,
  paper: 2.91,
  scissors: 2.91,
  draw: 2.91,
  violet: 1.94, // Bull
  magenta: 1.94, // Bear
} as const;

// Display names for the two players
// DB uses violet/magenta internally, UI shows Bull/Bear
export const PLAYER_NAMES = {
  violet: "Bull",
  magenta: "Bear",
} as const;

export const MOVE_ICONS = {
  rock: "/icons/rock.png",
  paper: "/icons/paper.png",
  scissors: "/icons/scissors.png",
  draw: "/icons/draw.png",
  rock96: "/icons/rock-96.png",
  paper96: "/icons/paper-96.png",
  scissors96: "/icons/scissors-96.png",
  draw96: "/icons/draw-96.png",
  rock64: "/icons/rock-64.png",
  paper64: "/icons/paper-64.png",
  scissors64: "/icons/scissors-64.png",
  draw64: "/icons/draw-64.png",
} as const;

export const PLAYER_IMAGES = {
  violet: "/characters/bull.png",
  magenta: "/characters/bear.png",
  violet128: "/characters/bull-128.png",
  magenta128: "/characters/bear-128.png",
  violet64: "/characters/bull-64.png",
  magenta64: "/characters/bear-64.png",
} as const;

export const TIMING = {
  ROUND_DURATION: 60,
  BETTING_WINDOW: 15,
  COUNTDOWN_DURATION: 5,
  BATTLE_DURATION: 3,
  RESULTS_DURATION: 7,
} as const;

export const LIMITS = {
  MIN_BET: 0.1,
  MIN_DEPOSIT: 1.0,
  MIN_WITHDRAWAL: 5.0,
  MAX_WEEKLY_WITHDRAWAL: 2000,
} as const;

export const BANKROLL = {
  INITIAL: 50_000,
  MAX_BET: 100, // Hard cap per bet type
  MAX_BET_RATIO: 0.005,
  MAX_EXPOSURE_RATIO: 0.01,
  getMaxBet: (bankroll: number) => Math.floor(bankroll * 0.005),
  getMaxExposure: (bankroll: number) => Math.floor(bankroll * 0.01),
} as const;

export const WITHDRAWAL_FEES: Record<string, number> = {
  USDC: 0.5,
  SOL: 0.01,
  ETH: 1.0,
};

export type BetType = keyof typeof PAYOUTS;
export type BetCategory = "move" | "player";
export type Move = "rock" | "paper" | "scissors";
export type RoundResult = "violet_win" | "magenta_win" | "draw";
export type RoundPhase = "betting" | "countdown" | "battle" | "results";
export type RoundStatus = "betting" | "locked" | "playing" | "settled";

export interface GameState {
  currentRound: {
    id: string;
    roundNumber: number;
    status: RoundStatus;
    serverSeedHash: string;
    bettingOpensAt: string;
    bettingClosesAt: string;
    betCount: number;
    totalVolume: number;
    // Populated once round is played/settled
    violetMove?: Move | null;
    magentaMove?: Move | null;
    result?: RoundResult | null;
    winningMove?: Move | null;
  };
  lastRound: {
    id: string;
    roundNumber: number;
    violetMove: Move;
    magentaMove: Move;
    result: RoundResult;
    winningMove: Move | null;
    serverSeed: string;
  } | null;
  recentResults: { result: RoundResult; winningMove: Move | null }[];
  roundWinners: {
    winnerCount: number;
    totalPayout: number;
  } | null;
  timeRemaining: number;
  phase: RoundPhase;
  onlineCount: number;
}
