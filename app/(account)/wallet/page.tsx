"use client";

import { useState, useEffect, useCallback } from "react";
import { useUserStore } from "@/stores/userStore";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { DepositPanel } from "@/components/wallet/DepositPanel";
import { WithdrawPanel } from "@/components/wallet/WithdrawPanel";
import { DailyBonusCard } from "@/components/bonus/DailyBonusCard";
import { RakebackCard } from "@/components/bonus/RakebackCard";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  status: string;
  createdAt: string;
}

export default function WalletPage() {
  const { userId, balance } = useUserStore();
  const authedFetch = useAuthedFetch();
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [txs, setTxs] = useState<Transaction[]>([]);

  const fetchTxs = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await authedFetch(`/api/transactions?limit=15`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.transactions)) {
        setTxs(data.transactions.map((t: Record<string, unknown>) => ({
          id: String(t.id || ""),
          type: String(t.type || ""),
          amount: parseFloat(String(t.amount || 0)),
          balanceAfter: parseFloat(String(t.balance_after || t.balanceAfter || 0)),
          status: String(t.status || ""),
          createdAt: String(t.created_at || t.createdAt || ""),
        })));
      }
    } catch { /* ignore */ }
  }, [userId, authedFetch]);

  useEffect(() => {
    fetchTxs();
  }, [fetchTxs]);

  // Re-fetch on window focus so a fresh deposit/withdraw shows up when the
  // user comes back to the tab.
  useEffect(() => {
    const onFocus = () => fetchTxs();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchTxs]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Balance card */}
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#14141f] to-[#0e0e16] p-6">
          <div className="absolute top-0 right-0 w-40 h-40 bg-violet/5 rounded-full blur-3xl -mr-10 -mt-10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-magenta/5 rounded-full blur-3xl -ml-8 -mb-8" />
          <div className="relative">
            <p className="text-xs text-white/40 uppercase tracking-widest font-medium mb-2">
              Available Balance
            </p>
            <p className="text-5xl font-black font-mono tabular-nums text-white tracking-tight">
              ${balance.toFixed(2)}
            </p>
          </div>
        </div>

        {userId && (
          <DailyBonusCard
            onDepositClick={() => {
              setActiveTab("deposit");
              // Defer the scroll until after React re-renders the deposit panel
              requestAnimationFrame(() => {
                document
                  .getElementById("deposit-panel")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
          />
        )}
        {userId && <RakebackCard />}

        {userId ? (
          <>
            {/* Deposit / Withdraw toggle */}
            <div
              id="deposit-panel"
              className="flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1 scroll-mt-20"
            >
              <button
                onClick={() => setActiveTab("deposit")}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  activeTab === "deposit"
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-white/40 hover:text-white/60"
                )}
              >
                Deposit
              </button>
              <button
                onClick={() => setActiveTab("withdraw")}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  activeTab === "withdraw"
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-white/40 hover:text-white/60"
                )}
              >
                Withdraw
              </button>
            </div>

            {/* Panel */}
            {activeTab === "deposit" ? <DepositPanel /> : <WithdrawPanel />}
          </>
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-8 text-center">
            <p className="text-white/40 text-sm">
              Sign in to manage your wallet
            </p>
          </div>
        )}

        {/* Trust signals */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-center">
            <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">deposits</p>
            <p className="text-xs font-bold text-green">instant</p>
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-center">
            <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">withdrawals</p>
            <p className="text-xs font-bold text-white/70">&lt; 24h</p>
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2.5 text-center">
            <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1">network</p>
            <p className="text-xs font-bold text-violet">solana</p>
          </div>
        </div>

        {/* Transactions */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">
            Recent Transactions
          </h2>
          {txs.length > 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] divide-y divide-white/[0.04]">
              {txs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold",
                      tx.type === "deposit" && "bg-green/10 text-green",
                      tx.type === "withdrawal" && "bg-red/10 text-red",
                      tx.type === "bet" && "bg-white/[0.04] text-white/40",
                      tx.type === "payout" && "bg-violet/10 text-violet",
                      tx.type === "bonus" && "bg-gold/10 text-gold",
                      (!["deposit", "withdrawal", "bet", "payout", "bonus"].includes(tx.type)) && "bg-white/[0.04] text-white/40"
                    )}>
                      {tx.type === "deposit" ? "+" : tx.type === "withdrawal" ? "-" : tx.type === "payout" ? "W" : tx.type === "bonus" ? "B" : "•"}
                    </div>
                    <div>
                      <p className="text-xs text-white/70 font-medium capitalize">{tx.type}</p>
                      <p className="text-[10px] text-white/25">
                        {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold font-mono tabular-nums",
                      tx.amount > 0 ? "text-green" : tx.amount < 0 ? "text-red/70" : "text-white/50"
                    )}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount < 0 ? "-" : ""}${Math.abs(tx.amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-8 text-center">
              <p className="text-white/30 text-xs">no transactions yet</p>
              <p className="text-[10px] text-white/20 mt-1">deposit to start betting</p>
            </div>
          )}
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">
            Common Questions
          </h2>
          <div className="space-y-2">
            {[
              { q: "How fast are deposits?", a: "USDC deposits are detected after the funds are swept into custody. Card purchases process in ~2 minutes via MoonPay." },
              { q: "How do withdrawals work?", a: "Withdrawals are manually reviewed and processed within 24 hours to your connected Solana wallet." },
              { q: "What tokens can I deposit?", a: "USDC on Solana. SOL deposits are paused and will not credit automatically." },
              { q: "Is there a minimum deposit?", a: "$1 for crypto. $25 for card purchases (MoonPay minimum)." },
            ].map((faq, i) => (
              <div key={i} className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3">
                <p className="text-xs text-white/60 font-medium">{faq.q}</p>
                <p className="text-[11px] text-white/35 mt-1">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
