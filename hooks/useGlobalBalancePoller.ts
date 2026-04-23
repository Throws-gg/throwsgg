"use client";

import { useEffect, useRef } from "react";
import { useUserStore } from "@/stores/userStore";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";

/**
 * Global balance + deposit poller.
 *
 * Mounted once in the Providers tree so balance auto-refreshes no matter
 * which page the user is on. Without this, users on /racing / /profile /
 * /horses won't see their deposit credit until they navigate away and back.
 *
 * Two things happen on each tick:
 *   1. POST /api/wallet/deposit  — idempotent; checks for new on-chain
 *      deposits and credits them. Cheap no-op when no new signatures.
 *   2. GET /api/user/me           — pulls fresh balance, bonus_balance,
 *      wagering_remaining, and syncs the store.
 *
 * Interval: 20s. Fast enough that a deposit shows up within ~30s of
 * on-chain confirmation, slow enough that idle users don't hammer the API.
 *
 * Also re-polls on `visibilitychange` (coming back to the tab) so a user
 * who sent a deposit in another tab sees the credit immediately on return.
 */
export function useGlobalBalancePoller() {
  const userId = useUserStore((s) => s.userId);
  const authedFetch = useAuthedFetch();
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        // Check for new deposits first — if one just landed, this credits it,
        // then the /api/user/me call below picks up the fresh balance.
        try {
          const res = await authedFetch("/api/wallet/deposit", {
            method: "POST",
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status === "deposited" && typeof data.newBalance === "number") {
              useUserStore.getState().setBalance(data.newBalance);
            }
          }
        } catch {
          // deposit endpoint may 400 if no wallet linked yet — ignore
        }

        // Then always pull fresh balance + bonus state. Even if the deposit
        // call failed, this will catch race payouts / rakeback claims / daily
        // bonus credits that happened server-side.
        try {
          const res = await authedFetch("/api/user/me");
          if (!res.ok) return;
          const data = await res.json();
          if (cancelled || !data.user) return;
          useUserStore.getState().setBonusState({
            cashBalance: data.user.balance,
            bonusBalance: data.user.bonusBalance ?? 0,
            wageringRemaining: data.user.wageringRemaining ?? 0,
          });
        } catch {
          // retry next tick
        }
      } finally {
        pollingRef.current = false;
      }
    };

    // Initial poll on mount so a fresh page-load doesn't wait 20s.
    poll();

    const interval = setInterval(poll, 20_000);

    // Poll on tab-focus so user who sent a deposit in another tab sees the
    // credit immediately on return.
    const onVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId, authedFetch]);
}
