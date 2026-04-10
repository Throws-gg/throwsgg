"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/stores/userStore";

/**
 * Dev-only toolbar for testing betting flow.
 * Shows login button, balance controls, bet history.
 * Remove before production.
 */
export function DevToolbar() {
  const { userId, username, balance, activeBets, setUser, setBalance } =
    useUserStore();
  const [loading, setLoading] = useState(false);
  const [betResults, setBetResults] = useState<
    { type: string; amount: number; status: string; payout?: number }[]
  >([]);

  const handleDevLogin = useCallback(async () => {
    setLoading(true);
    try {
      // Pull referral code from localStorage if present
      let referralCode: string | null = null;
      try {
        const stored = localStorage.getItem("throws_referral_code");
        const expiresStr = localStorage.getItem("throws_referral_code_expires");
        const expires = expiresStr ? parseInt(expiresStr, 10) : 0;
        if (stored && expires > Date.now()) {
          referralCode = stored;
        }
      } catch { /* ignore */ }

      const res = await fetch("/api/dev/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testdegen", referralCode }),
      });
      const data = await res.json();
      if (data.user) {
        setUser({
          userId: data.user.id,
          username: data.user.username,
          avatarUrl: null,
          balance: data.user.balance,
          bonusBalance: data.user.bonusBalance ?? 0,
          wageringRemaining: data.user.wageringRemaining ?? 0,
          bonusExpiresAt: data.user.bonusExpiresAt ?? null,
          totalWagered: data.user.totalWagered,
          totalProfit: data.user.totalProfit,
          referralCode: data.user.referralCode,
        });

        // Clear stored referral code after use
        if (referralCode) {
          try {
            localStorage.removeItem("throws_referral_code");
            localStorage.removeItem("throws_referral_code_expires");
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error("Dev login failed:", err);
    }
    setLoading(false);
  }, [setUser]);

  const handleResetBalance = useCallback(async () => {
    if (!userId) return;
    try {
      await fetch("/api/dev/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, balance: 1000 }),
      });
      setBalance(1000);
    } catch (err) {
      console.error("Reset failed:", err);
    }
  }, [userId, setBalance]);

  const handleRefreshBalance = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/dev/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username || "testdegen" }),
      });
      const data = await res.json();
      if (data.user) {
        setBalance(data.user.balance);
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  }, [userId, username, setBalance]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] bg-card/95 backdrop-blur-md border-t border-violet/30 px-4 py-2">
      <div className="flex items-center justify-between max-w-screen-2xl mx-auto gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-violet font-mono uppercase tracking-widest">
            DEV
          </span>

          {!userId ? (
            <Button
              size="sm"
              onClick={handleDevLogin}
              disabled={loading}
              className="bg-violet hover:bg-violet/80 text-white text-xs h-7"
            >
              {loading ? "..." : "dev login ($1,000)"}
            </Button>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {username}
              </span>
              <span className="text-xs font-mono font-bold text-green">
                ${balance.toFixed(2)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshBalance}
                className="text-[10px] h-6 px-2 text-muted-foreground"
              >
                refresh
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleResetBalance}
                className="text-[10px] h-6 px-2 text-muted-foreground"
              >
                reset $1K
              </Button>
            </>
          )}
        </div>

        {/* Active bets */}
        {activeBets.length > 0 && (
          <div className="flex items-center gap-2">
            {activeBets.map((bet) => (
              <div
                key={bet.id}
                className="text-[10px] font-mono bg-secondary rounded px-2 py-0.5"
              >
                <span>{bet.betType === "violet" ? "Bull" : bet.betType === "magenta" ? "Bear" : bet.betType}</span>{" "}
                <span className="text-muted-foreground">
                  ${bet.amount.toFixed(2)}
                </span>{" "}
                <span
                  className={
                    bet.status === "won"
                      ? "text-green"
                      : bet.status === "lost"
                        ? "text-red"
                        : bet.status === "push"
                          ? "text-cyan"
                          : "text-muted-foreground"
                  }
                >
                  {bet.status}
                  {bet.payout ? ` +$${bet.payout.toFixed(2)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
