import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCron } from "@/lib/cron/verify";

/**
 * GET /api/cron/affiliate-payouts
 *
 * Runs every Monday at 00:05 UTC. Performs two jobs:
 *   1. Rolls up the previous Mon-Sun week's held rewards into
 *      affiliate_periods rows with a 7-day hold
 *   2. Moves expired-hold periods to 'claimable' and credits the
 *      affiliate's referral_earnings so they can claim it via
 *      /api/referrals/claim
 *
 * Both jobs live in the rollup_weekly_periods RPC.
 */
export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase.rpc("rollup_weekly_periods");

    if (error) {
      console.error("Weekly payout rollup failed:", error);
      return NextResponse.json(
        { error: "Payout rollup failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      periodsCreated: data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Payout rollup error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
