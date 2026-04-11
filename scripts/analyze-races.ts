/**
 * One-off analysis of the most recent N settled races.
 *
 * Checks:
 * - Favourite win rate (should be ~30-33% for real horse racing)
 * - Per-odds-bucket empirical win rate vs implied probability (reality check
 *   on whether the pricing is consistent across the book)
 * - Observed house edge on win bets (if we just let the simulation run
 *   against its own odds, house edge should be ~13.49% with 1.156 overround)
 * - Distribution of finish positions per odds bucket
 * - Longest winning/losing streaks by favourite
 *
 * Run: npx tsx scripts/analyze-races.ts [raceCount]
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load env from .env.local
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

// ---- Config ----
const N_RACES = parseInt(process.argv[2] || "577", 10);
const OVERROUND = 1.156;
const EXPECTED_HOUSE_EDGE = (OVERROUND - 1) / OVERROUND; // ~13.49%

// ---- Helpers ----
function pct(num: number, denom: number): string {
  if (denom === 0) return "—";
  return ((num / denom) * 100).toFixed(2) + "%";
}

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

// ---- Main ----
async function main() {
  console.log(`\nAnalysing the last ${N_RACES} settled races...\n`);

  // Get the most recent N settled races
  const { data: races, error: racesErr } = await supabase
    .from("races")
    .select("id, race_number, distance, ground, status")
    .eq("status", "settled")
    .order("race_number", { ascending: false })
    .limit(N_RACES);

  if (racesErr) {
    console.error("Failed to fetch races:", racesErr);
    process.exit(1);
  }

  if (!races || races.length === 0) {
    console.error("No settled races found.");
    process.exit(1);
  }

  console.log(`Got ${races.length} settled races (race #${races[races.length - 1].race_number} → #${races[0].race_number})\n`);

  // Pull entries for all those races in batches (Supabase IN clause limit)
  const BATCH = 100;
  const raceIds = races.map(r => r.id);
  type Entry = {
    race_id: string;
    horse_id: number;
    current_odds: string;
    opening_odds: string;
    true_probability: string;
    finish_position: number | null;
    gate_position: number;
  };
  const allEntries: Entry[] = [];
  for (let i = 0; i < raceIds.length; i += BATCH) {
    const chunk = raceIds.slice(i, i + BATCH);
    const { data: entries, error: e } = await supabase
      .from("race_entries")
      .select("race_id, horse_id, current_odds, opening_odds, true_probability, finish_position, gate_position")
      .in("race_id", chunk);
    if (e) {
      console.error("Failed to fetch entries:", e);
      process.exit(1);
    }
    if (entries) allEntries.push(...(entries as unknown as Entry[]));
  }

  console.log(`Got ${allEntries.length} race entries (${(allEntries.length / races.length).toFixed(2)} per race)\n`);

  // Group entries by race
  const byRace = new Map<string, Entry[]>();
  for (const e of allEntries) {
    if (!byRace.has(e.race_id)) byRace.set(e.race_id, []);
    byRace.get(e.race_id)!.push(e);
  }

  // ---- 1. Favourite win rate ----
  let favWins = 0;
  let favTop3 = 0;
  let favFinishSum = 0;
  let secondFavWins = 0;
  let raceCount = 0;

  for (const race of races) {
    const entries = byRace.get(race.id);
    if (!entries || entries.length === 0) continue;
    raceCount++;

    // Sort by odds ascending — shortest priced first
    const sorted = [...entries].sort(
      (a, b) => parseFloat(a.current_odds) - parseFloat(b.current_odds)
    );
    const fav = sorted[0];
    const secondFav = sorted[1];

    if (fav.finish_position === 1) favWins++;
    if (fav.finish_position && fav.finish_position <= 3) favTop3++;
    if (fav.finish_position) favFinishSum += fav.finish_position;
    if (secondFav && secondFav.finish_position === 1) secondFavWins++;
  }

  console.log("=".repeat(60));
  console.log("FAVOURITE PERFORMANCE");
  console.log("=".repeat(60));
  console.log(`Races analysed:            ${raceCount}`);
  console.log(`Favourite won:             ${favWins}  (${pct(favWins, raceCount)})`);
  console.log(`Favourite top 3:           ${favTop3}  (${pct(favTop3, raceCount)})`);
  console.log(`Favourite avg finish:      ${fmt(favFinishSum / raceCount)}`);
  console.log(`2nd-favourite won:         ${secondFavWins}  (${pct(secondFavWins, raceCount)})`);
  console.log(`\nIdeal favourite win rate:  30-33% (real horse racing)`);
  console.log(`Acceptable range:          25-38%`);
  const favRate = favWins / raceCount;
  if (favRate < 0.25) console.log(`⚠  Favourite win rate LOW — too chaotic, odds not tracking skill`);
  else if (favRate > 0.38) console.log(`⚠  Favourite win rate HIGH — not enough upsets, races too predictable`);
  else console.log(`✓  Favourite win rate in healthy range`);

  // ---- 2. Per-odds-bucket win rate vs implied probability ----
  console.log("\n" + "=".repeat(60));
  console.log("ODDS BUCKET CALIBRATION");
  console.log("=".repeat(60));
  console.log("Empirical win rate vs implied probability (1/odds).");
  console.log("With our 1.156 overround, implied prob should be ~13.5%");
  console.log("HIGHER than the 'true' probability (that's the house edge).");
  console.log("So empirical rate should land somewhere between true and implied.\n");

  const buckets = [
    { min: 1.0,  max: 2.5,  label: "1.00-2.50 (heavy fav)" },
    { min: 2.5,  max: 4.0,  label: "2.50-4.00 (fav)      " },
    { min: 4.0,  max: 6.0,  label: "4.00-6.00 (mid)      " },
    { min: 6.0,  max: 10.0, label: "6.00-10.0 (longshot) " },
    { min: 10.0, max: 20.0, label: "10.0-20.0 (very long)" },
    { min: 20.0, max: 100,  label: "20.0+     (bomb)     " },
  ];

  console.log("Bucket                  | Entries | Wins | Empirical | Implied | Edge");
  console.log("-".repeat(75));
  let totalStake = 0;
  let totalPayout = 0;
  for (const b of buckets) {
    const inBucket = allEntries.filter(e => {
      const o = parseFloat(e.current_odds);
      return o >= b.min && o < b.max;
    });
    const wins = inBucket.filter(e => e.finish_position === 1).length;
    const count = inBucket.length;
    const emp = count > 0 ? wins / count : 0;
    // Average implied prob for this bucket
    const avgImplied = count > 0
      ? inBucket.reduce((s, e) => s + 1 / parseFloat(e.current_odds), 0) / count
      : 0;
    // "Edge" here = (implied - empirical) / implied. Positive means house profits on flat $1 bets in this bucket.
    const avgOdds = count > 0
      ? inBucket.reduce((s, e) => s + parseFloat(e.current_odds), 0) / count
      : 0;
    // Simulate flat $1 bets on every horse in this bucket
    const bucketStake = count;
    const bucketPayout = wins * avgOdds;
    const bucketEdge = bucketStake > 0 ? (bucketStake - bucketPayout) / bucketStake : 0;
    totalStake += bucketStake;
    totalPayout += bucketPayout;

    console.log(
      `${b.label}| ${String(count).padStart(7)} | ${String(wins).padStart(4)} | ${pct(wins, count).padStart(9)} | ${(avgImplied * 100).toFixed(1).padStart(6)}% | ${(bucketEdge * 100).toFixed(1).padStart(4)}%`
    );
  }

  // ---- 3. Simulated house edge (flat $1 bets on every horse) ----
  const overallEdge = totalStake > 0 ? (totalStake - totalPayout) / totalStake : 0;
  console.log("\n" + "=".repeat(60));
  console.log("SIMULATED HOUSE EDGE — flat $1 bet on EVERY horse");
  console.log("=".repeat(60));
  console.log(`Total stake (hypothetical):   $${fmt(totalStake)}`);
  console.log(`Total payout (hypothetical):  $${fmt(totalPayout)}`);
  console.log(`Observed house edge:          ${(overallEdge * 100).toFixed(2)}%`);
  console.log(`Expected house edge (1.156):  ${(EXPECTED_HOUSE_EDGE * 100).toFixed(2)}%`);
  const delta = overallEdge - EXPECTED_HOUSE_EDGE;
  if (Math.abs(delta) < 0.02) {
    console.log(`✓  House edge in line with overround (within ±2%)`);
  } else if (delta > 0) {
    console.log(`⚠  House edge HIGHER than expected (+${(delta * 100).toFixed(2)}%) — longshots underperforming`);
  } else {
    console.log(`⚠  House edge LOWER than expected (${(delta * 100).toFixed(2)}%) — we might be leaking value`);
  }

  // ---- 4. Real-book simulation: flat $1 win bet on favourite only ----
  console.log("\n" + "=".repeat(60));
  console.log("STRATEGY SIM — flat $1 WIN on favourite every race");
  console.log("=".repeat(60));
  let favStrategyStake = 0;
  let favStrategyPayout = 0;
  for (const race of races) {
    const entries = byRace.get(race.id);
    if (!entries) continue;
    const sorted = [...entries].sort(
      (a, b) => parseFloat(a.current_odds) - parseFloat(b.current_odds)
    );
    const fav = sorted[0];
    favStrategyStake += 1;
    if (fav.finish_position === 1) {
      favStrategyPayout += parseFloat(fav.current_odds);
    }
  }
  const favEdge = (favStrategyStake - favStrategyPayout) / favStrategyStake;
  console.log(`Staked:  $${fmt(favStrategyStake)}`);
  console.log(`Payout:  $${fmt(favStrategyPayout)}`);
  console.log(`P/L:     $${fmt(favStrategyPayout - favStrategyStake)}`);
  console.log(`House edge vs favourite bettor: ${(favEdge * 100).toFixed(2)}%`);

  // ---- 5. Real-book simulation: flat $1 on longshot (highest odds) ----
  console.log("\n" + "=".repeat(60));
  console.log("STRATEGY SIM — flat $1 WIN on LONGEST SHOT every race");
  console.log("=".repeat(60));
  let longStake = 0;
  let longPayout = 0;
  for (const race of races) {
    const entries = byRace.get(race.id);
    if (!entries) continue;
    const sorted = [...entries].sort(
      (a, b) => parseFloat(b.current_odds) - parseFloat(a.current_odds)
    );
    const longshot = sorted[0];
    longStake += 1;
    if (longshot.finish_position === 1) {
      longPayout += parseFloat(longshot.current_odds);
    }
  }
  const longEdge = (longStake - longPayout) / longStake;
  console.log(`Staked:  $${fmt(longStake)}`);
  console.log(`Payout:  $${fmt(longPayout)}`);
  console.log(`P/L:     $${fmt(longPayout - longStake)}`);
  console.log(`House edge vs longshot bettor: ${(longEdge * 100).toFixed(2)}%`);

  // ---- 6. Odds range sanity ----
  console.log("\n" + "=".repeat(60));
  console.log("ODDS RANGE SANITY");
  console.log("=".repeat(60));
  const odds = allEntries.map(e => parseFloat(e.current_odds));
  odds.sort((a, b) => a - b);
  console.log(`Min odds:      ${fmt(odds[0])}`);
  console.log(`25th pctile:   ${fmt(odds[Math.floor(odds.length * 0.25)])}`);
  console.log(`Median odds:   ${fmt(odds[Math.floor(odds.length * 0.5)])}`);
  console.log(`75th pctile:   ${fmt(odds[Math.floor(odds.length * 0.75)])}`);
  console.log(`Max odds:      ${fmt(odds[odds.length - 1])}`);

  // Sum of 1/odds per race — should be ~1.156 if overround is being applied correctly
  const sumInverseByRace: number[] = [];
  for (const race of races) {
    const entries = byRace.get(race.id);
    if (!entries) continue;
    const sum = entries.reduce((s, e) => s + 1 / parseFloat(e.current_odds), 0);
    sumInverseByRace.push(sum);
  }
  const avgInverse = sumInverseByRace.reduce((a, b) => a + b, 0) / sumInverseByRace.length;
  console.log(`\nAvg book percentage (sum of 1/odds per race): ${fmt(avgInverse, 4)}`);
  console.log(`Target (OVERROUND):                           1.1560`);
  if (Math.abs(avgInverse - OVERROUND) < 0.01) {
    console.log(`✓  Overround tracking target`);
  } else {
    console.log(`⚠  Overround DRIFT — difference: ${((avgInverse - OVERROUND) * 100).toFixed(2)}%`);
  }

  // ---- 7. Distance & ground distribution ----
  console.log("\n" + "=".repeat(60));
  console.log("DISTANCE & GROUND DISTRIBUTION");
  console.log("=".repeat(60));
  const byDistance = new Map<number, number>();
  const byGround = new Map<string, number>();
  for (const r of races) {
    byDistance.set(r.distance, (byDistance.get(r.distance) || 0) + 1);
    byGround.set(r.ground, (byGround.get(r.ground) || 0) + 1);
  }
  console.log("Distance:");
  for (const [d, c] of [...byDistance.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${d}m: ${c} races (${pct(c, raceCount)})`);
  }
  console.log("Ground:");
  for (const [g, c] of byGround.entries()) {
    console.log(`  ${g}: ${c} races (${pct(c, raceCount)})`);
  }

  console.log("\n");
}

main().catch(err => {
  console.error("Analysis failed:", err);
  process.exit(1);
});
