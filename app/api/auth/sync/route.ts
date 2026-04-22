import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, isDevMode } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer, identifyServer } from "@/lib/analytics/posthog-server";
import { verifyFingerprint } from "@/lib/fingerprint/server";
import { sendEmail } from "@/lib/email/send";
import Welcome from "@/lib/email/templates/Welcome";

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

  // In dev mode, this route isn't used (users are created via local tooling).
  if (isDevMode()) {
    return NextResponse.json(
      { error: "auth/sync disabled in dev mode" },
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
    solanaAddress?: string | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine
  }

  const referralCode = body.referralCode || null;
  const fingerprint = body.fingerprint || null;
  const email = body.email || null;
  const solanaAddress =
    typeof body.solanaAddress === "string" && body.solanaAddress.length >= 32 && body.solanaAddress.length <= 44
      ? body.solanaAddress
      : null;
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
      // Backfill wallet_address for users created before this column was populated.
      // Write-once: never overwrite an existing address (prevents an attacker with a
      // valid JWT from pointing their account at someone else's wallet).
      if (!existing.wallet_address && solanaAddress) {
        await supabase
          .from("users")
          .update({ wallet_address: solanaAddress })
          .eq("id", existing.id)
          .is("wallet_address", null);
      }

      // Lazy email backfill: Google OAuth users signed up before the email-
      // plumbing fix have users.email = NULL. Capture it write-once so they
      // start getting transactional + retention emails. normalized_email
      // backfilled in the same update so the self-referral dedup (migration
      // 025) covers them too.
      if (!existing.email && email) {
        const { data: normalised } = await supabase.rpc("normalize_email", {
          raw_email: email,
        });
        await supabase
          .from("users")
          .update({ email, normalized_email: normalised })
          .eq("id", existing.id)
          .is("email", null);

        // Fire the welcome one time for the backfilled user — they never got
        // it. Idempotency key on userId means a retry of /auth/sync won't
        // re-send, and the update-is-null above means this whole branch only
        // runs once per user.
        sendEmail({
          to: email,
          subject: "Welcome to throws.gg",
          category: "lifecycle",
          userId: existing.id,
          idempotencyKey: `welcome:${existing.id}`,
          react: Welcome({
            username: existing.username,
            bonusAmount: parseFloat(existing.bonus_balance || 0) || 20,
            wageringRequired: parseFloat(existing.wagering_remaining || 0) || 60,
            bonusExpiresAt: existing.bonus_expires_at ?? undefined,
          }),
        }).catch((err) =>
          console.error("Backfill welcome email failed:", err)
        );
      }

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

    // Look up referrer if a code was provided.
    // Resolves vanity slugs (e.g. "drake") first, then standard referral codes.
    let referrerId: string | null = null;
    if (referralCode) {
      const { data: resolvedUserId } = await supabase.rpc("resolve_referral_code", {
        p_code: referralCode,
      });
      if (resolvedUserId) {
        referrerId = resolvedUserId;
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
        wallet_address: solanaAddress,
        email: email, // mirror of Privy email — used for retention emails
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

    // Verify the fingerprint server-side before we trust it for bonus dedup.
    // A spoofed/missing fingerprint still lets the user sign up, but they
    // won't receive the $20 bonus — prevents multi-account farming.
    const fpCheck = await verifyFingerprint(fingerprint, clientIp);
    const trustedFingerprint =
      fpCheck.verified && !fpCheck.botDetected ? fpCheck.visitorId : null;

    // Populate signup_fingerprint / signup_ip / normalized_email regardless of
    // whether the bonus is granted. These are used by accrue_simple_referral_reward
    // (self-referral block, migration 025) and any future anti-abuse rules.
    // grant_signup_bonus ALSO writes these, but only on the successful path —
    // we write them up front so the cap-hit / disabled-bonus cases are covered.
    // normalize_email is the SQL function from migration 013 — use it so the
    // dedup axis stays consistent with the bonus grant path.
    const { data: normalised } = await supabase.rpc("normalize_email", {
      raw_email: email,
    });
    await supabase
      .from("users")
      .update({
        signup_fingerprint: trustedFingerprint,
        signup_ip: clientIp,
        normalized_email: normalised,
      })
      .eq("id", newUser.id);

    // Attempt to grant the signup bonus. This is atomic — the RPC increments
    // the global counter, writes bonus_balance + wagering_remaining + expiry,
    // and rejects if the cap is reached, fingerprint is a dupe, email is a
    // dupe, or the bonus is disabled.
    let bonusResult: SignupBonusResult = { granted: false, reason: "not_attempted" };
    try {
      const { data, error: bonusErr } = await supabase.rpc("grant_signup_bonus", {
        p_user_id: newUser.id,
        p_email: email,
        p_fingerprint: trustedFingerprint,
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

    // --- Analytics: track signup ---
    trackServer(u.id, "signup_completed", {
      method: email ? "email" : "wallet",
      has_referral: !!referrerId,
      referral_code: referralCode,
      referrer_id: referrerId,
      signup_bonus_granted: bonusResult.granted,
      signup_bonus_amount: bonusResult.bonus_amount || 0,
      fingerprint_verified: fpCheck.verified,
      fingerprint_reason: fpCheck.reason ?? null,
      fingerprint_bot_detected: fpCheck.botDetected ?? false,
      fingerprint_incognito: fpCheck.incognito ?? false,
    });

    identifyServer(u.id, {
      username: u.username,
      signup_date: new Date().toISOString(),
      acquisition_source: referrerId ? "referral" : "organic",
      referral_code_used: referralCode,
      has_deposited: false,
      deposit_tier: "micro",
      lifetime_wagered: 0,
      lifetime_deposited: 0,
      lifetime_withdrawn: 0,
    });

    if (referrerId) {
      trackServer(referrerId, "referral_signup", {
        referred_user_id: u.id,
        referred_username: u.username,
      });
    }

    // Fire welcome email (best-effort, don't block signup response).
    // If the bonus WASN'T granted (cap reached, dupe fingerprint/email, or
    // disabled), pass bonusAmount=0 so the template suppresses the bonus copy.
    // Otherwise users who miss the first-100 cap get an email promising $20
    // they never received.
    if (email) {
      sendEmail({
        to: email,
        subject: "Welcome to throws.gg",
        category: "lifecycle",
        userId: u.id,
        idempotencyKey: `welcome:${u.id}`,
        react: Welcome({
          username: u.username,
          bonusAmount: bonusResult.granted
            ? bonusResult.bonus_amount
            : 0,
          wageringRequired: bonusResult.granted
            ? bonusResult.wagering_required
            : 0,
          bonusExpiresAt: bonusResult.granted
            ? bonusResult.expires_at
            : undefined,
        }),
      }).catch((err) => console.error("Welcome email failed:", err));
    }

    if (bonusResult.granted) {
      trackServer(u.id, "signup_bonus_granted", {
        bonus_amount: bonusResult.bonus_amount,
        wagering_required: bonusResult.wagering_required,
        expires_at: bonusResult.expires_at,
        signups_remaining: bonusResult.signups_remaining,
      });
    }

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
