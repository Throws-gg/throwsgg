import { createAdminClient } from "@/lib/supabase/admin";
import { generateServerSeed, hashServerSeed } from "@/lib/game/provably-fair";
import { simulateRace, selectRaceField } from "./simulation";
import { calculateOddsMonteCarlo, HOUSE_EDGE } from "./odds-engine";
import { postRaceCommentary } from "./commentary";
import { trackServer, identifyServer } from "@/lib/analytics/posthog-server";
import { RACE_TIMING } from "./constants";
import type { RaceStatus, GroundCondition, RaceDistance } from "./constants";

// Lazy-init: avoid build-time crash when env vars aren't set
let _supabase: ReturnType<typeof createAdminClient> | null = null;
function db() {
  if (!_supabase) _supabase = createAdminClient();
  return _supabase;
}


// ======= QUERIES =======

export async function getCurrentRace() {
  // First try non-settled races
  const { data: active, error: activeError } = await db()
    .from("races")
    .select("*")
    .neq("status", "settled")
    .order("race_number", { ascending: false })
    .limit(1)
    .single();

  if (active) return active;
  if (activeError && activeError.code !== "PGRST116") {
    throw new Error(`Failed to get current race: ${activeError.message}`);
  }

  // Check if last settled race is still in results window
  const { data: lastSettled } = await db()
    .from("races")
    .select("*")
    .eq("status", "settled")
    .order("race_number", { ascending: false })
    .limit(1)
    .single();

  if (lastSettled) {
    const closes = new Date(lastSettled.betting_closes_at).getTime();
    const resultsEnd =
      closes +
      (RACE_TIMING.CLOSED_DURATION + RACE_TIMING.RACE_DURATION + RACE_TIMING.RESULTS_DURATION) * 1000;

    if (Date.now() < resultsEnd) return lastSettled;
  }

  return null;
}

async function getNextRaceNumber(): Promise<number> {
  const { data } = await db()
    .from("races")
    .select("race_number")
    .order("race_number", { ascending: false })
    .limit(1)
    .single();
  return data ? data.race_number + 1 : 1;
}

// ======= STATE TRANSITIONS =======

export async function createNextRace() {
  const raceNumber = await getNextRaceNumber();
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);

  // Get all horse IDs
  const { data: allHorses } = await db()
    .from("horses")
    .select("id, speed, stamina, form, consistency, ground_preference");

  if (!allHorses || allHorses.length < 8) {
    throw new Error("Not enough horses in database");
  }

  const allIds = allHorses.map((h) => h.id);

  // Select 8 horses + distance + ground deterministically
  const { selectedIds, distance, ground } = selectRaceField(
    serverSeed,
    "throws.gg",
    raceNumber,
    allIds
  );

  // Get the selected horses' stats
  const selectedHorses = allHorses
    .filter((h) => selectedIds.includes(h.id))
    .map((h) => ({
      id: h.id,
      speed: h.speed,
      stamina: h.stamina,
      form: h.form,
      consistency: h.consistency,
      groundPreference: h.ground_preference as GroundCondition,
    }));

  // Calculate opening odds
  const oddsMap = calculateOddsMonteCarlo(
    selectedHorses,
    distance as RaceDistance,
    ground as GroundCondition,
    serverSeed // Use server seed for deterministic odds
  );

  // Timing
  const now = new Date();
  const bettingOpensAt = now.toISOString();
  const bettingClosesAt = new Date(
    now.getTime() + RACE_TIMING.BETTING_WINDOW * 1000
  ).toISOString();

  // Insert race
  const { data: race, error: raceError } = await db()
    .from("races")
    .insert({
      race_number: raceNumber,
      status: "betting",
      distance,
      ground,
      server_seed: serverSeed,
      server_seed_hash: serverSeedHash,
      client_seed: "throws.gg",
      nonce: raceNumber,
      betting_opens_at: bettingOpensAt,
      betting_closes_at: bettingClosesAt,
    })
    .select()
    .single();

  if (raceError) {
    if (raceError.code === "23505") {
      // Duplicate — another tick created it
      const { data: existing } = await db()
        .from("races")
        .select("*")
        .eq("race_number", raceNumber)
        .single();
      if (existing) return existing;
    }
    throw new Error(`Failed to create race: ${raceError.message}`);
  }

  // Insert entries with gate positions and odds
  // snapshot_form captures the horse's form at race-creation time so the
  // provably-fair verification endpoint can replay the exact same inputs
  // even after the horse's form has been mutated by subsequent races.
  const entries = selectedIds.map((horseId, i) => {
    const odds = oddsMap.get(horseId);
    const snap = selectedHorses.find((h) => h.id === horseId);
    return {
      race_id: race.id,
      horse_id: horseId,
      gate_position: i + 1,
      opening_odds: odds?.winOdds || 5.0,
      current_odds: odds?.winOdds || 5.0,
      true_probability: odds?.probability || 0.125,
      place_odds: odds?.placeOdds || 2.5,
      show_odds: odds?.showOdds || 1.5,
      snapshot_form: snap?.form ?? null,
    };
  });

  await db().from("race_entries").insert(entries);

  return race;
}

