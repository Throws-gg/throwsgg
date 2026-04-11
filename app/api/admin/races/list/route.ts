import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/races/list
 *
 * Returns recent races with financial summary + winner.
 * Query params:
 *   - status: 'all' | 'settled' | 'racing' | 'betting' | 'closed'
 *   - limit: default 50 max 200
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = searchParams.get("status") || "settled";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  const supabase = createAdminClient();

  let query = supabase
    .from("races")
    .select(
      "id, race_number, status, distance, ground, total_bet_amount, total_payout, house_profit, bet_count, winning_horse_id, created_at, settled_at, horses:winning_horse_id ( id, name, slug, color )"
    )
    .order("race_number", { ascending: false })
    .limit(limit);

  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/races/list] error:", error);
    return NextResponse.json({ error: "failed to load races" }, { status: 500 });
  }

  interface Row {
    id: string;
    race_number: number;
    status: string;
    distance: number;
    ground: string;
    total_bet_amount: string | number;
    total_payout: string | number;
    house_profit: string | number;
    bet_count: number;
    winning_horse_id: number | null;
    created_at: string;
    settled_at: string | null;
    horses: { id: number; name: string; slug: string; color: string } | null;
  }

  const races = ((data as unknown as Row[]) || []).map((r) => {
    const volume = parseFloat(String(r.total_bet_amount || 0));
    const payouts = parseFloat(String(r.total_payout || 0));
    const profit = parseFloat(String(r.house_profit || 0));
    const edge = volume > 0 ? (profit / volume) * 100 : 0;
    // Outlier heuristic: house lost > 10% of volume OR won > 50% (unusual distribution)
    const isLoss = profit < 0;
    const isBigLoss = profit < 0 && Math.abs(profit) > volume * 0.1;
    const isBigWin = profit > volume * 0.5;

    return {
      id: r.id,
      raceNumber: r.race_number,
      status: r.status,
      distance: r.distance,
      ground: r.ground,
      volume,
      payouts,
      profit,
      edge: parseFloat(edge.toFixed(2)),
      betCount: r.bet_count,
      winnerId: r.winning_horse_id,
      winnerName: r.horses?.name || null,
      winnerColor: r.horses?.color || null,
      createdAt: r.created_at,
      settledAt: r.settled_at,
      isLoss,
      isBigLoss,
      isBigWin,
    };
  });

  // Aggregates for stat bar
  const settled = races.filter((r) => r.status === "settled");
  const agg = settled.reduce(
    (acc, r) => {
      acc.volume += r.volume;
      acc.profit += r.profit;
      acc.count += 1;
      return acc;
    },
    { volume: 0, profit: 0, count: 0 }
  );
  const avgEdge = agg.volume > 0 ? (agg.profit / agg.volume) * 100 : 0;

  return NextResponse.json({
    races,
    summary: {
      count: agg.count,
      volume: parseFloat(agg.volume.toFixed(2)),
      profit: parseFloat(agg.profit.toFixed(2)),
      avgEdge: parseFloat(avgEdge.toFixed(2)),
    },
  });
}
