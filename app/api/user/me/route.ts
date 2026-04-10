import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * GET /api/user/me
 * Returns the authenticated user's profile (balance, username, etc).
 * Requires Privy auth token in Authorization header.
 */
export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, username, balance, total_wagered, total_profit")
    .eq("id", user.dbUserId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: data.id,
      username: data.username,
      balance: parseFloat(data.balance),
      totalWagered: parseFloat(data.total_wagered),
      totalProfit: parseFloat(data.total_profit),
    },
  });
}
