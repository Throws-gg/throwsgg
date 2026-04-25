import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWalletDelegated } from "@/lib/auth/privy";

/**
 * GET /api/wallet/sweep-status
 *
 * Returns whether the authenticated user has delegated their embedded
 * Solana wallet to our authorization key. The client uses this to gate
 * the deposit flow — undelegated users see a "please authorize" CTA.
 *
 * The "live" answer comes from Privy's server SDK (read-through to their
 * system). We mirror it into users.sweep_delegated_at so we can also
 * gate server-side deposit handling without an extra Privy round-trip.
 */
export async function GET(request: NextRequest) {
  const authed = await verifyRequest(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fast path: read the cached state from our DB.
  const { data: row } = await supabase
    .from("users")
    .select("sweep_delegated_at, sweep_revoked_at")
    .eq("id", authed.dbUserId)
    .single();

  const cachedDelegated =
    !!row?.sweep_delegated_at && !row?.sweep_revoked_at;

  // Authoritative path: ask Privy. Cheap (one API call), and detects
  // revocations the client never told us about.
  const live = await isWalletDelegated(authed.privyId);

  // Reconcile: if Privy says delegated but we have no record, mirror it.
  // If Privy says NOT delegated but we have a record, mark revoked.
  if (live.delegated && !row?.sweep_delegated_at) {
    await supabase
      .from("users")
      .update({ sweep_delegated_at: new Date().toISOString() })
      .eq("id", authed.dbUserId)
      .is("sweep_delegated_at", null);
  } else if (!live.delegated && row?.sweep_delegated_at && !row?.sweep_revoked_at) {
    await supabase
      .from("users")
      .update({ sweep_revoked_at: new Date().toISOString() })
      .eq("id", authed.dbUserId)
      .is("sweep_revoked_at", null);
  }

  return NextResponse.json({
    delegated: live.delegated,
    cachedDelegated,
    walletAddress: live.walletAddress,
  });
}
