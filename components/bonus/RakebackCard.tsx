"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { useUserStore } from "@/stores/userStore";
import type { RakebackTier } from "@/lib/rakeback/tiers";

interface StatusResponse {
  tier: RakebackTier;
  tierLabel: string;
  tierPct: number;
  effectivePct: number;
  weekEarned: number;
  lifetime: number;
  totalWagered: number;
  edgeRate: number;
  nextTier: {
    tier: RakebackTier;
    label: string;
    tierPct: number;
    effectivePct: number;
    wageredToReach: number;
    threshold: number;
  } | null;
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

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Fill the bar from the current tier's floor to the next tier's floor.
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
              ${status.weekEarned.toFixed(2)}
              <span className="ml-1.5 text-[11px] font-normal text-white/40">
                this week
              </span>
            </div>
            <div className="text-[11px] text-white/45 mt-0.5">
              auto-credited per bet · no claim, no wagering
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-widest text-cyan/70">
              instant
            </div>
            <div className="text-[10px] text-white/35 font-mono mt-0.5">
              every settled bet
            </div>
          </div>
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
      </div>
    </div>
  );
}