export async function closeRace(raceId: string) {
  await db()
    .from("races")
    .update({ status: "closed" })
    .eq("id", raceId)
    .eq("status", "betting");
}

export async function runRace(raceId: string) {
  // Get race + entries + horses
  const { data: race } = await db()
    .from("races")
    .select("server_seed, client_seed, nonce, distance, ground")
    .eq("id", raceId)
    .single();

  if (!race) throw new Error("Race not found");

  const { data: entries } = await db()
    .from("race_entries")
    .select("horse_id, snapshot_form, horses(id, speed, stamina, form, consistency, ground_preference)")
    .eq("race_id", raceId);

  if (!entries) throw new Error("No entries found");

  // Use the form value snapshotted at race-creation time — NOT the horse's
  // current form — so the simulation remains verifiable after subsequent
  // races mutate the horse's form.
  const horses = entries.map((e) => {
    const h = e.horses as unknown as {
      id: number;
      speed: number;
      stamina: number;
      form: number;
      consistency: number;
      ground_preference: string;
    };
    return {
      id: h.id,
      speed: h.speed,
      stamina: h.stamina,
      form: (e.snapshot_form as number | null) ?? h.form,
      consistency: h.consistency,
      groundPreference: h.ground_preference as GroundCondition,
    };
  });

  // Run simulation
  const result = simulateRace(
    race.server_seed,
    race.client_seed,
    race.nonce,
    horses,
    race.distance as RaceDistance,
    race.ground as GroundCondition
  );

  // Update race status
  await db()
    .from("races")
    .update({
      status: "racing",
      race_starts_at: new Date().toISOString(),
    })
    .eq("id", raceId);

  // Write finish positions to entries — batch update with error checking
  for (const finish of result.finishOrder) {
    const { error, count } = await db()
      .from("race_entries")
      .update({
        power_score: finish.powerScore,
        finish_position: finish.finishPosition,
        margin: finish.margin,
      })
      .eq("race_id", raceId)
      .eq("horse_id", finish.horseId);

    if (error) {
      console.error(`Failed to update horse ${finish.horseId} position:`, error.message);
    }
  }

  // Verify all entries have positions
  const { data: check } = await db()
    .from("race_entries")
    .select("horse_id, finish_position")
    .eq("race_id", raceId)
    .is("finish_position", null);

  if (check && check.length > 0) {
    console.error(`Race ${raceId}: ${check.length} entries missing finish positions. Fixing...`);
    // Assign remaining positions
    let nextPos = 9;
    for (const missing of check) {
      nextPos--;
      await db()
        .from("race_entries")
        .update({ finish_position: nextPos, power_score: 0, margin: 99 })
        .eq("race_id", raceId)
        .eq("horse_id", missing.horse_id);
    }
  }

  return result;
}

