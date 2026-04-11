import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/stats
 *
 * Returns all the numbers the admin dashboard overview needs:
 * - Today's financial stats (volume, GGR, edge)
 * - Active race state (current race, pending bets)
 * - User counts (total, today's new, pending affiliate apps)
 * - Big wins today
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfDayISO = startOfDay.toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

  // ======== Today's bet stats ========
  const { data: todayBets } = await supabase
    .from("race_bets")
    .select("amount, payout, status")
    .gte("created_at", startOfDayISO);

  let todayVolume = 0;
  let todayPayouts = 0;
  let todayBetCount = 0;
  let todaySettledCount = 0;
  for (const b of todayBets || []) {
    todayVolume += parseFloat(b.amount || 0);
    todayBetCount += 1;
    if (b.status === "won" || b.status === "lost") {
      todayPayouts += parseFloat(b.payout || 0);
      todaySettledCount += 1;
    }
  }
  const todayGGR = todayVolume - todayPayouts;
  const todayEdge = todayVolume > 0 ? (todayGGR / todayVolume) * 100 : 0;

  // ======== 7-day bet stats ========
  const { data: weekBets } = await supabase
    .from("race_bets")
    .select("amount, payout, status")
    .gte("created_at", sevenDaysAgo);

  let weekVolume = 0;
  let weekPayouts = 0;
  for (const b of weekBets || []) {
    weekVolume += parseFloat(b.amount || 0);
    if (b.status === "won" || b.status === "lost") {
      weekPayouts += parseFloat(b.payout || 0);
    }
  }
  const weekGGR = weekVolume - weekPayouts;

  // ======== Current race state ========
  const { data: currentRace } = await supabase
    .from("races")
    .select("id, race_number, status, distance, ground, bet_count, total_bet_amount, betting_closes_at")
    .in("status", ["betting", "closed", "racing"])
    .order("race_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ======== User stats ========
  const { count: totalUsers } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  const { count: todayNewUsers } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfDayISO);

  // Online ≈ users with a bet in the last 30 min
  const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: activeBetters } = await supabase
    .from("race_bets")
    .select("user_id")
    .gte("created_at", thirtyMinAgo);
  const onlineUsers = new Set((activeBetters || []).map((b) => b.user_id)).size;

  // ======== Affiliate pipeline ========
  const { count: pendingApps } = await supabase
    .from("affiliate_applications")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { count: activeAffiliates } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .not("referral_code", "is", null)
    .eq("role", "player");

  // ======== Big wins today ========
  const { data: bigWinsToday } = await supabase
    .from("race_bets")
    .select("amount, payout, locked_odds")
    .eq("status", "won")
    .gte("settled_at", startOfDayISO);

  let todayBigWinCount = 0;
  let todayBiggestWin = 0;
  let todayHighestMult = 0;
  for (const b of bigWinsToday || []) {
    const profit = parseFloat(b.payout || 0) - parseFloat(b.amount || 0);
    const odds = parseFloat(b.locked_odds || 0);
    const qualifies = profit >= 100 || odds >= 8;
    if (qualifies) {
      todayBigWinCount += 1;
      if (profit > todayBiggestWin) todayBiggestWin = profit;
      if (odds > todayHighestMult) todayHighestMult = odds;
    }
  }

  // ======== Hot wallet (sum of non-admin user balances) ========
  // This is a rough proxy for "how much we owe in user balances right now"
  const { data: balances } = await supabase
    .from("users")
    .select("balance")
    .eq("role", "player");
  const totalUserBalances = (balances || []).reduce(
    (sum, u) => sum + parseFloat(u.balance || 0),
    0
  );

  // Admin-maintained hot wallet balance (manually updated when topped up)
  const { data: hotWalletFlag } = await supabase
    .from("system_flags")
    .select("value, updated_at")
    .eq("key", "hot_wallet_balance")
    .maybeSingle();

  const hotWalletBalance = parseFloat(String(hotWalletFlag?.value ?? 0));
  const hotWalletRatio = totalUserBalances > 0 ? hotWalletBalance / totalUserBalances : 0;
  const hotWalletUpdated = hotWalletFlag?.updated_at || null;

  return NextResponse.json({
    today: {
      volume: parseFloat(todayVolume.toFixed(2)),
      ggr: parseFloat(todayGGR.toFixed(2)),
      edge: parseFloat(todayEdge.toFixed(2)),
      betCount: todayBetCount,
      settledCount: todaySettledCount,
      bigWinCount: todayBigWinCount,
      biggestWin: parseFloat(todayBiggestWin.toFixed(2)),
      highestMult: parseFloat(todayHighestMult.toFixed(2)),
      newUsers: todayNewUsers || 0,
    },
    week: {
      volume: parseFloat(weekVolume.toFixed(2)),
      ggr: parseFloat(weekGGR.toFixed(2)),
    },
    users: {
      total: totalUsers || 0,
      online: onlineUsers,
      totalBalance: parseFloat(totalUserBalances.toFixed(2)),
    },
    hotWallet: {
      balance: parseFloat(hotWalletBalance.toFixed(2)),
      liability: parseFloat(totalUserBalances.toFixed(2)),
      ratio: parseFloat(hotWalletRatio.toFixed(3)),
      updatedAt: hotWalletUpdated,
    },
    currentRace: currentRace
      ? {
          id: currentRace.id,
          raceNumber: currentRace.race_number,
          status: currentRace.status,
          distance: currentRace.distance,
          ground: currentRace.ground,
          betCount: currentRace.bet_count,
          totalBetAmount: parseFloat(currentRace.total_bet_amount || 0),
          bettingClosesAt: currentRace.betting_closes_at,
        }
      : null,
    affiliates: {
      pendingApplications: pendingApps || 0,
      active: activeAffiliates || 0,
    },
  });
}
