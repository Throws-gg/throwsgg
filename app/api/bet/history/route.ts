import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/bet/history?userId=xxx&limit=50&offset=0
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  const userId = searchParams.get("userId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bets")
    .select(
      "id, bet_type, bet_category, amount, multiplier, payout, status, created_at, settled_at, round_id, rounds(round_number, violet_move, magenta_move, result)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch bet history" },
      { status: 500 }
    );
  }

  return NextResponse.json({ bets: data });
}