// Commission model lives entirely in the DB now (tier-based revshare).
// See migration 014_affiliate_tiers.sql — accrue_referral_reward() RPC
// looks up the referrer's current tier and applies the right rate.
// We still import HOUSE_EDGE so it stays referenced if the commission
// logic ever moves back to the application layer.
void HOUSE_EDGE;

export async function settleRace(raceId: string) {
  // Get the winner
  const { data: winner } = await db()
    .from("race_entries")
    .select("horse_id")
    .eq("race_id", raceId)
    .eq("finish_position", 1)
    .single();

  if (!winner) throw new Error("No winner found");

  // Get server seed for settlement
  const { data: race } = await db()
    .from("races")
    .select("server_seed, race_number")
    .eq("id", raceId)
    .single();

  if (!race) throw new Error("Race not found");

  // Settle via RPC
  const { error } = await db().rpc("settle_race", {
    p_race_id: raceId,
    p_winning_horse_id: winner.horse_id,
    p_server_seed: race.server_seed,
  });

  if (error) throw new Error(`Settlement failed: ${error.message}`);

  // Track race settlement + individual bet outcomes
  try {
    await trackRaceSettlement(raceId, race.race_number);
  } catch {
    // Non-fatal
  }

  // Credit referral rewards for every bet in this race
  try {
    await creditReferralRewards(raceId);
  } catch (err) {
    console.error("Failed to credit referral rewards:", err);
    // Non-fatal — race still settles successfully
  }

  // Update horse stats
  await updateHorseStats(raceId);

  // Generate AI commentary + post to chat
  try {
    await postRaceCommentary(raceId);
  } catch {
    // Non-fatal — fallback template used if API fails
  }

  // Post big wins to chat
  try {
    await postRaceBigWins(raceId);
  } catch {
    // Non-fatal
  }
}

/**
 * Track race settlement analytics — fires a race_completed event and
 * individual bet_settled events for each bettor.
 */
async function trackRaceSettlement(raceId: string, raceNumber: number) {
  // Get the settled race data
  const { data: raceData } = await db()
    .from("races")
    .select("total_bet_amount, total_payout, house_profit, bet_count, distance, ground, winning_horse_id")
    .eq("id", raceId)
    .single();

  if (!raceData) return;

  const handle = parseFloat(String(raceData.total_bet_amount));
  const totalPayout = parseFloat(String(raceData.total_payout));
  const ggr = parseFloat(String(raceData.house_profit));
  const holdPct = handle > 0 ? (ggr / handle) * 100 : 0;

  // Fire race_completed event (attributed to a system user)
  trackServer("system", "race_completed", {
    race_id: raceId,
    race_number: raceNumber,
    total_handle: handle,
    total_payout: totalPayout,
    ggr,
    hold_percent: Math.round(holdPct * 100) / 100,
    num_bettors: raceData.bet_count,
    distance: raceData.distance,
    ground: raceData.ground,
    winning_horse_id: raceData.winning_horse_id,
  });

  // Get all settled bets for individual bet_settled events
  const { data: bets } = await db()
    .from("race_bets")
    .select("id, user_id, amount, locked_odds, payout, status, bet_type, horse_id, created_at, settled_at")
    .eq("race_id", raceId)
    .in("status", ["won", "lost"]);

  if (!bets) return;

  for (const bet of bets) {
    const stake = parseFloat(String(bet.amount));
    const payout = parseFloat(String(bet.payout || 0));
    const profit = payout - stake;
    const settledAt = bet.settled_at ? new Date(bet.settled_at).getTime() : Date.now();
    const createdAt = new Date(bet.created_at).getTime();
    const settlementTime = settledAt - createdAt;

    trackServer(bet.user_id, "bet_settled", {
      race_id: raceId,
      race_number: raceNumber,
      bet_id: bet.id,
      bet_type: bet.bet_type,
      horse_id: bet.horse_id,
      amount_usd: stake,
      odds: parseFloat(String(bet.locked_odds)),
      payout_usd: payout,
      result: bet.status,
      profit_usd: profit,
      settlement_time_ms: settlementTime,
    });

    // Update user properties with running totals
    const { data: user } = await db()
      .from("users")
      .select("total_wagered, total_profit, balance, bonus_balance")
      .eq("id", bet.user_id)
      .single();

    if (user) {
      const totalWagered = parseFloat(String(user.total_wagered));
      const depositTier = totalWagered >= 10000 ? "whale"
        : totalWagered >= 1000 ? "medium"
        : totalWagered >= 100 ? "small"
        : "micro";

      identifyServer(bet.user_id, {
        lifetime_wagered: totalWagered,
        lifetime_profit: parseFloat(String(user.total_profit)),
        current_balance: parseFloat(String(user.balance)),
        bonus_balance: parseFloat(String(user.bonus_balance || 0)),
        deposit_tier: depositTier,
        last_bet_at: new Date().toISOString(),
      });
    }
  }
}

