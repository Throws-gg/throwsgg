import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * GET /api/transactions?limit=10
 * Returns the authenticated user's recent ledger entries (deposits,
 * withdrawals, bets, payouts, bonuses, refunds).
 */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, balance_after, status, created_at, metadata")
    .eq("user_id", user.dbUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }

  return NextResponse.json({ transactions: data || [] });
}
