"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { useUserStore } from "@/stores/userStore";
import type { RakebackTier } from "@/lib/rakeback/tiers";

interface StatusResponse {
  tier: RakebackTier;
  tierLabel: string;
  tierPct: number;
  effectivePct: number;
  claimable: number;
  lifetime: number;
  totalWagered: number;
  edgeRate: number;
  lastClaimAt: string | null;
  nextTier: {
    tier: RakebackTier;
    label: string;
    tierPct: number;
    effectivePct: number;
    wageredToReach: number;
    threshold: number;
  } | null;
}

interface ClaimResponse {
  claimed: boolean;
  reason?: string;
  amount: number;
  newBalance?: number;
  tier?: RakebackTier;
  tierLabel?: string;
  lifetime?: number;
}

const TIER_ACCENT: Record<RakebackTier, string> = {
  bronze: "text-amber-400/80",
  silver: "text-slate-300/80",
  gold: "text-yellow-400/90",
  platinum: "text-cyan-300/90",
  diamond: "text-fuchsia-300/90",
};

export function RakebackCard({ compact = false }: { compact?: boolean }) {
  const authedFetch = useAuthedFetch();
  const userId = useUserStore((s) => s.userId);
  const setBalance = useUserStore((s) => s.setBalance);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await authedFetch("/api/rakeback/status");
      if (!res.ok) return;
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
    } catch {
      // silent — card is non-critical
    } finally {
      setLoading(false);
    }
  }, [authedFetch, userId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Re-poll status after a claim so claimable zeros out and lifetime updates.
  const handleClaim = useCallback(async () => {
    if (!userId || claiming) return;
    if (!status || status.claimable <= 0) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await authedFetch("/api/rakeback/claim", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as ClaimResponse;

      if (!data.claimed) {
        setError("Nothing to claim yet.");
        await loadStatus();
        return;
      }

      if (typeof data.newBalance === "number") {
        setBalance(data.newBalance);
      }
      setJustClaimed(data.amount);
      await loadStatus();
    } catch {
      setError("Couldn't claim right now. Try again.");
    } finally {
      setClaiming(false);
    }
  }, [authedFetch, claiming, loadStatus, setBalance, status, userId]);

  // Fill the bar from the current tier's floor to the next tier's floor.
  // The API sends next.threshold (upper) and wageredToReach (delta), and we
  // know totalWagered — so the current floor is totalWagered + wageredToReach - threshold's span.
  // Simpler: derive the current-tier floor from the hardcoded ladder.
  const progressPct = useMemo(() => {
    if (!status?.nextTier) return 100;
    const prevFloor =
      status.nextTier.threshold === 500 ? 0
      : status.nextTier.threshold === 5000 ? 500
      : status.nextTier.threshold === 25000 ? 5000
      : status.nextTier.threshold === 100000 ? 25000
      : 100000;
    const span = status.nextTier.threshold - prevFloor;
    if (span <= 0) return 100;
    const pct = ((status.totalWagered - prevFloor) / span) * 100;
    return Math.max(0, Math.min(100, pct));
  }, [status]);

  if (!userId) return null;
  if (loading && !status) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 h-[112px] animate-pulse" />
    );
  }
  if (!status) return null;

  const tierAccent = TIER_ACCENT[status.tier];
  const canClaim = status.claimable > 0 && !claiming;

  return (
    <div className="rounded-xl border border-cyan/20 bg-gradient-to-br from-cyan/[0.08] via-cyan/[0.04] to-transparent overflow-hidden">
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-cyan/90">
              Rakeback
            </span>
            <span className={`text-[10px] font-mono ${tierAccent}`}>
              · {status.tierLabel}
            </span>
            <span className="text-[10px] font-mono text-white/35">
              {(status.effectivePct * 100).toFixed(2)}% of wager
            </span>
          </div>
          {status.lifetime > 0 && (
            <span className="text-[10px] font-mono text-white/40">
              ${status.lifetime.toFixed(2)} lifetime
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-white tabular-nums">
              ${status.claimable.toFixed(2)}
            </div>
            <div className="text-[11px] text-white/45 mt-0.5">
              {status.claimable > 0
                ? "available to claim · direct to balance"
                : "earn rakeback on every bet"}
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={!canClaim}
            className={
              canClaim
                ? "px-4 py-2 rounded-lg bg-gradient-to-r from-cyan to-violet text-white text-sm font-semibold shadow-[0_0_16px_rgba(6,182,212,0.35)] hover:shadow-[0_0_22px_rgba(6,182,212,0.5)] transition-shadow"
                : "px-4 py-2 rounded-lg bg-white/[0.03] text-white/30 text-sm font-semibold border border-white/5 cursor-not-allowed"
            }
          >
            {claiming ? "Claiming…" : "Claim"}
          </button>
        </div>

        {!compact && status.nextTier && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between text-[11px] text-white/40 mb-1.5">
              <span>
                ${status.nextTier.wageredToReach.toFixed(0)} more → {status.nextTier.label}{" "}
                <span className="text-white/25">
                  ({(status.nextTier.effectivePct * 100).toFixed(2)}%)
                </span>
              </span>
              <span className="font-mono text-white/30">
                {progressPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan to-violet transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-2 text-[11px] text-red-400/80">{error}</div>
        )}
      </div>

      <AnimatePresence>
        {justClaimed !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onAnimationComplete={() =>
              setTimeout(() => setJustClaimed(null), 2400)
            }
            className="px-4 pb-3 text-[11px] text-cyan/80 font-mono"
          >
            +${justClaimed.toFixed(2)} added to your balance.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