/**
 * Accrue referral rewards for every settled bet in this race. Each reward
 * is logged via the accrue_referral_reward RPC which:
 *   - Uses the referrer's current affiliate tier (35/40/45% of NGR)
 *   - Skips bets under $0.50 and non-positive NGR (wins)
 *   - Sets status=pending if the referred user hasn't hit their 3x activation
 *   - Sets status=held otherwise (ready for weekly rollup)
 *
 * Also calls check_referral_activation per user to flip the gate when they
 * cross the 3x threshold, which releases their backlog of pending rewards.
 */
async function creditReferralRewards(raceId: string) {
  // Get all settled bets from this race with bettor's referrer info
  const { data: bets } = await db()
    .from("race_bets")
    .select("id, user_id, amount, payout, status, users!inner(referrer_id)")
    .eq("race_id", raceId)
    .in("status", ["won", "lost"]);

  if (!bets || bets.length === 0) return;

  // Track unique referred users so we only trigger activation once per user
  const referredUserIds = new Set<string>();

  for (const bet of bets) {
    const user = bet.users as unknown as { referrer_id: string | null };
    const referrerId = user?.referrer_id;
    if (!referrerId) continue;

    referredUserIds.add(bet.user_id);

    const stake = parseFloat(String(bet.amount));
    const payout = parseFloat(String(bet.payout || 0));
    // NGR per bet = stake the house kept (losing bet) = stake - payout.
    // Winning bets have NGR <= 0 and the RPC skips them.
    const ngr = stake - payout;

    await db().rpc("accrue_referral_reward", {
      p_referrer_id: referrerId,
      p_referred_id: bet.user_id,
      p_race_bet_id: bet.id,
      p_stake: stake,
      p_ngr: ngr,
    });
  }

  // After accrual, check activation gate for each referred user
  // (parallel — each RPC is self-contained)
  await Promise.all(
    Array.from(referredUserIds).map((uid) =>
      db().rpc("check_referral_activation", { p_user_id: uid }).then(() => {})
    )
  );
}

