/**
 * Offline simulation: run N synthetic races with the current horse roster
 * and the current odds-engine settings, then measure the effective book
 * percentage + house edge.
 *
 * Use this to sanity-check any change to OVERROUND or the odds caps
 * BEFORE touching the live book.
 *
 * Run: npx tsx scripts/simulate-odds.ts [raceCount]
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { calculateOddsMonteCarlo, OVERROUND } from "../lib/racing/odds-engine";
import { simulateRace, selectRaceField } from "../lib/racing/simulation";
import type { GroundCondition, RaceDistance } from "../lib/racing/constants";

// Load env
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.substring(0, eq).trim();
    const value = trimmed.substring(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const N = parseInt(process.argv[2] || "2000", 10);
const EXPECTED_EDGE = (OVERROUND - 1) / OVERROUND;

function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return ((num / denom) * 100).toFixed(2) + "%";
}

async function main() {
  console.log(`\nRunning ${N} offline simulated races against current odds engine...\n`);
  console.log(`OVERROUND config: ${OVERROUND} (expected edge ${(EXPECTED_EDGE * 100).toFixed(2)}%)\n`);

  // Pull the horse roster
  const { data: horses, error } = await supabase
    .from("horses")
    .select("id, speed, stamina, form, consistency, ground_preference");

  if (error || !horses) {
    console.error("Failed to fetch horses:", error);
    process.exit(1);
  }

  console.log(`Got ${horses.length} horses in roster\n`);

  const horseStats = horses.map(h => ({
    id: h.id,
    speed: h.speed,
    stamina: h.stamina,
    form: h.form,
    consistency: h.consistency,
    groundPreference: h.ground_preference as GroundCondition,
  }));
  const allIds = horseStats.map(h => h.id);

  const buckets = [
    { min: 1.0,  max: 2.5,  label: "1.00-2.50 (heavy fav)", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
    { min: 2.5,  max: 4.0,  label: "2.50-4.00 (fav)      ", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
    { min: 4.0,  max: 6.0,  label: "4.00-6.00 (mid)      ", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
    { min: 6.0,  max: 10.0, label: "6.00-10.0 (longshot) ", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
    { min: 10.0, max: 20.0, label: "10.0-20.0 (very long)", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
    { min: 20.0, max: 50.0, label: "20.0-50.0 (bomb)     ", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
    { min: 50.0, max: 10000, label: "50.0+     (rare bomb)", count: 0, wins: 0, impliedSum: 0, avgOddsSum: 0 },
  ];

  let favWins = 0;
  let totalStake = 0;
  let totalPayout = 0;
  const bookPercentages: number[] = [];
  const allOdds: number[] = [];

  // Use a random-ish server seed per simulated race so the Monte Carlo
  // varies meaningfully across the run
  for (let i = 0; i < N; i++) {
    const serverSeed = `sim-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
    const clientSeed = "throws.gg";
    const nonce = i + 1;

    const { selectedIds, distance, ground } = selectRaceField(
      serverSeed,
      clientSeed,
      nonce,
      allIds
    );

    const selected = horseStats.filter(h => selectedIds.includes(h.id));

    // Calculate odds
    const oddsMap = calculateOddsMonteCarlo(
      selected,
      distance as RaceDistance,
      ground as GroundCondition,
      serverSeed
    );

    // Simulate the actual race
    const result = simulateRace(
      serverSeed,
      clientSeed,
      nonce,
      selected,
      distance as RaceDistance,
      ground as GroundCondition
    );

    // Winner is finishPosition === 1
    const winner = result.finishOrder.find(f => f.finishPosition === 1);
    if (!winner) continue;

    // Find shortest-priced horse (favourite)
    let favId = selectedIds[0];
    let favOdds = Infinity;
    let raceBookPct = 0;

    for (const id of selectedIds) {
      const odds = oddsMap.get(id);
      if (!odds) continue;
      const winOdds = odds.winOdds;
      raceBookPct += 1 / winOdds;
      allOdds.push(winOdds);
      if (winOdds < favOdds) {
        favOdds = winOdds;
        favId = id;
      }

      // Classify into bucket
      const bucket = buckets.find(b => winOdds >= b.min && winOdds < b.max);
      if (bucket) {
        bucket.count++;
        bucket.impliedSum += 1 / winOdds;
        bucket.avgOddsSum += winOdds;
        if (id === winner.horseId) bucket.wins++;
      }

      // Flat $1 bet tracking
      totalStake += 1;
      if (id === winner.horseId) totalPayout += winOdds;
    }

    bookPercentages.push(raceBookPct);
    if (favId === winner.horseId) favWins++;
  }

  // ---- Favourite rate ----
  console.log("=".repeat(65));
  console.log("FAVOURITE WIN RATE");
  console.log("=".repeat(65));
  console.log(`Favourite won: ${favWins} of ${N}  (${pct(favWins, N)})`);
  console.log(`Target:        30-33%`);

  // ---- Buckets ----
  console.log("\n" + "=".repeat(65));
  console.log("ODDS BUCKET CALIBRATION");
  console.log("=".repeat(65));
  console.log("Bucket                  | Entries | Wins | Empirical | Implied | Edge");
  console.log("-".repeat(80));
  for (const b of buckets) {
    const avgImplied = b.count > 0 ? b.impliedSum / b.count : 0;
    const avgOdds = b.count > 0 ? b.avgOddsSum / b.count : 0;
    const bucketStake = b.count;
    const bucketPayout = b.wins * avgOdds;
    const bucketEdge = bucketStake > 0 ? (bucketStake - bucketPayout) / bucketStake : 0;
    console.log(
      `${b.label}| ${String(b.count).padStart(7)} | ${String(b.wins).padStart(4)} | ${pct(b.wins, b.count).padStart(9)} | ${(avgImplied * 100).toFixed(1).padStart(6)}% | ${(bucketEdge * 100).toFixed(1).padStart(4)}%`
    );
  }

  // ---- Book percentage ----
  const avgBookPct = bookPercentages.reduce((a, b) => a + b, 0) / bookPercentages.length;
  console.log("\n" + "=".repeat(65));
  console.log("BOOK PERCENTAGE (sum of 1/odds per race)");
  console.log("=".repeat(65));
  console.log(`Average book:     ${avgBookPct.toFixed(4)}`);
  console.log(`Target (OVERROUND): ${OVERROUND.toFixed(4)}`);
  console.log(`Drift:            ${((avgBookPct - OVERROUND) * 100).toFixed(2)}%`);
  if (Math.abs(avgBookPct - OVERROUND) < 0.01) {
    console.log(`✓  Book tracking target within ±1%`);
  } else {
    console.log(`⚠  Drift > 1% — check odds caps`);
  }

  // ---- Flat bet simulation ----
  const totalEdge = (totalStake - totalPayout) / totalStake;
  console.log("\n" + "=".repeat(65));
  console.log("FLAT $1 BET ON EVERY HORSE");
  console.log("=".repeat(65));
  console.log(`Stake:            $${totalStake.toFixed(0)}`);
  console.log(`Payout:           $${totalPayout.toFixed(0)}`);
  console.log(`Observed edge:    ${(totalEdge * 100).toFixed(2)}%`);
  console.log(`Expected edge:    ${(EXPECTED_EDGE * 100).toFixed(2)}%`);
  const delta = totalEdge - EXPECTED_EDGE;
  if (Math.abs(delta) < 0.02) {
    console.log(`✓  House edge in line (±2%)`);
  } else if (delta > 0) {
    console.log(`⚠  House edge HIGHER than expected (+${(delta * 100).toFixed(2)}%)`);
  } else {
    console.log(`⚠  House edge LOWER than expected (${(delta * 100).toFixed(2)}%)`);
  }

  // ---- Odds range ----
  allOdds.sort((a, b) => a - b);
  console.log("\n" + "=".repeat(65));
  console.log("ODDS RANGE");
  console.log("=".repeat(65));
  console.log(`Min:      ${allOdds[0].toFixed(2)}`);
  console.log(`25th pct: ${allOdds[Math.floor(allOdds.length * 0.25)].toFixed(2)}`);
  console.log(`Median:   ${allOdds[Math.floor(allOdds.length * 0.5)].toFixed(2)}`);
  console.log(`75th pct: ${allOdds[Math.floor(allOdds.length * 0.75)].toFixed(2)}`);
  console.log(`95th pct: ${allOdds[Math.floor(allOdds.length * 0.95)].toFixed(2)}`);
  console.log(`99th pct: ${allOdds[Math.floor(allOdds.length * 0.99)].toFixed(2)}`);
  console.log(`Max:      ${allOdds[allOdds.length - 1].toFixed(2)}`);

  console.log("\n");
}

main().catch(err => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
