import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/bonus/status
 *
 * Public endpoint. Returns the signup bonus status:
 * - spotsLeft: how many of the free bonus slots remain
 * - enabled: whether the bonus is still active
 * - amount: the bonus dollar amount
 *
 * Used by the landing page to show "X spots left" urgency counter.
 * No auth required — this is public info.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("bonus_config")
      .select("signup_bonus_amount, signup_cap, signups_claimed, enabled")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ spotsLeft: 0, enabled: false, amount: 0 });
    }

    const spotsLeft = Math.max(0, data.signup_cap - data.signups_claimed);

    return NextResponse.json({
      spotsLeft,
      enabled: data.enabled && spotsLeft > 0,
      amount: parseFloat(String(data.signup_bonus_amount)),
      total: data.signup_cap,
      claimed: data.signups_claimed,
    });
  } catch {
    return NextResponse.json({ spotsLeft: 0, enabled: false, amount: 0 });
  }
}