async function updateHorseStats(raceId: string) {
  const { data: race } = await db()
    .from("races")
    .select("race_number, distance, ground")
    .eq("id", raceId)
    .single();

  const { data: entries } = await db()
    .from("race_entries")
    .select("horse_id, finish_position, power_score, gate_position")
    .eq("race_id", raceId);

  if (!entries || !race) return;

  for (const entry of entries) {
    const pos = entry.finish_position;
    if (!pos) continue;

    // Form adjustment based on finish
    let formDelta = 0;
    if (pos === 1) formDelta = 5;
    else if (pos === 2) formDelta = 3;
    else if (pos === 3) formDelta = 1;
    else if (pos <= 5) formDelta = -1;
    else formDelta = -3;

    // Speed rating from power score (normalised to 60-120 range)
    const rawPower = entry.power_score ? parseFloat(String(entry.power_score)) : 80;
    const speedRating = Math.round(Math.max(60, Math.min(120, rawPower * 1.1)));

    // Get current horse data
    const { data: horse } = await db()
      .from("horses")
      .select("form, career_races, career_wins, career_places, career_shows, last_5_results, distance_record, ground_record, gate_record, speed_rating, avg_finish")
      .eq("id", entry.horse_id)
      .single();

    if (!horse) continue;

    const newForm = Math.max(1, Math.min(100, horse.form + formDelta));
    const last5 = (horse.last_5_results as { raceNumber: number; position: number }[]) || [];
    const updated5 = [
      { raceNumber: race.race_number, position: pos },
      ...last5.slice(0, 4),
    ];

    // Update distance record
    const distRecord = (horse.distance_record as Record<string, { starts: number; wins: number; places: number }>) || {};
    const distKey = String(race.distance);
    if (!distRecord[distKey]) distRecord[distKey] = { starts: 0, wins: 0, places: 0 };
    distRecord[distKey].starts++;
    if (pos === 1) distRecord[distKey].wins++;
    if (pos <= 3) distRecord[distKey].places++;

    // Update ground record
    const groundRecord = (horse.ground_record as Record<string, { starts: number; wins: number; places: number }>) || {};
    const groundKey = race.ground;
    if (!groundRecord[groundKey]) groundRecord[groundKey] = { starts: 0, wins: 0, places: 0 };
    groundRecord[groundKey].starts++;
    if (pos === 1) groundRecord[groundKey].wins++;
    if (pos <= 3) groundRecord[groundKey].places++;

    // Update gate record
    const gateRecord = (horse.gate_record as Record<string, { starts: number; wins: number }>) || {};
    const gateKey = String(entry.gate_position);
    if (!gateRecord[gateKey]) gateRecord[gateKey] = { starts: 0, wins: 0 };
    gateRecord[gateKey].starts++;
    if (pos === 1) gateRecord[gateKey].wins++;

    // Rolling average finish position
    const totalRaces = horse.career_races + 1;
    const newAvgFinish = Math.round(((horse.avg_finish || 4.5) * horse.career_races + pos) / totalRaces * 100) / 100;

    // Rolling speed rating (weighted toward recent)
    const newSpeedRating = Math.round(((horse.speed_rating || 70) * 0.7 + speedRating * 0.3));

    await db()
      .from("horses")
      .update({
        form: newForm,
        career_races: totalRaces,
        career_wins: horse.career_wins + (pos === 1 ? 1 : 0),
        career_places: horse.career_places + (pos === 2 ? 1 : 0),
        career_shows: horse.career_shows + (pos === 3 ? 1 : 0),
        last_5_results: updated5,
        distance_record: distRecord,
        ground_record: groundRecord,
        gate_record: gateRecord,
        speed_rating: newSpeedRating,
        avg_finish: newAvgFinish,
        days_since_last_race: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.horse_id);
  }
}

async function postRaceResult(raceId: string) {
  const { data: race } = await db()
    .from("races")
    .select("race_number")
    .eq("id", raceId)
    .single();

  const { data: entries } = await db()
    .from("race_entries")
    .select("finish_position, horse_id, margin, horses(name)")
    .eq("race_id", raceId)
    .order("finish_position", { ascending: true });

  if (!race || !entries || entries.length === 0) return;

  const top3 = entries.slice(0, 3);
  const winner = top3[0];
  const winnerName = (winner.horses as unknown as { name: string })?.name || "Unknown";
  const secondName = top3[1] ? (top3[1].horses as unknown as { name: string })?.name : "";
  const thirdName = top3[2] ? (top3[2].horses as unknown as { name: string })?.name : "";

  const message = `Race #${race.race_number} — ${winnerName} wins! 2nd: ${secondName}, 3rd: ${thirdName}`;

  await db().from("chat_messages").insert({
    user_id: null,
    username: "throws.gg",
    message,
    is_system: true,
  });
}

async function postRaceBigWins(raceId: string) {
  const { data: race } = await db()
    .from("races")
    .select("race_number")
    .eq("id", raceId)
    .single();

  if (!race) return;

  // Find winning bets with user info
  const { data: wonBets } = await db()
    .from("race_bets")
    .select("payout, locked_odds, user_id, horse_id, users(username), horses(name)")
    .eq("race_id", raceId)
    .eq("status", "won")
    .order("payout", { ascending: false });

  if (!wonBets || wonBets.length === 0) return;

  for (const bet of wonBets) {
    const payout = parseFloat(String(bet.payout));
    if (payout < 10) continue; // Only announce $10+ wins

    const username = (bet.users as unknown as { username: string })?.username || "anon";
    const horseName = (bet.horses as unknown as { name: string })?.name || "Unknown";
    const odds = parseFloat(String(bet.locked_odds));

    const message = payout >= 500
      ? `💰 ${username} hit $${payout.toFixed(2)} on ${horseName} at ${odds.toFixed(2)}x — ABSOLUTE UNIT`
      : payout >= 50
        ? `${username} won $${payout.toFixed(2)} on ${horseName} at ${odds.toFixed(2)}x 🔥`
        : `${username} cashed $${payout.toFixed(2)} on ${horseName} 🏇`;

    await db().from("chat_messages").insert({
      user_id: null,
      username: "throws.gg",
      message,
      is_system: true,
    });
  }
}

// ======= MAIN TICK =======

let raceTickInProgress = false;

export async function tick() {
  if (raceTickInProgress) return { action: "skipped", status: "tick_in_progress" };
  raceTickInProgress = true;

  try {
    return await tickInner();
  } finally {
    raceTickInProgress = false;
  }
}

async function tickInner() {
  const now = Date.now();

  // Admin pause check — only blocks new race creation, never blocks settling in-progress races
  const paused = await isRacesPaused();

  let race = await getCurrentRace();

  if (!race) {
    if (paused) {
      return { action: "paused", status: "races_paused" };
    }
    race = await createNextRace();
    return { action: "created", raceId: race.id, status: "betting" };
  }

  const bettingClosesAt = new Date(race.betting_closes_at).getTime();
  const closedEndsAt = bettingClosesAt + RACE_TIMING.CLOSED_DURATION * 1000;
  const raceEndsAt = closedEndsAt + RACE_TIMING.RACE_DURATION * 1000;
  const resultsEndAt = raceEndsAt + RACE_TIMING.RESULTS_DURATION * 1000;

  const status: RaceStatus = race.status;

  if (status === "betting" && now >= bettingClosesAt) {
    await closeRace(race.id);
    return { action: "closed", raceId: race.id, status: "closed" };
  }

  if (status === "closed" && now >= closedEndsAt) {
    await runRace(race.id);
    return { action: "racing", raceId: race.id, status: "racing" };
  }

  if (status === "racing" && now >= raceEndsAt) {
    await settleRace(race.id);
    return { action: "settled", raceId: race.id, status: "settled" };
  }

  if (status === "settled" && now >= resultsEndAt) {
    if (paused) {
      return { action: "paused", raceId: race.id, status: "races_paused" };
    }
    const newRace = await createNextRace();
    return { action: "new_race", raceId: newRace.id, status: "betting" };
  }

  return { action: "waiting", raceId: race.id, status };
}

async function isRacesPaused(): Promise<boolean> {
  try {
    const { data } = await db()
      .from("system_flags")
      .select("value")
      .eq("key", "races_paused")
      .maybeSingle();
    return data?.value === true;
  } catch {
    return false;
  }
}
