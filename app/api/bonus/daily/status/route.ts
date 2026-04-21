import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DAILY_BONUS_MIN_DEPOSIT_USD,
  getDailyBonusTier,
} from "@/lib/bonus/daily";

/**
 * GET /api/bonus/daily/status
 *
 * Returns the daily-bonus eligibility for the authed user:
 *   {
 *     eligible: boolean,
 *     alreadyClaimedToday: boolean,
 *     amount: number,                // dollar amount at this user's current tier
 *     tier: "bronze"|"silver"|...,
 *     nextClaimAt: string (ISO),     // 00:00 UTC tomorrow
 *     depositRequired: number,
 *     currentDeposits: number,
 *     totalWagered: number,
 *   }
 *
 * Read-only. Never mutates state.
 */
export async function GET(request: NextRequest) {
  const authed = await verifyRequest(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_daily_bonus_status", {
    p_user_id: authed.dbUserId,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to load status" },
      { status: 500 }
    );
  }

  // RPC returns JSONB — shape it for the client.
  const totalWagered = Number(data.total_wagered ?? 0);
  const tier = getDailyBonusTier(totalWagered);

  return NextResponse.json({
    eligible: Boolean(data.eligible),
    alreadyClaimedToday: Boolean(data.already_claimed_today),
    amount: Number(data.amount ?? tier.amountUsd),
    tier: data.tier ?? tier.tier,
    tierLabel: tier.label,
    nextClaimAt: data.next_claim_at,
    depositRequired: Number(data.deposit_required ?? DAILY_BONUS_MIN_DEPOSIT_USD),
    currentDeposits: Number(data.current_deposits ?? 0),
    totalWagered,
  });
}
