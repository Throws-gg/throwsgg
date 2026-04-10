import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * GET /api/race/bet/history?limit=50&offset=0
 * Returns the authenticated user's race bet history with horse and race data.
 * Requires auth — userId is derived from the Privy token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Dev-mode fallback still supports userId query param via verifyRequest
  const devUserId = searchParams.get("userId");
  const authed = await verifyRequest(
    request,
    devUserId ? { userId: devUserId } : undefined
  );
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authed.dbUserId;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("race_bets")
    .select(
      "id, amount, locked_odds, potential_payout, payout, status, bet_type, created_at, settled_at, horse_id, race_id, horses(name, slug, color), races(race_number, distance, ground)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Race bet history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bet history" },
      { status: 500 }
    );
  }

  const bets = (data || []).map((b) => {
    const horse = b.horses as unknown as { name: string; slug: string; color: string } | null;
    const race = b.races as unknown as { race_number: number; distance: number; ground: string } | null;
    return {
      id: b.id,
      horseName: horse?.name || "Unknown",
      horseSlug: horse?.slug || "",
      horseColor: horse?.color || "#888",
      betType: b.bet_type || "win",
      odds: parseFloat(b.locked_odds),
      stake: parseFloat(b.amount),
      payout: b.payout ? parseFloat(b.payout) : 0,
      result: b.status as string,
      raceNumber: race?.race_number || 0,
      distance: race?.distance || 1200,
      ground: race?.ground || "good",
      timestamp: b.created_at,
    };
  });

  return NextResponse.json({ bets });
}
