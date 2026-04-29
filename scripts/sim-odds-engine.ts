/**
 * sim-odds-engine.ts
 *
 * End-to-end smoke test for the production odds + simulation pipeline.
 *
 * For N synthetic races:
 *   1. Pull the 16 real horses from the DB (their stats — speed, stamina,
 *      form, consistency, ground preference).
 *   2. Use selectRaceField() to pick the 8 runners + distance + ground
 *      exactly as production does.
 *   3. Use calculateOddsMonteCarlo() to price the field — the SAME function
 *      called by lib/racing/engine.ts when it creates a real race.
 *   4. Use simulateRace() to "run" the race — the SAME function called when
 *      a real race resolves.
 *   5. Pretend a bettor staked $1 on every horse at the locked odds.
 *      Aggregate the gross handle and the gross payout.
 *
 * Reports realised RTP overall and bucketed by odds, plus implied vs
 * empirical win rate by bucket — the smoking-gun view for "is the engine
 * pricing every part of the book honestly?"
 *
 * Read-only against the DB (just pulls horse stats once). No bets are
 * actually placed; nothing is written.
 *
 * Run:
 *   npx tsx scripts/sim-odds-engine.ts [raceCount=10000]
 *
 * Targets:
 *   - Overall RTP ≈ 91% (matches 1.10 overround → 9.09% edge)
 *   - Per-bucket RTP within ±2% of 91% over 10k races
 *   - No bucket > 100% RTP (which would mean a bettor edge exists)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { calculateOddsMonteCarlo, OVERROUND } from "../lib/racing/odds-engine";
import { simulateRace, selectRaceField } from "../lib/racing/simulation";
import { createHmac, randomBytes } from "crypto";
import type { GroundCondition } from "../lib/racing/constants";

// Load .env.local
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

interface HorseRow {
  id: number;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  ground_preference: GroundCondition;
}

// Odds buckets we care about for the realised-RTP breakdown
const BUCKETS = [
  { label: "<1.30",         min: 0,     max: 1.30 },
  { label: "1.30 – 2.00",   min: 1.30,  max: 2.00 },
  { label: "2.00 – 3.00",   min: 2.00,  max: 3.00 },
  { label: "3.00 – 5.00",   min: 3.00,  max: 5.00 },
  { label: "5.00 – 8.00",   min: 5.00,  max: 8.00 },
  { label: "8.00 – 15.00",  min: 8.00,  max: 15.00 },
  { label: "15.00 – 30.00", min: 15.00, max: 30.00 },
  { label: "30.00 – 60.00", min: 30.00, max: 60.00 },
  { label: "60.00 – 100.00", min: 60.00, max: 100.00 },
  { label: "100.00 – 250.00", min: 100.00, max: 250.00 },
  { label: "250.00 – 500.00", min: 250.00, max: 500.00 },
  { label: "500.00 – 1000.00", min: 500.00, max: 1000.00 },
  { label: "1000.00+",       min: 1000.00, max: Infinity },
] as const;

function bucketFor(odds: number) {
  for (const b of BUCKETS) {
    if (odds >= b.min && odds < b.max) return b.label;
  }
  return odds >= 1000 ? "1000.00+" : "<1.30";
}

async function main() {
  const raceCount = parseInt(process.argv[2] || "10000", 10);
  // Default to 4k MC iterations so large sweeps finish quickly. Pass 25000
  // as the third arg to mirror production pricing exactly.
  const mcIterations = parseInt(process.argv[3] || "4000", 10);

  console.log(`\nLoading horse stats from prod...`);
  const { data: horseRows, error } = await supa
    .from("horses")
    .select("id, speed, stamina, form, consistency, ground_preference");

  if (error || !horseRows || horseRows.length < 8) {
    console.error("Failed to load horses:", error?.message);
    process.exit(1);
  }

  const horses = (horseRows as HorseRow[]).map((h) => ({
    id: h.id,
    speed: h.speed,
    stamina: h.stamina,
    form: h.form,
    consistency: h.consistency,
    groundPreference: h.ground_preference,
  }));

  console.log(`Loaded ${horses.length} horses. Running ${raceCount.toLocaleString()} synthetic races · ${mcIterations} MC iterations/race...\n`);

  // Aggregates
  let totalStaked = 0;          // $1 per horse per race × 8
  let totalReturned = 0;        // gross payout to bettor on winning horse
  let totalModelReturned = 0;   // expected payout using the pricing MC probability
  let totalRaces = 0;
  let favWins = 0;
  const bucketStaked = new Map<string, number>();
  const bucketReturned = new Map<string, number>();
  const bucketModelReturned = new Map<string, number>();
  const bucketBets = new Map<string, number>();   // # of $1 stakes in this bucket
  const bucketWins = new Map<string, number>();
  const bucketImpliedSum = new Map<string, number>(); // sum of (1 / odds) for empirical-vs-implied check

  const allHorseIds = horses.map((h) => h.id);
  const t0 = Date.now();

  for (let race = 0; race < raceCount; race++) {
    // Fresh random server seed per race — same shape as engine.ts createNextRace().
    const serverSeed = randomBytes(32).toString("hex");
    const clientSeed = "throws.gg";
    const nonce = race + 1;

    // Select runners + distance + ground deterministically (same as prod).
    const { selectedIds, distance, ground } = selectRaceField(
      serverSeed, clientSeed, nonce, allHorseIds
    );
    const fieldStats = selectedIds.map((id) => horses.find((h) => h.id === id)!);

    // Price the field via the production odds engine.
    // Use a derived seed for the Monte Carlo so it's not the same seed used
    // for the actual run — mirrors the way prod produces independent randomness.
    const oddsSeed = createHmac("sha256", serverSeed).update("odds-mc").digest("hex");
    const oddsMap = calculateOddsMonteCarlo(fieldStats, distance, ground, oddsSeed, mcIterations);

    // Run the actual race outcome.
    const result = simulateRace(serverSeed, clientSeed, nonce, fieldStats, distance, ground);
    const winnerId = result.finishOrder.find((f) => f.finishPosition === 1)!.horseId;

    // Find the favourite (lowest win odds in field) for fav-win tracking.
    let favOdds = Infinity;
    let favId = -1;
    for (const h of fieldStats) {
      const o = oddsMap.get(h.id)!.winOdds;
      if (o < favOdds) { favOdds = o; favId = h.id; }
    }
    if (favId === winnerId) favWins++;

    // Pretend $1 was staked on every horse. Aggregate gross stake + payout.
    for (const h of fieldStats) {
      const priced = oddsMap.get(h.id)!;
      const odds = priced.winOdds;
      const bucket = bucketFor(odds);
      const won = h.id === winnerId;
      const modelReturned = priced.probability * odds;

      totalStaked += 1;
      totalModelReturned += modelReturned;
      bucketStaked.set(bucket, (bucketStaked.get(bucket) ?? 0) + 1);
      bucketBets.set(bucket, (bucketBets.get(bucket) ?? 0) + 1);
      bucketImpliedSum.set(bucket, (bucketImpliedSum.get(bucket) ?? 0) + 1 / odds);
      bucketModelReturned.set(bucket, (bucketModelReturned.get(bucket) ?? 0) + modelReturned);

      if (won) {
        totalReturned += odds;
        bucketReturned.set(bucket, (bucketReturned.get(bucket) ?? 0) + odds);
        bucketWins.set(bucket, (bucketWins.get(bucket) ?? 0) + 1);
      }
    }
    totalRaces++;

    // Print progress every 500 races as a fresh line (works under redirection too).
    if ((race + 1) % 500 === 0 || race + 1 === raceCount) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = (race + 1) / elapsed;
      const eta = (raceCount - race - 1) / rate;
      console.log(`  ${race + 1}/${raceCount} races · ${rate.toFixed(0)}/s · ETA ${eta.toFixed(0)}s`);
    }
  }
  console.log("");

  // ===== REPORT =====
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const overallRtp = totalReturned / totalStaked;
  const overallModelRtp = totalModelReturned / totalStaked;
  const overallEdge = 1 - overallRtp;
  const targetEdge = (OVERROUND - 1) / OVERROUND;

  console.log("=".repeat(82));
  console.log(`ODDS ENGINE END-TO-END SIMULATION — ${totalRaces.toLocaleString()} races`);
  console.log("=".repeat(82));
  console.log(`Total stakes:        $${fmt(totalStaked)}    ($1 on every horse, every race × 8)`);
  console.log(`Total returned:      $${fmt(totalReturned)}`);
  console.log(`Overall RTP:         ${pct(overallRtp)}`);
  console.log(`Model RTP:           ${pct(overallModelRtp)}    (pricing MC expectation)`);
  console.log(`Overall edge:        ${pct(overallEdge)}    (target: ${pct(targetEdge)})`);
  console.log(`Edge delta:          ${(overallEdge - targetEdge >= 0 ? "+" : "")}${pct(overallEdge - targetEdge)}`);
  console.log(`Favourite win rate:  ${pct(favWins / totalRaces)}    (~30-33% expected)`);
  console.log("");

  console.log("PER-ODDS-BUCKET BREAKDOWN");
  console.log("");
  console.log(
    pad("Bucket", 16) +
    pad("Bets", 10) +
    pad("Wins", 8) +
    pad("Win rate", 11) +
    pad("Implied", 11) +
    pad("Stake", 12) +
    pad("Returned", 12) +
    pad("Model", 9) +
    pad("RTP", 9) +
    pad("Edge", 9)
  );
  console.log("-".repeat(98));

  for (const b of BUCKETS) {
    const bets = bucketBets.get(b.label) ?? 0;
    if (bets === 0) continue;
    const wins = bucketWins.get(b.label) ?? 0;
    const winRate = wins / bets;
    const stake = bucketStaked.get(b.label) ?? 0;
    const returned = bucketReturned.get(b.label) ?? 0;
    const modelReturned = bucketModelReturned.get(b.label) ?? 0;
    const rtp = stake > 0 ? returned / stake : 0;
    const modelRtp = stake > 0 ? modelReturned / stake : 0;
    const edge = 1 - rtp;
    const avgImplied = (bucketImpliedSum.get(b.label) ?? 0) / bets;

    const flag = (() => {
      if (rtp > 1.00) return "  ⚠  bettor edge";
      if (rtp > 0.95) return "  ⚠  thin";
      if (rtp < 0.85) return "  ⚠  fat";
      return "";
    })();

    console.log(
      pad(b.label, 16) +
      pad(bets.toLocaleString(), 10) +
      pad(wins.toLocaleString(), 8) +
      pad(pct(winRate), 11) +
      pad(pct(avgImplied), 11) +
      pad(`$${fmt(stake)}`, 12) +
      pad(`$${fmt(returned)}`, 12) +
      pad(pct(modelRtp), 9) +
      pad(pct(rtp), 9) +
      pad(pct(edge), 9) +
      flag
    );
  }
  console.log("=".repeat(82) + "\n");

  // Also write a CSV so the data can be plotted later
  const csvPath = path.join(__dirname, `sim-odds-${totalRaces}-races.csv`);
  const lines = ["bucket,bets,wins,win_rate,implied_prob,stake,returned,model_rtp,rtp,edge"];
  for (const b of BUCKETS) {
    const bets = bucketBets.get(b.label) ?? 0;
    if (bets === 0) continue;
    const wins = bucketWins.get(b.label) ?? 0;
    const stake = bucketStaked.get(b.label) ?? 0;
    const returned = bucketReturned.get(b.label) ?? 0;
    const modelReturned = bucketModelReturned.get(b.label) ?? 0;
    lines.push([
      b.label,
      bets,
      wins,
      (wins / bets).toFixed(6),
      ((bucketImpliedSum.get(b.label) ?? 0) / bets).toFixed(6),
      stake.toFixed(2),
      returned.toFixed(2),
      stake > 0 ? (modelReturned / stake).toFixed(6) : "0",
      stake > 0 ? (returned / stake).toFixed(6) : "0",
      stake > 0 ? (1 - returned / stake).toFixed(6) : "0",
    ].join(","));
  }
  fs.writeFileSync(csvPath, lines.join("\n"));
  console.log(`Wrote per-bucket CSV: ${csvPath}\n`);
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
