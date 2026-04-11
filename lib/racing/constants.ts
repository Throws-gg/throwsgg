// ============================================
// throws.gg Horse Racing — Constants & Types
// ============================================

export const RACE_TIMING = {
  BETTING_WINDOW: 90,     // 90 seconds to bet
  CLOSED_DURATION: 15,    // 15 seconds "gates loading"
  RACE_DURATION: 20,      // 20 seconds race animation
  RESULTS_DURATION: 15,   // 15 seconds results display
  TOTAL: 180,             // 3 minutes per race cycle
} as const;

export const RACE_DISTANCES = [1000, 1200, 1600, 2000] as const;
export type RaceDistance = (typeof RACE_DISTANCES)[number];

export const GROUND_CONDITIONS = ["firm", "good", "soft", "heavy"] as const;
export type GroundCondition = (typeof GROUND_CONDITIONS)[number];

export const FIELD_SIZE = 8;
export const TOTAL_HORSES = 16;

export const BANKROLL_RACING = {
  INITIAL: 10_000,
  MAX_BET: 100,                    // Hard cap $100 per bet
  MAX_BET_RATIO: 0.01,            // 1% of bankroll
  MAX_RACE_LIABILITY_RATIO: 0.03, // 3% of bankroll per race
  // Odds caps + overround source of truth live in lib/racing/odds-engine.ts
} as const;

export type RacePhase = "betting" | "closed" | "racing" | "results";
export type RaceStatus = "betting" | "closed" | "racing" | "settled";

export interface Horse {
  id: number;
  name: string;
  slug: string;
  color: string;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  groundPreference: GroundCondition;
  careerRaces: number;
  careerWins: number;
  careerPlaces: number;
  careerShows: number;
  last5Results: { raceNumber: number; position: number }[];
  distanceRecord: Record<string, { starts: number; wins: number; places: number }>;
  groundRecord: Record<string, { starts: number; wins: number; places: number }>;
  gateRecord: Record<string, { starts: number; wins: number }>;
  speedRating: number;
  avgFinish: number;
}

export interface RaceEntry {
  id: string;
  horseId: number;
  horse: Horse;
  gatePosition: number;
  openingOdds: number;
  currentOdds: number;
  placeOdds: number;
  showOdds: number;
  trueProbability: number;
  powerScore?: number;
  finishPosition?: number;
  margin?: number;
}

export type RaceBetType = "win" | "place" | "show";

// ============================================
// Horse Identities — sprite assignments & personality
// ============================================

// Sprite sheet layout: 512x1152, 64x48 per frame
// Row 1  (y=48):  Right-facing idle, 3 frames
// Row 13 (y=624): Right-facing gallop, 5 frames

export const SPRITE = {
  FRAME_W: 64,
  FRAME_H: 48,
  SHEET_W: 512,
  SHEET_H: 1152,
  // Row Y-offsets (row index * 48)
  ROW_IDLE_RIGHT: 1 * 48,    // row 1 — right-facing idle
  ROW_GALLOP_RIGHT: 13 * 48, // row 13 — right-facing gallop
  // Frame counts per animation
  IDLE_FRAMES: 3,
  GALLOP_FRAMES: 5,
  REAR_FRAMES: 8,
} as const;

export interface HorseIdentity {
  slug: string;
  tagline: string;
  // Sprite sheet references (file numbers)
  body: number;         // 1-8 → /horses/bodies/{n}.png
  hairType: "long" | "short";
  hairColor: number;    // 1-15 → /horses/{hairType}-hair/{n}.png
  faceMarking: number;  // 0 = none, 1-8 → /horses/face-markings/{n}.png
}

// Body colours for reference:
// 1 = Palomino/Cream   5 = Brown
// 2 = Black            6 = Dark Grey/Steel
// 3 = Bay/Chestnut     7 = Light Gold/Buckskin
// 4 = Dark Bay         8 = White/Grey

// Long Hair colours (approximate):
// 1 = Black, 2 = Dark brown, 3 = Brown, 4 = Medium brown, 5 = Pink/rose
// 6 = Grey, 7 = Dark grey, 8 = Black, 9 = Warm brown, 10 = Grey-brown
// 11 = Medium, 12 = Red, 13 = Dark, 14 = Black, 15 = Brown

// Short Hair: same colour range as long hair

