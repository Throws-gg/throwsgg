import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

/**
 * POST /api/referrals/claim
 *
 * Claims all pending referral earnings and credits them to the user's balance.
 * Returns the new balance.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body — fine for production Privy auth
  }

  const authed = await verifyRequest(request, body);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authed.dbUserId;

  try {
    // Check current earnings first so we can give a clear error
    const { data: user } = await supabase
      .from("users")
      .select("referral_earnings")
      .eq("id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const earnings = parseFloat(String(user.referral_earnings));
    if (earnings < 0.01) {
      return NextResponse.json(
        { error: "No earnings to claim" },
        { status: 400 }
      );
    }

    // Call the RPC that atomically moves earnings to balance
    const { data: newBalance, error } = await supabase.rpc(
      "claim_referral_earnings",
      { p_user_id: userId }
    );

    if (error) {
      console.error("Claim failed:", error);
      return NextResponse.json(
        { error: "Failed to claim earnings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      claimed: earnings,
      newBalance: parseFloat(String(newBalance)),
    });
  } catch (error) {
    console.error("Claim error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
