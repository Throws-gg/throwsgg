import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth/verify-request";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWalletDelegated } from "@/lib/auth/privy";
import { trackServer } from "@/lib/analytics/posthog-server";

/**
 * POST /api/wallet/delegate-confirm
 *
 * Called by the client after the user clicks through the Privy
 * delegateWallet() modal. We verify with Privy's server SDK that the
 * delegation actually happened (don't trust the client's "yeah I did it"),
 * then stamp users.sweep_delegated_at.
 *
 * Idempotent — if already delegated, returns the existing timestamp.
 * Also clears sweep_revoked_at if the user re-delegates after revoking.
 */
export async function POST(request: NextRequest) {
  const authed = await verifyRequest(request);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Verify with Privy that the delegation actually exists.
  const live = await isWalletDelegated(authed.privyId);
  if (!live.delegated) {
    return NextResponse.json(
      { error: "delegation_not_found", message: "Delegation not yet visible to Privy. Try again." },
      { status: 409 }
    );
  }

  // Idempotent stamp.
  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from("users")
    .update({
      sweep_delegated_at: now,
      sweep_revoked_at: null, // clear if user is re-delegating after a revoke
    })
    .eq("id", authed.dbUserId)
    .select("sweep_delegated_at")
    .single();

  trackServer(authed.dbUserId, "sweep_delegated", {
    wallet_address: live.walletAddress,
  });

  return NextResponse.json({
    delegated: true,
    delegatedAt: updated?.sweep_delegated_at ?? now,
  });
}
