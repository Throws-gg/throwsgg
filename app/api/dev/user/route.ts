import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/dev/user
 * Creates or fetches a dev test user with a starting balance.
 * DEV ONLY — remove before production.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const body = await request.json();
  const username = body.username || "testdegen";

  // Check if test user exists
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (existing) {
    return NextResponse.json({
      user: {
        id: existing.id,
        username: existing.username,
        balance: parseFloat(existing.balance),
        bonusBalance: parseFloat(existing.bonus_balance || 0),
        wageringRemaining: parseFloat(existing.wagering_remaining || 0),
        bonusExpiresAt: existing.bonus_expires_at,
        totalWagered: parseFloat(existing.total_wagered),
        totalProfit: parseFloat(existing.total_profit),
        referralCode: existing.referral_code,
      },
    });
  }

  // Look up referrer if a code was provided
  let referrerId: string | null = null;
  if (body.referralCode) {
    const { data: referrer } = await supabase
      .from("users")
      .select("id")
      .eq("referral_code", body.referralCode.trim().toUpperCase())
      .single();
    if (referrer) referrerId = referrer.id;
  }

  // Generate a unique referral code
  const { data: newCode } = await supabase.rpc("generate_referral_code");

  // Create test user
  const { data: newUser, error } = await supabase
    .from("users")
    .insert({
      privy_id: `dev_${username}_${Date.now()}`,
      username,
      balance: 1000, // $1,000 test balance
      role: "player",
      referral_code: newCode,
      referrer_id: referrerId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Failed to create user: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user: {
      id: newUser.id,
      username: newUser.username,
      balance: parseFloat(newUser.balance),
      bonusBalance: parseFloat(newUser.bonus_balance || 0),
      wageringRemaining: parseFloat(newUser.wagering_remaining || 0),
      bonusExpiresAt: newUser.bonus_expires_at,
      totalWagered: parseFloat(newUser.total_wagered),
      totalProfit: parseFloat(newUser.total_profit),
      referralCode: newUser.referral_code,
    },
  });
}

/**
 * PATCH /api/dev/user
 * Reset balance for a test user.
 * DEV ONLY.
 */
export async function PATCH(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const body = await request.json();
  const { userId, balance } = body;

  if (!userId || balance === undefined) {
    return NextResponse.json({ error: "userId and balance required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({ balance, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, balance });
}
