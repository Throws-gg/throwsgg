"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type WindowKey = "day" | "week" | "month" | "all";

interface LeaderboardEntry {
  userId: string;
  username: string;
  betCount: number;
  cashStaked: number;
  cashReturned: number;
  netProfit: number;
  roi: number;
  biggestPayout: number;
}

const TABS: { key: WindowKey; label: string }[] = [
  { key: "day",   label: "today" },
  { key: "week",  label: "this week" },
  { key: "month", label: "this month" },
  { key: "all",   label: "all time" },
];

const RANK_ACCENT: Record<number, string> = {
  1: "text-gold",
  2: "text-cyan",
  3: "text-violet",
};

export default function LeaderboardPage() {
  const [window, setWindow] = useState<WindowKey>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (w: WindowKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?window=${w}&limit=10`);
      if (!res.ok) {
        setEntries([]);
        return;
      }
      const data = (await res.json()) as { entries?: LeaderboardEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(window);
  }, [window, load]);

  return (
    <div className="max-w-3xl mx-auto p-4 py-6 space-y-5 pb-20 md:pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Tipster Leaderboard</h1>
        <p className="text-sm text-white/40 mt-0.5">
          Ranked by ROI on real cash bets. Min 10 bets, $50 staked to qualify.
        </p>
      </div>

      {/* Window tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const active = window === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setWindow(t.key)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border",
                active
                  ? "bg-violet/20 text-violet border-violet/30"
                  : "bg-white/[0.02] text-white/45 border-white/[0.04] hover:text-white/70 hover:bg-white/[0.04]"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[9px] uppercase tracking-widest text-white/30 font-bold border-b border-white/[0.05]">
          <div className="col-span-1">#</div>
          <div className="col-span-4">tipster</div>
          <div className="col-span-2 text-right">bets</div>
          <div className="col-span-2 text-right">staked</div>
          <div className="col-span-3 text-right">ROI</div>
        </div>

        {loading && entries.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-white/30 animate-pulse">
            loading…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="px-4 py-10 text-center space-y-1.5">
            <p className="text-sm text-white/55">No tipsters qualified yet.</p>
            <p className="text-[11px] text-white/30">
              Place 10 bets, stake $50+ in this window, and you're on the board.
            </p>
          </div>
        )}

        {entries.map((e, i) => {
          const rank = i + 1;
          const accent = RANK_ACCENT[rank];
          const flame = rank === 1 ? "🔥" : rank === 2 ? "⚡" : rank === 3 ? "✨" : null;
          const positive = e.roi >= 0;
          return (
            <div
              key={e.userId}
              className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors"
            >
              <div className={cn("col-span-1 font-mono font-black tabular-nums text-sm", accent || "text-white/35")}>
                {rank}
              </div>
              <div className="col-span-4 min-w-0">
                <div className="flex items-center gap-1.5">
                  {flame && <span className="text-xs leading-none">{flame}</span>}
                  <span className="text-sm font-semibold text-white/85 truncate">
                    {e.username}
                  </span>
                </div>
                <div className="text-[10px] text-white/30 mt-0.5 font-mono tabular-nums">
                  best ${e.biggestPayout.toFixed(2)}
                </div>
              </div>
              <div className="col-span-2 text-right text-xs text-white/55 font-mono tabular-nums">
                {e.betCount}
              </div>
              <div className="col-span-2 text-right text-xs text-white/55 font-mono tabular-nums">
                ${e.cashStaked.toFixed(0)}
              </div>
              <div className="col-span-3 text-right">
                <div
                  className={cn(
                    "text-sm font-black font-mono tabular-nums",
                    positive ? "text-green" : "text-red/80"
                  )}
                >
                  {positive ? "+" : ""}
                  {e.roi.toFixed(1)}%
                </div>
                <div
                  className={cn(
                    "text-[10px] font-mono tabular-nums",
                    positive ? "text-green/55" : "text-red/55"
                  )}
                >
                  {positive ? "+" : ""}${e.netProfit.toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footnote */}
      <p className="text-[10px] text-white/25 text-center font-mono">
        ROI computed on cash stake only · bonus-funded bets excluded
      </p>
    </div>
  );
}
