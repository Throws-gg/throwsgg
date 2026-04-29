/**
 * sim-racing-strategies.ts
 *
 * Strategy-level simulation for the production horse-racing odds engine.
 *
 * For each synthetic race, this prices the field with calculateOddsMonteCarlo(),
 * runs the actual race with simulateRace(), then applies common bettor
 * strategies using a fixed intended stake capped by production bet/liability
 * limits.
 *
 * Run:
 *   npx tsx scripts/sim-racing-strategies.ts [raceCount=10000] [mcIterations=4000] [stake=1]
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { createHmac, randomBytes } from "crypto";
import { BANKROLL_RACING } from "../lib/racing/constants";
import type { GroundCondition, RaceDistance } from "../lib/racing/constants";
import { calculateOddsMonteCarlo, OVERROUND } from "../lib/racing/odds-engine";
import type { FullOdds } from "../lib/racing/odds-engine";
import { selectRaceField, simulateRace } from "../lib/racing/simulation";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY);

type BetType = "win" | "place" | "show";

interface HorseRow {
  id: number;
  name: string;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  ground_preference: GroundCondition;
}

interface HorseStats {
  id: number;
  name: string;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  groundPreference: GroundCondition;
}

interface RaceContext {
  field: HorseStats[];
  oddsMap: Map<number, FullOdds>;
  finishPositionByHorse: Map<number, number>;
  distance: RaceDistance;
  ground: GroundCondition;
}

interface Strategy {
  key: string;
  label: string;
  betType: BetType;
  pick: (ctx: RaceContext) => HorseStats[];
}

interface StrategyStats {
  opportunities: number;
  bets: number;
  wins: number;
  skippedBelowMin: number;
  cappedBets: number;
  totalIntendedStake: number;
  totalStaked: number;
  totalReturned: number;
  totalModelReturned: number;
  oddsStakeWeighted: number;
}

function floorCents(n: number): number {
  return Math.floor(Math.max(0, n) * 100) / 100;
}

function pricedFor(odds: FullOdds, betType: BetType): { odds: number; probability: number } {
  if (betType === "place") {
    return { odds: odds.placeOdds, probability: odds.placeProbability };
  }
  if (betType === "show") {
    return { odds: odds.showOdds, probability: odds.showProbability };
  }
  return { odds: odds.winOdds, probability: odds.probability };
}

function hasWon(finishPosition: number, betType: BetType): boolean {
  if (betType === "place") return finishPosition <= 2;
  if (betType === "show") return finishPosition <= 3;
  return finishPosition === 1;
}

function byWinOdds(ctx: RaceContext): HorseStats[] {
  return [...ctx.field].sort((a, b) => ctx.oddsMap.get(a.id)!.winOdds - ctx.oddsMap.get(b.id)!.winOdds);
}

function byStat(stat: "speed" | "stamina" | "form" | "consistency") {
  return (ctx: RaceContext) => [...ctx.field].sort((a, b) => b[stat] - a[stat]);
}

function allWithWinOdds(min: number, max = Infinity) {
  return (ctx: RaceContext) =>
    ctx.field.filter((h) => {
      const odds = ctx.oddsMap.get(h.id)!.winOdds;
      return odds >= min && odds < max;
    });
}

const STRATEGIES: Strategy[] = [
  { key: "win_all", label: "Win: all runners", betType: "win", pick: (ctx) => ctx.field },
  { key: "place_all", label: "Place: all runners", betType: "place", pick: (ctx) => ctx.field },
  { key: "show_all", label: "Show: all runners", betType: "show", pick: (ctx) => ctx.field },

  { key: "win_fav", label: "Win: favourite", betType: "win", pick: (ctx) => byWinOdds(ctx).slice(0, 1) },
  { key: "win_second", label: "Win: 2nd favourite", betType: "win", pick: (ctx) => byWinOdds(ctx).slice(1, 2) },
  { key: "win_third", label: "Win: 3rd favourite", betType: "win", pick: (ctx) => byWinOdds(ctx).slice(2, 3) },
  { key: "win_midpack", label: "Win: 4th favourite", betType: "win", pick: (ctx) => byWinOdds(ctx).slice(3, 4) },
  { key: "win_longest", label: "Win: longest odds", betType: "win", pick: (ctx) => byWinOdds(ctx).slice(-1) },

  { key: "win_15_plus", label: "Win: all 15x+", betType: "win", pick: allWithWinOdds(15) },
  { key: "win_30_plus", label: "Win: all 30x+", betType: "win", pick: allWithWinOdds(30) },
  { key: "win_100_plus", label: "Win: all 100x+", betType: "win", pick: allWithWinOdds(100) },
  { key: "win_1000_plus", label: "Win: all 1000x+", betType: "win", pick: allWithWinOdds(1000) },
  { key: "win_15_to_100", label: "Win: 15x-100x", betType: "win", pick: allWithWinOdds(15, 100) },

  { key: "win_speed", label: "Win: highest speed", betType: "win", pick: (ctx) => byStat("speed")(ctx).slice(0, 1) },
  { key: "win_stamina", label: "Win: highest stamina", betType: "win", pick: (ctx) => byStat("stamina")(ctx).slice(0, 1) },
  { key: "win_form", label: "Win: highest form", betType: "win", pick: (ctx) => byStat("form")(ctx).slice(0, 1) },
  { key: "win_consistency", label: "Win: highest consistency", betType: "win", pick: (ctx) => byStat("consistency")(ctx).slice(0, 1) },
  { key: "win_ground_match", label: "Win: ground match", betType: "win", pick: (ctx) => ctx.field.filter((h) => h.groundPreference === ctx.ground) },

  { key: "place_fav", label: "Place: favourite", betType: "place", pick: (ctx) => byWinOdds(ctx).slice(0, 1) },
  { key: "show_fav", label: "Show: favourite", betType: "show", pick: (ctx) => byWinOdds(ctx).slice(0, 1) },
  { key: "place_longest", label: "Place: longest odds", betType: "place", pick: (ctx) => byWinOdds(ctx).slice(-1) },
  { key: "show_longest", label: "Show: longest odds", betType: "show", pick: (ctx) => byWinOdds(ctx).slice(-1) },
  { key: "place_ground_match", label: "Place: ground match", betType: "place", pick: (ctx) => ctx.field.filter((h) => h.groundPreference === ctx.ground) },
  { key: "show_ground_match", label: "Show: ground match", betType: "show", pick: (ctx) => ctx.field.filter((h) => h.groundPreference === ctx.ground) },
];

function emptyStats(): StrategyStats {
  return {
    opportunities: 0,
    bets: 0,
    wins: 0,
    skippedBelowMin: 0,
    cappedBets: 0,
    totalIntendedStake: 0,
    totalStaked: 0,
    totalReturned: 0,
    totalModelReturned: 0,
    oddsStakeWeighted: 0,
  };
}

async function main() {
  const raceCount = parseInt(process.argv[2] || "10000", 10);
  const mcIterations = parseInt(process.argv[3] || "4000", 10);
  const intendedStake = parseFloat(process.argv[4] || "1");

  if (!Number.isFinite(intendedStake) || intendedStake <= 0) {
    console.error("Stake must be a positive number");
    process.exit(1);
  }

  console.log("");
  console.log("Loading horse stats from prod...");
  const { data: horseRows, error } = await supa
    .from("horses")
    .select("id, name, speed, stamina, form, consistency, ground_preference");

  if (error || !horseRows || horseRows.length < 8) {
    console.error("Failed to load horses:", error?.message);
    process.exit(1);
  }

  const horses = (horseRows as HorseRow[]).map((h) => ({
    id: h.id,
    name: h.name,
    speed: h.speed,
    stamina: h.stamina,
    form: h.form,
    consistency: h.consistency,
    groundPreference: h.ground_preference,
  }));

  const stats = new Map<string, StrategyStats>();
  for (const strategy of STRATEGIES) stats.set(strategy.key, emptyStats());

  const allHorseIds = horses.map((h) => h.id);
  const t0 = Date.now();

  console.log(
    `Loaded ${horses.length} horses. Running ${raceCount.toLocaleString()} races | ` +
    `${mcIterations.toLocaleString()} MC/race | intended stake $${intendedStake.toFixed(2)}`
  );
  console.log(
    `Caps: min bet $${BANKROLL_RACING.MIN_BET.toFixed(2)}, max bet $${BANKROLL_RACING.MAX_BET.toFixed(2)}, ` +
    `max liability $${BANKROLL_RACING.MAX_RACE_LIABILITY.toFixed(2)} per horse`
  );
  console.log("");

  for (let race = 0; race < raceCount; race++) {
    const serverSeed = randomBytes(32).toString("hex");
    const clientSeed = "throws.gg";
    const nonce = race + 1;

    const { selectedIds, distance, ground } = selectRaceField(serverSeed, clientSeed, nonce, allHorseIds);
    const field = selectedIds.map((id) => horses.find((h) => h.id === id)!);

    const oddsSeed = createHmac("sha256", serverSeed).update("odds-mc").digest("hex");
    const oddsMap = calculateOddsMonteCarlo(field, distance, ground, oddsSeed, mcIterations);

    const result = simulateRace(serverSeed, clientSeed, nonce, field, distance, ground, false);
    const finishPositionByHorse = new Map(result.finishOrder.map((f) => [f.horseId, f.finishPosition]));
    const ctx: RaceContext = { field, oddsMap, finishPositionByHorse, distance, ground };

    for (const strategy of STRATEGIES) {
      const picked = strategy.pick(ctx);
      const s = stats.get(strategy.key)!;
      if (picked.length > 0) s.opportunities++;

      for (const horse of picked) {
        const priced = pricedFor(oddsMap.get(horse.id)!, strategy.betType);
        const maxStakeForLiability = BANKROLL_RACING.MAX_RACE_LIABILITY / priced.odds;
        const stake = floorCents(Math.min(intendedStake, BANKROLL_RACING.MAX_BET, maxStakeForLiability));
        s.totalIntendedStake += intendedStake;

        if (stake < BANKROLL_RACING.MIN_BET) {
          s.skippedBelowMin++;
          continue;
        }

        if (stake < intendedStake) s.cappedBets++;

        const finishPosition = finishPositionByHorse.get(horse.id) || 99;
        const won = hasWon(finishPosition, strategy.betType);

        s.bets++;
        s.totalStaked += stake;
        s.oddsStakeWeighted += stake * priced.odds;
        s.totalModelReturned += stake * priced.probability * priced.odds;
        if (won) {
          s.wins++;
          s.totalReturned += stake * priced.odds;
        }
      }
    }

    if ((race + 1) % 500 === 0 || race + 1 === raceCount) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (race + 1) / elapsed;
      const eta = (raceCount - race - 1) / rate;
      console.log(`  ${race + 1}/${raceCount} races | ${rate.toFixed(0)}/s | ETA ${eta.toFixed(0)}s`);
    }
  }

  console.log("");
  printReport(raceCount, intendedStake, stats);
  writeCsv(raceCount, intendedStake, stats);
}

function printReport(raceCount: number, intendedStake: number, stats: Map<string, StrategyStats>) {
  const targetRtp = 1 / OVERROUND;
  console.log("=".repeat(122));
  console.log(`RACING STRATEGY SIMULATION - ${raceCount.toLocaleString()} races - intended stake $${intendedStake.toFixed(2)}`);
  console.log("=".repeat(122));
  console.log(`Target model RTP: ${pct(targetRtp)} | target edge: ${pct(1 - targetRtp)}`);
  console.log("");
  console.log(
    pad("Strategy", 24) +
    pad("Opps", 8) +
    pad("Bets", 9) +
    pad("Wins", 8) +
    pad("Hit", 9) +
    pad("AvgOdds", 10) +
    pad("Stake", 12) +
    pad("Returned", 12) +
    pad("Model", 9) +
    pad("RTP", 9) +
    pad("Edge", 9) +
    pad("Capped", 9) +
    "Flag"
  );
  console.log("-".repeat(122));

  for (const strategy of STRATEGIES) {
    const s = stats.get(strategy.key)!;
    if (s.bets === 0) continue;
    const hitRate = s.wins / s.bets;
    const modelRtp = s.totalModelReturned / s.totalStaked;
    const realisedRtp = s.totalReturned / s.totalStaked;
    const edge = 1 - realisedRtp;
    const avgOdds = s.oddsStakeWeighted / s.totalStaked;
    const cappedRate = s.cappedBets / s.bets;
    const flag =
      modelRtp > 1 ? "MODEL POSITIVE" :
      modelRtp > 0.93 ? "model thin" :
      realisedRtp > 1 ? "realised hot" :
      realisedRtp < 0.80 ? "realised cold" :
      "";

    console.log(
      pad(strategy.label, 24) +
      pad(s.opportunities.toLocaleString(), 8) +
      pad(s.bets.toLocaleString(), 9) +
      pad(s.wins.toLocaleString(), 8) +
      pad(pct(hitRate), 9) +
      pad(avgOdds.toFixed(2), 10) +
      pad(`$${fmt(s.totalStaked)}`, 12) +
      pad(`$${fmt(s.totalReturned)}`, 12) +
      pad(pct(modelRtp), 9) +
      pad(pct(realisedRtp), 9) +
      pad(pct(edge), 9) +
      pad(pct(cappedRate), 9) +
      flag
    );
  }
  console.log("=".repeat(122));
  console.log("");
}

function writeCsv(raceCount: number, intendedStake: number, stats: Map<string, StrategyStats>) {
  const csvPath = path.join(__dirname, `sim-racing-strategies-${raceCount}-races.csv`);
  const lines = [
    "strategy,bet_type,opportunities,bets,wins,hit_rate,avg_odds,intended_stake,total_staked,total_returned,model_rtp,rtp,edge,capped_bets,capped_rate,skipped_below_min",
  ];

  for (const strategy of STRATEGIES) {
    const s = stats.get(strategy.key)!;
    if (s.bets === 0) continue;
    const hitRate = s.wins / s.bets;
    const avgOdds = s.oddsStakeWeighted / s.totalStaked;
    const modelRtp = s.totalModelReturned / s.totalStaked;
    const rtp = s.totalReturned / s.totalStaked;
    lines.push([
      strategy.key,
      strategy.betType,
      s.opportunities,
      s.bets,
      s.wins,
      hitRate.toFixed(6),
      avgOdds.toFixed(6),
      intendedStake.toFixed(2),
      s.totalStaked.toFixed(2),
      s.totalReturned.toFixed(2),
      modelRtp.toFixed(6),
      rtp.toFixed(6),
      (1 - rtp).toFixed(6),
      s.cappedBets,
      (s.cappedBets / s.bets).toFixed(6),
      s.skippedBelowMin,
    ].join(","));
  }

  fs.writeFileSync(csvPath, lines.join("\n"));
  console.log(`Wrote strategy CSV: ${csvPath}`);
  console.log("");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
