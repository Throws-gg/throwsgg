import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, isDevMode } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/admin";

interface SignupBonusResult {
  granted: boolean;
  reason?: string;
  bonus_amount?: number;
  wagering_required?: number;
  expires_at?: string;
  signups_remaining?: number;
}

/**
 * POST /api/auth/sync
 * Called after Privy login. Creates the DB user if it doesn't exist,
 * or returns the existing user. This is the bridge between Privy auth
 * and our user table.
 *
 * Body (all optional):
 *   - referralCode: string — captured from /r/[code] landing, stored in localStorage
 *   - fingerprint: string — FingerprintJS visitorId for abuse detection
 *   - email: string — user's Privy email, used for dedup with normalized_email
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  // In dev mode, this route isn't used (dev toolbar creates users directly)
  if (isDevMode()) {
    return NextResponse.json(
      { error: "Use /api/dev/user in dev mode" },
      { status: 400 }
    );
  }

  // Verify Privy token
  const authHeader = request.headers.get("authorization");
  const verified = await verifyAuthToken(authHeader);

  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const privyId = verified.userId;

  // Parse body once — we'll use several fields
  let body: {
    referralCode?: string | null;
    fingerprint?: string | null;
    email?: string | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine
  }

  const referralCode = body.referralCode || null;
  const fingerprint = body.fingerprint || null;
  const email = body.email || null;
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    null;

  try {
    // Check if user exists
    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("privy_id", privyId)
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
    if (referralCode) {
      const normalizedCode = referralCode.trim().toUpperCase();
      const { data: referrer } = await supabase
        .from("users")
        .select("id")
        .eq("referral_code", normalizedCode)
        .single();
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    // Generate a unique referral code for the new user
    const { data: newCode, error: codeError } = await supabase.rpc("generate_referral_code");
    if (codeError || !newCode) {
      console.error("Failed to generate referral code:", codeError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Create new user
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const username = `degen_${randomSuffix}`;

    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        privy_id: privyId,
        username,
        balance: 0,
        role: "player",
        referral_code: newCode,
        referrer_id: referrerId,
      })
      .select()
      .single();

    if (error || !newUser) {
      console.error("Failed to create user:", error);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    // Attempt to grant the signup bonus. This is atomic — the RPC increments
    // the global counter, writes bonus_balance + wagering_remaining + expiry,
    // and rejects if the cap is reached, fingerprint is a dupe, email is a
    // dupe, or the bonus is disabled.
    let bonusResult: SignupBonusResult = { granted: false, reason: "not_attempted" };
    try {
      const { data, error: bonusErr } = await supabase.rpc("grant_signup_bonus", {
        p_user_id: newUser.id,
        p_email: email,
        p_fingerprint: fingerprint,
        p_ip: clientIp,
      });
      if (bonusErr) {
        console.error("Signup bonus grant failed:", bonusErr);
      } else if (data) {
        bonusResult = data as SignupBonusResult;
      }
    } catch (err) {
      console.error("Signup bonus RPC error:", err);
    }

    // Re-fetch the user to get the updated bonus_balance etc.
    const { data: freshUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", newUser.id)
      .single();

    const u = freshUser || newUser;

    return NextResponse.json({
      user: {
        id: u.id,
        username: u.username,
        balance: parseFloat(u.balance),
        bonusBalance: parseFloat(u.bonus_balance || 0),
        wageringRemaining: parseFloat(u.wagering_remaining || 0),
        bonusExpiresAt: u.bonus_expires_at,
        totalWagered: parseFloat(u.total_wagered),
        totalProfit: parseFloat(u.total_profit),
        referralCode: u.referral_code,
      },
      isNew: true,
      signupBonus: bonusResult,
    });
  } catch (error) {
    console.error("Auth sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
