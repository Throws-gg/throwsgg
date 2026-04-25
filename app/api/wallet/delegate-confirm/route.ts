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

  // Verify with Privy that the signer was actually attached. There's a brief
  // eventual-consistency window after addSigners() resolves — the read-side
  // can take 1-3s to reflect the change. Poll up to ~3s before giving up.
  let live = await isWalletDelegated(authed.privyId);
  for (let i = 0; i < 6 && !live.delegated; i++) {
    await new Promise((r) => setTimeout(r, 500));
    live = await isWalletDelegated(authed.privyId);
  }
  if (!live.delegated) {
    return NextResponse.json(
      { error: "delegation_not_found", message: "Authorization didn't propagate. Try again in a moment." },
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
