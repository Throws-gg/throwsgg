"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";

export interface ForeignTokenBalance {
  mint: string;
  symbol: string;
  amount: number;
  rawAmount: string;
  decimals: number;
}

/**
 * Polls the deposit API every 15 seconds to detect new deposits.
 * When new funds arrive on-chain, credits the user's game balance.
 * Also surfaces any non-USDC SPL tokens detected in the wallet so the UI
 * can warn the user before funds get stuck silently.
 */
export function useDepositMonitor(walletAddress: string | null) {
  const userId = useUserStore((s) => s.userId);
  const authedFetch = useAuthedFetch();
  const [lastDeposit, setLastDeposit] = useState<{
    amount: number;
    timestamp: number;
  } | null>(null);
  const [foreignTokens, setForeignTokens] = useState<ForeignTokenBalance[]>([]);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkDeposits = useCallback(async () => {
    if (!userId || !walletAddress || checking) return;

    setChecking(true);
    try {
      // userId + walletAddress are derived server-side from the authed Privy session.
      // The walletAddress prop is kept for UI gating (only poll when we know a wallet exists).
      const res = await authedFetch("/api/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (data.status === "deposited" && data.credited > 0) {
        // Update game balance
        useUserStore.getState().setBalance(data.newBalance);
        setLastDeposit({
          amount: data.credited,
          timestamp: Date.now(),
        });
      }

      if (Array.isArray(data.foreignTokens)) {
        setForeignTokens(data.foreignTokens);
      }
    } catch {
      // Silently retry next interval
    }
    setChecking(false);
  }, [userId, walletAddress, checking, authedFetch]);

  // Manual trigger
  const refresh = useCallback(() => {
    checkDeposits();
  }, [checkDeposits]);

  useEffect(() => {
    if (!userId || !walletAddress) return;

    // Initial check
    checkDeposits();

    // Poll every 15 seconds
    intervalRef.current = setInterval(checkDeposits, 15_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId, walletAddress]);

  return { lastDeposit, checking, refresh, foreignTokens };
}
