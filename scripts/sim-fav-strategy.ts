/**
 * sim-fav-strategy.ts
 *
 * What would it have cost the house if a single user had bet the maximum
 * stake ($100) on the favourite of every one of the last N settled races?
 *
 * Pulls real settled races + entries from prod, finds the favourite (lowest
 * locked current_odds), checks whether it won, applies the user's $100 stake
 * at the locked odds, and tracks running P&L from both perspectives:
 *   - User's net (wins − stake on losses)
 *   - House net (the inverse, plus structural edge realisation)
 *
 * Run: npx tsx scripts/sim-fav-strategy.ts [raceCount=1000]
 *
 * No-side-effects: read-only against the DB. Prints a summary + writes a
 * race-by-race CSV next to the script.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

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

const STAKE = 100; // BANKROLL_RACING.MAX_BET
const STARTING_BANKROLL = 9_000; // BANKROLL_RACING.INITIAL

const supa = createClient(SUPA_URL, SUPA_KEY);

interface EntryRow {
  race_id: string;
  horse_id: number;
  current_odds: string | number;
  finish_position: number | null;
}

interface RaceRow {
  id: string;
  race_number: number;
  status: string;
  winning_horse_id: number | null;
  settled_at: string;
}

async function main() {
  const raceCount = parseInt(process.argv[2] || "1000", 10);
  console.log(`\nSimulating "$${STAKE} on the favourite" across last ${raceCount} settled races...\n`);

  // Pull the last N settled races
  const { data: races, error: raceErr } = await supa
    .from("races")
    .select("id, race_number, status, winning_horse_id, settled_at")
    .eq("status", "settled")
    .not("winning_horse_id", "is", null)
    .order("race_number", { ascending: false })
    .limit(raceCount);

  if (raceErr) {
    console.error("Race fetch failed:", raceErr.message);
    process.exit(1);
  }
  if (!races || races.length === 0) {
    console.error("No settled races found.");
    process.exit(1);
  }

  console.log(`Pulled ${races.length} races (#${races[races.length - 1].race_number}–#${races[0].race_number}).`);

  const raceIds = races.map((r: RaceRow) => r.id);

  // Pull entries in batches — PostgREST has a URL length cap that 1k UUIDs blow past.
  const BATCH = 100;
  const allEntries: EntryRow[] = [];
  for (let i = 0; i < raceIds.length; i += BATCH) {
    const slice = raceIds.slice(i, i + BATCH);
    const { data, error } = await supa
      .from("race_entries")
      .select("race_id, horse_id, current_odds, finish_position")
      .in("race_id", slice);
    if (error) {
      console.error(`Entry batch ${i}–${i + BATCH} failed:`, error.message);
      process.exit(1);
    }
    if (data) allEntries.push(...(data as EntryRow[]));
  }

  // Group entries by race_id
  const byRace = new Map<string, EntryRow[]>();
  for (const e of allEntries) {
    const arr = byRace.get(e.race_id) ?? [];
    arr.push(e);
    byRace.set(e.race_id, arr);
  }

  // Replay (oldest -> newest so the bankroll curve runs forward in time)
  const ordered = [...races].reverse();

  let userPnl = 0;
  let userWins = 0;
  let userLosses = 0;
  let totalStaked = 0;
  let totalReturned = 0;
  let oddsSum = 0;
  let bankroll = STARTING_BANKROLL;
  let minBankroll = STARTING_BANKROLL;
  let maxBankroll = STARTING_BANKROLL;
  let minBankrollAtRace = 0;
  let maxBankrollAtRace = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let bankruptAtRace: number | null = null;

  // Race-by-race log for CSV
  const log: string[] = ["race_number,fav_horse_id,fav_odds,fav_finish,won,user_pnl_after,bankroll_after"];

  for (const race of ordered) {
    const raceEntries = byRace.get(race.id) ?? [];
    if (raceEntries.length === 0) continue;

    // Favourite = lowest current_odds (the odds at lock, which is what the
    // bettor would have locked in by clicking at any point during betting).
    const sorted = [...raceEntries].sort(
      (a, b) => Number(a.current_odds) - Number(b.current_odds)
    );
    const fav = sorted[0];
    const favOdds = Number(fav.current_odds);
    const won = fav.horse_id === race.winning_horse_id;

    totalStaked += STAKE;
    oddsSum += favOdds;

    let raceDelta: number;
    if (won) {
      // Bettor receives stake × odds. Their net for this race = stake × (odds − 1).
      const payout = STAKE * favOdds;
      totalReturned += payout;
      raceDelta = payout - STAKE;
      userPnl += raceDelta;
      userWins++;
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak;
    } else {
      // Bettor loses the $100 stake.
      raceDelta = -STAKE;
      userPnl += raceDelta;
      userLosses++;
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > longestLossStreak) longestLossStreak = currentLossStreak;
    }

    // House bankroll is the inverse of user net (every dollar the user wins
    // is a dollar paid out from the house; every dollar they lose stays).
    bankroll -= raceDelta;

    if (bankroll < minBankroll) {
      minBankroll = bankroll;
      minBankrollAtRace = race.race_number;
    }
    if (bankroll > maxBankroll) {
      maxBankroll = bankroll;
      maxBankrollAtRace = race.race_number;
    }
    if (bankrupt(bankroll) && bankruptAtRace === null) {
      bankruptAtRace = race.race_number;
    }

    log.push(
      [
        race.race_number,
        fav.horse_id,
        favOdds.toFixed(2),
        fav.finish_position ?? "",
        won ? 1 : 0,
        userPnl.toFixed(2),
        bankroll.toFixed(2),
      ].join(",")
    );
  }

  const racesPlayed = userWins + userLosses;
  const winRate = userWins / racesPlayed;
  const avgFavOdds = oddsSum / racesPlayed;
  const houseRtp = totalReturned / totalStaked;
  const houseEdge = 1 - houseRtp;

  // Fmt helpers
  const $ = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  console.log("\n" + "=".repeat(72));
  console.log("STRATEGY: Bet $100 on the favourite, every race, no skips");
  console.log("=".repeat(72));
  console.log(`Races played:           ${racesPlayed}`);
  console.log(`Total staked:           ${$(totalStaked)}`);
  console.log(`Total returned:         ${$(totalReturned)}`);
  console.log(`Avg favourite odds:     ${avgFavOdds.toFixed(2)}×`);
  console.log("");
  console.log("USER PERSPECTIVE");
  console.log(`  Wins / losses:        ${userWins} / ${userLosses}`);
  console.log(`  Win rate:             ${pct(winRate)}`);
  console.log(`  Implied prob (1/odds):${pct(1 / avgFavOdds)}    (would break even at this rate)`);
  console.log(`  Net P&L:              ${$(userPnl)}`);
  console.log(`  ROI:                  ${pct(userPnl / totalStaked)}`);
  console.log(`  Longest win streak:   ${longestWinStreak}`);
  console.log(`  Longest loss streak:  ${longestLossStreak}`);
  console.log("");
  console.log("HOUSE PERSPECTIVE");
  console.log(`  Realised edge:        ${pct(houseEdge)}    (book overround target: 9.09%)`);
  console.log(`  Net P&L:              ${$(-userPnl)}`);
  console.log(`  Starting bankroll:    ${$(STARTING_BANKROLL)}`);
  console.log(`  Ending bankroll:      ${$(bankroll)}`);
  console.log(`  Peak bankroll:        ${$(maxBankroll)}    (at race #${maxBankrollAtRace})`);
  console.log(`  Trough bankroll:      ${$(minBankroll)}    (at race #${minBankrollAtRace})`);
  console.log(`  Max drawdown:         ${$(STARTING_BANKROLL - minBankroll)}    (${pct((STARTING_BANKROLL - minBankroll) / STARTING_BANKROLL)} of starting)`);
  console.log(`  Bankrupt during run?  ${bankruptAtRace === null ? "no" : `YES — at race #${bankruptAtRace}`}`);
  console.log("=".repeat(72) + "\n");

  // Write CSV
  const outPath = path.join(__dirname, `fav-strategy-${racesPlayed}-races.csv`);
  fs.writeFileSync(outPath, log.join("\n"));
  console.log(`Race-by-race log: ${outPath}\n`);
}

function bankrupt(b: number) { return b < 0; }

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