export const HORSE_IDENTITIES: Record<string, HorseIdentity> = {
  "thunder-edge": {
    slug: "thunder-edge",
    tagline: "Pure voltage. Handles like a dream.",
    body: 7,            // Light gold/buckskin
    hairType: "long",
    hairColor: 1,       // Black flowing mane
    faceMarking: 3,
  },
  "iron-phantom": {
    slug: "iron-phantom",
    tagline: "You won't see him coming.",
    body: 2,            // Black
    hairType: "short",
    hairColor: 7,       // Dark grey
    faceMarking: 0,     // No markings — stealth
  },
  "crown-jewel": {
    slug: "crown-jewel",
    tagline: "Born for the spotlight.",
    body: 1,            // Palomino/Cream — regal golden
    hairType: "long",
    hairColor: 4,       // Medium brown flowing mane
    faceMarking: 1,     // Face blaze
  },
  "storm-protocol": {
    slug: "storm-protocol",
    tagline: "Fastest thing on four legs. Sometimes.",
    body: 4,            // Dark bay — dark & intense
    hairType: "short",
    hairColor: 1,       // Black short mane
    faceMarking: 6,
  },
  "dark-reign": {
    slug: "dark-reign",
    tagline: "Grinds you down. Never quits.",
    body: 6,            // Dark grey/steel
    hairType: "short",
    hairColor: 8,       // Black cropped
    faceMarking: 0,     // No markings — all business
  },
  "silver-ghost": {
    slug: "silver-ghost",
    tagline: "Steady. Reliable. Boring wins races.",
    body: 8,            // White/grey
    hairType: "long",
    hairColor: 6,       // Grey mane
    faceMarking: 2,
  },
  "night-fury": {
    slug: "night-fury",
    tagline: "All gas, questionable brakes.",
    body: 2,            // Black
    hairType: "long",
    hairColor: 12,      // Red mane — black horse, red hair = wild
    faceMarking: 5,
  },
  "volt-runner": {
    slug: "volt-runner",
    tagline: "Blink and he's gone. Or he's blown up.",
    body: 8,            // White/grey — electric look
    hairType: "short",
    hairColor: 5,       // Pink/rose — stands out
    faceMarking: 4,
  },
  "rogue-wave": {
    slug: "rogue-wave",
    tagline: "Loves the mud. Built like a tank.",
    body: 5,            // Brown — tough workhorse
    hairType: "long",
    hairColor: 2,       // Dark brown
    faceMarking: 8,
  },
  "dust-devil": {
    slug: "dust-devil",
    tagline: "Wild card energy. Vibes only.",
    body: 3,            // Bay/chestnut — warm wild vibe
    hairType: "long",
    hairColor: 9,       // Warm brown
    faceMarking: 7,
  },
  "shadow-mint": {
    slug: "shadow-mint",
    tagline: "The accountant. Always in the mix.",
    body: 6,            // Dark grey/steel — understated
    hairType: "long",
    hairColor: 10,      // Grey-brown
    faceMarking: 3,
  },
  "flash-crash": {
    slug: "flash-crash",
    tagline: "Either first or last. No in-between.",
    body: 3,            // Bay/chestnut
    hairType: "short",
    hairColor: 12,      // Red — danger
    faceMarking: 1,
  },
  "paper-hands": {
    slug: "paper-hands",
    tagline: "Won't blow your mind, won't blow your bankroll.",
    body: 1,            // Palomino/cream — soft & safe
    hairType: "long",
    hairColor: 5,       // Pink/rose — gentle
    faceMarking: 2,
  },
  "rug-pull": {
    slug: "rug-pull",
    tagline: "Looks great on paper. Trust issues.",
    body: 7,            // Light gold — looks flashy
    hairType: "short",
    hairColor: 3,       // Brown
    faceMarking: 6,
  },
  "dead-cat": {
    slug: "dead-cat",
    tagline: "Written off 100 times. Still here.",
    body: 4,            // Dark bay — grizzled
    hairType: "short",
    hairColor: 6,       // Grey — weathered
    faceMarking: 0,     // Battle scarred, no frills
  },
  "moon-shot": {
    slug: "moon-shot",
    tagline: "100x or bust. Absolute degen pick.",
    body: 5,            // Brown
    hairType: "long",
    hairColor: 15,      // Brown — wild golden mane
    faceMarking: 4,
  },
};

export function getHorseIdentity(slug: string): HorseIdentity {
  return HORSE_IDENTITIES[slug] ?? {
    slug,
    tagline: "",
    body: 1,
    hairType: "long" as const,
    hairColor: 1,
    faceMarking: 0,
  };
}

export interface RaceState {
  currentRace: {
    id: string;
    raceNumber: number;
    status: RaceStatus;
    distance: RaceDistance;
    ground: GroundCondition;
    serverSeedHash: string;
    bettingOpensAt: string;
    bettingClosesAt: string;
    betCount: number;
    totalVolume: number;
    entries: RaceEntry[];
    winningHorseId?: number | null;
    commentary?: string | null;
    // Animation data — only present during racing/results
    checkpoints?: { horseId: number; positions: number[] }[];
  };
  lastRace: {
    id: string;
    raceNumber: number;
    entries: RaceEntry[];
    winningHorseId: number;
    commentary: string | null;
    serverSeed: string;
  } | null;
  recentWinners: { raceNumber: number; horseName: string; horseColor: string }[];
  timeRemaining: number;
  phase: RacePhase;
}
