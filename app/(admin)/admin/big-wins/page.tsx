"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";
import type { Horse } from "@/lib/racing/constants";
import { RaceWinCard } from "@/components/racing/RaceWinCard";
import { HorseSprite } from "@/components/racing/HorseSprite";

// ============================================
// Admin · Big Wins — $100+ or 8x+ monitor
// ============================================

interface BigWin {
  id: string;
  userId: string;
  username: string;
  amount: number;
  lockedOdds: number;
  payout: number;
  profit: number;
  settledAt: string;
  qualifiesAmount: boolean;
  qualifiesMultiplier: boolean;
  raceId: string;
  raceNumber: number;
  distance: number;
  ground: string;
  gatePosition: number;
  horse: Horse | null;
}

type Filter = "all" | "amount" | "multiplier";

function fmtUSD(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ============================================
// Page
// ============================================

export default function AdminBigWinsPage() {
  const userId = useUserStore((s) => s.userId);
  const [bigWins, setBigWins] = useState<BigWin[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [shareWin, setShareWin] = useState<BigWin | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter, limit: "100" });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/big-wins?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setBigWins(data.bigWins || []);
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [filter, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 20_000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  const stats = {
    count: bigWins.length,
    total: bigWins.reduce((sum, w) => sum + w.profit, 0),
    biggest: bigWins.reduce((max, w) => Math.max(max, w.profit), 0),
    highestMult: bigWins.reduce((max, w) => Math.max(max, w.lockedOdds), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
            module · 02
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            big wins <span className="text-gold">watch</span>
          </h1>
          <p className="text-xs text-white/40 mt-1 font-mono">
            wins ≥ $100 profit · or ≥ 8x multiplier · auto-refresh every 20s
          </p>
        </div>

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 border rounded text-[10px] font-mono uppercase tracking-wider transition-all",
            autoRefresh
              ? "border-green/30 bg-green/[0.05] text-green"
              : "border-white/10 bg-white/[0.02] text-white/40"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              autoRefresh ? "bg-green animate-pulse" : "bg-white/30"
            )}
          />
          {autoRefresh ? "live" : "paused"}
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <BigStat label="wins shown" value={String(stats.count)} accent="white" />
        <BigStat label="total profit paid" value={fmtUSD(stats.total)} accent="gold" glow />
        <BigStat label="biggest single" value={fmtUSD(stats.biggest)} accent="violet" />
        <BigStat label="highest multi" value={`${stats.highestMult.toFixed(2)}x`} accent="green" />
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-white/[0.06]">
        <FilterTab label="all wins" value="all" current={filter} onClick={() => setFilter("all")} code="∑" />
        <FilterTab label="≥ $100" value="amount" current={filter} onClick={() => setFilter("amount")} code="$" />
        <FilterTab label="≥ 8x" value="multiplier" current={filter} onClick={() => setFilter("multiplier")} code="×" />
      </div>

      {/* Feed */}
      {loading ? (
        <Loading />
      ) : bigWins.length === 0 ? (
        <EmptyState message={`no big wins match filter "${filter}"`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bigWins.map((win) => (
            <WinCard key={win.id} win={win} onShare={() => setShareWin(win)} />
          ))}
        </div>
      )}

      {/* Share modal — uses the existing RaceWinCard component */}
      <AnimatePresence>
        {shareWin && shareWin.horse && (
          <RaceWinCard
            horse={shareWin.horse}
            betAmount={shareWin.amount}
            lockedOdds={shareWin.lockedOdds}
            payout={shareWin.payout}
            raceNumber={shareWin.raceNumber}
            distance={shareWin.distance}
            ground={shareWin.ground}
            gatePosition={shareWin.gatePosition}
            username={shareWin.username}
            onClose={() => setShareWin(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Components
// ============================================

function BigStat({
  label,
  value,
  accent,
  glow,
}: {
  label: string;
  value: string;
  accent: "white" | "gold" | "violet" | "green";
  glow?: boolean;
}) {
  const colors = {
    white: "text-white",
    gold: "text-gold",
    violet: "text-violet",
    green: "text-green",
  };
  return (
    <div
      className={cn(
        "border border-white/[0.06] bg-[#0a0a12] p-4 relative overflow-hidden",
        glow && "shadow-[0_0_40px_rgba(245,158,11,0.04)]"
      )}
    >
      {glow && (
        <div className="absolute top-0 right-0 w-20 h-20 bg-gold/[0.06] blur-2xl pointer-events-none" />
      )}
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2 relative">
        {label}
      </p>
      <p className={cn("text-2xl sm:text-3xl font-black font-mono tabular-nums leading-none relative", colors[accent])}>
        {value}
      </p>
    </div>
  );
}

function FilterTab({
  label,
  value,
  current,
  onClick,
  code,
}: {
  label: string;
  value: Filter;
  current: Filter;
  onClick: () => void;
  code: string;
}) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative px-5 py-3 flex items-center gap-3",
        active ? "bg-white/[0.02]" : "hover:bg-white/[0.02]"
      )}
    >
      <span
        className={cn(
          "absolute bottom-0 left-0 right-0 h-0.5 transition-all",
          active ? "bg-gold" : "bg-transparent"
        )}
      />
      <span
        className={cn(
          "text-base font-mono font-black tabular-nums",
          active ? "text-gold" : "text-white/30"
        )}
      >
        {code}
      </span>
      <span
        className={cn(
          "text-xs uppercase tracking-wider font-bold",
          active ? "text-white" : "text-white/50"
        )}
      >
        {label}
      </span>
    </button>
  );
}

function Loading() {
  return (
    <div className="border border-white/[0.06] bg-[#0a0a12] py-20 text-center">
      <div className="inline-flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse" />
        <span className="w-1.5 h-1.5 bg-gold/60 rounded-full animate-pulse" style={{ animationDelay: "0.1s" }} />
        <span className="w-1.5 h-1.5 bg-gold/30 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">loading wins</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-white/[0.06] bg-[#0a0a12] py-20 text-center">
      <p className="text-xs font-mono text-white/35">{message}</p>
    </div>
  );
}

function WinCard({ win, onShare }: { win: BigWin; onShare: () => void }) {
  if (!win.horse) return null;

  const profit = win.profit;
  const isHuge = profit >= 500;
  const isMassiveMult = win.lockedOdds >= 15;

  return (
    <div
      className={cn(
        "relative group border bg-[#0a0a12] overflow-hidden transition-all",
        isHuge ? "border-gold/25 shadow-[0_0_30px_rgba(245,158,11,0.06)]" : "border-white/[0.06] hover:border-white/15"
      )}
    >
      {/* Accent gradient for huge wins */}
      {isHuge && (
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            background: "linear-gradient(135deg, #F59E0B 0%, transparent 40%)",
          }}
        />
      )}

      {/* Top strip — badges */}
      <div className="relative px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {win.qualifiesAmount && (
            <Badge tone="gold">≥ $100</Badge>
          )}
          {win.qualifiesMultiplier && (
            <Badge tone="violet">{win.lockedOdds.toFixed(2)}x</Badge>
          )}
          {isMassiveMult && (
            <Badge tone="magenta">longshot</Badge>
          )}
        </div>
        <span className="text-[9px] font-mono text-white/25 uppercase tracking-wider whitespace-nowrap">
          {fmtTime(win.settledAt)}
        </span>
      </div>

      {/* Horse + user */}
      <div className="relative px-4 pb-3 flex items-center gap-3">
        <HorseSprite slug={win.horse.slug} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate leading-tight">
            {win.horse.name}
          </p>
          <p className="text-[10px] text-white/40 font-mono truncate">
            @{win.username}
          </p>
        </div>
        <div
          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black font-mono border border-black/30"
          style={{ backgroundColor: win.horse.color }}
        >
          {win.gatePosition}
        </div>
      </div>

      {/* Big profit number */}
      <div className="relative px-4 py-3 border-t border-white/[0.04]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[9px] font-mono uppercase tracking-widest text-white/30">
            profit
          </p>
          <p className="text-[9px] font-mono text-white/30">
            ${win.amount.toFixed(2)} @ {win.lockedOdds.toFixed(2)}x
          </p>
        </div>
        <p
          className={cn(
            "text-3xl sm:text-4xl font-black font-mono tabular-nums mt-1 leading-none",
            isHuge ? "text-gold" : "text-white"
          )}
          style={
            isHuge
              ? { textShadow: "0 0 30px rgba(245,158,11,0.3)" }
              : undefined
          }
        >
          +${profit.toFixed(2)}
        </p>
        <p className="text-[10px] text-white/30 font-mono mt-1">
          payout ${win.payout.toFixed(2)} · race #{win.raceNumber.toLocaleString()} · {win.distance}m · {win.ground}
        </p>
      </div>

      {/* Action bar */}
      <div className="relative px-4 py-3 border-t border-white/[0.04] flex gap-2">
        <button
          onClick={onShare}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-violet/10 border border-violet/25 hover:bg-violet/20 text-violet text-[10px] font-mono font-bold uppercase tracking-wider transition-all rounded"
        >
          <XIcon />
          share card
        </button>
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "gold" | "violet" | "magenta" }) {
  const colors = {
    gold: "bg-gold/10 text-gold border-gold/25",
    violet: "bg-violet/10 text-violet border-violet/25",
    magenta: "bg-magenta/10 text-magenta border-magenta/25",
  };
  return (
    <span
      className={cn(
        "text-[9px] font-mono font-black uppercase tracking-wider px-1.5 py-0.5 border rounded",
        colors[tone]
      )}
    >
      {children}
    </span>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
