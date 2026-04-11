"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

// ============================================
// Admin · Overview — control room dashboard
// ============================================

interface Stats {
  today: {
    volume: number;
    ggr: number;
    edge: number;
    betCount: number;
    settledCount: number;
    bigWinCount: number;
    biggestWin: number;
    highestMult: number;
    newUsers: number;
  };
  week: {
    volume: number;
    ggr: number;
  };
  users: {
    total: number;
    online: number;
    totalBalance: number;
  };
  hotWallet: {
    balance: number;
    liability: number;
    ratio: number;
    updatedAt: string | null;
  };
  currentRace: {
    id: string;
    raceNumber: number;
    status: string;
    distance: number;
    ground: string;
    betCount: number;
    totalBetAmount: number;
    bettingClosesAt: string;
  } | null;
  affiliates: {
    pendingApplications: number;
    active: number;
  };
}

function fmtUSD(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function fmtNum(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

// ============================================
// Page
// ============================================

export default function AdminDashboardPage() {
  const userId = useUserStore((s) => s.userId);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchStats = useCallback(async () => {
    try {
      const url = userId ? `/api/admin/stats?userId=${userId}` : "/api/admin/stats";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("stats fetch failed:", err);
    }
  }, [userId]);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 15_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return (
    <div className="space-y-8">
      {/* ======== Header ======== */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
            module · 00 · system state
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            the control <span className="text-violet">room</span>
          </h1>
          <p className="text-xs text-white/40 mt-1 font-mono">
            live operations · updated every 15s · {lastUpdate.toLocaleTimeString()}
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
          <span className="text-green/80 uppercase tracking-widest">live</span>
        </div>
      </div>

      {!stats ? (
        <Loading />
      ) : (
        <>
          {/* ======== Hero metrics row ======== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <HeroStat
              label="today · ggr"
              value={fmtUSD(stats.today.ggr)}
              sub={`${stats.today.edge.toFixed(1)}% edge realised`}
              accent="gold"
              glow
            />
            <HeroStat
              label="today · volume"
              value={fmtUSD(stats.today.volume)}
              sub={`${stats.today.betCount} bets placed`}
              accent="violet"
            />
            <HeroStat
              label="online · now"
              value={String(stats.users.online)}
              sub={`${stats.users.total} total users`}
              accent="green"
              pulse
            />
            <HeroStat
              label="user balances"
              value={fmtUSD(stats.users.totalBalance)}
              sub="hot wallet liability"
              accent="white"
            />
          </div>

          {/* ======== Current race state ======== */}
          {stats.currentRace && (
            <section>
              <SectionHeader code="a" title="current race" sub="live round in progress" />
              <div className="border border-violet/15 bg-violet/[0.03] p-5 sm:p-6 rounded relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-violet/[0.08] blur-3xl pointer-events-none" />
                <div className="relative grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <Metric label="race #" value={`#${stats.currentRace.raceNumber}`} />
                  <Metric
                    label="status"
                    value={
                      <span
                        className={cn(
                          "font-mono font-bold uppercase",
                          stats.currentRace.status === "betting" && "text-green",
                          stats.currentRace.status === "closed" && "text-gold",
                          stats.currentRace.status === "racing" && "text-violet"
                        )}
                      >
                        {stats.currentRace.status}
                      </span>
                    }
                  />
                  <Metric label="distance" value={`${stats.currentRace.distance}m`} />
                  <Metric label="ground" value={stats.currentRace.ground} />
                  <Metric
                    label="betting now"
                    value={`${fmtUSD(stats.currentRace.totalBetAmount)} · ${stats.currentRace.betCount} bets`}
                  />
                </div>
              </div>
            </section>
          )}

          {/* ======== Hot wallet monitor ======== */}
          <HotWalletSection stats={stats} userId={userId} onUpdated={fetchStats} />

          {/* ======== Operations grid ======== */}
          <section>
            <SectionHeader code="b" title="today's operations" sub="financial + user activity since 00:00 UTC" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <OpsTile label="new users" value={fmtNum(stats.today.newUsers)} />
              <OpsTile label="bets placed" value={fmtNum(stats.today.betCount)} />
              <OpsTile label="bets settled" value={fmtNum(stats.today.settledCount)} />
              <OpsTile
                label="big wins today"
                value={fmtNum(stats.today.bigWinCount)}
                accent="gold"
              />
              <OpsTile
                label="biggest win"
                value={fmtUSD(stats.today.biggestWin)}
                accent="gold"
              />
              <OpsTile
                label="highest multi"
                value={`${stats.today.highestMult.toFixed(2)}x`}
                accent="violet"
              />
              <OpsTile label="week volume" value={fmtUSD(stats.week.volume)} />
              <OpsTile
                label="week ggr"
                value={fmtUSD(stats.week.ggr)}
                accent={stats.week.ggr >= 0 ? "green" : "red"}
              />
            </div>
          </section>

          {/* ======== Quick actions ======== */}
          <section>
            <SectionHeader code="c" title="quick jumps" sub="common admin tasks" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <QuickAction
                href="/admin/affiliates"
                label="affiliate applications"
                sub={`${stats.affiliates.pendingApplications} pending review`}
                badge={stats.affiliates.pendingApplications > 0 ? stats.affiliates.pendingApplications : undefined}
                badgeTone="gold"
              />
              <QuickAction
                href="/admin/big-wins"
                label="big wins watch"
                sub={`${stats.today.bigWinCount} wins flagged today`}
                badge={stats.today.bigWinCount > 0 ? stats.today.bigWinCount : undefined}
                badgeTone="violet"
              />
              <QuickAction
                href="/admin/banner"
                label="banner + assets"
                sub="generate share cards + x banner"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ============================================
// Components
// ============================================

function Loading() {
  return (
    <div className="border border-white/[0.06] bg-[#0a0a12] py-24 text-center">
      <div className="inline-flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 bg-violet rounded-full animate-pulse" />
        <span className="w-1.5 h-1.5 bg-violet/60 rounded-full animate-pulse" style={{ animationDelay: "0.1s" }} />
        <span className="w-1.5 h-1.5 bg-violet/30 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">pulling system state</p>
    </div>
  );
}

function SectionHeader({ code, title, sub }: { code: string; title: string; sub: string }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3 border-b border-white/[0.06] pb-2">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-mono font-bold text-violet uppercase tracking-widest">
          {code}
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
      </div>
      <span className="text-[10px] font-mono text-white/25 italic">{sub}</span>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  accent,
  glow,
  pulse,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "gold" | "violet" | "green" | "white";
  glow?: boolean;
  pulse?: boolean;
}) {
  const colors = {
    gold: "text-gold",
    violet: "text-violet",
    green: "text-green",
    white: "text-white",
  };
  const glowClass = {
    gold: "shadow-[0_0_40px_rgba(245,158,11,0.08)]",
    violet: "shadow-[0_0_40px_rgba(139,92,246,0.08)]",
    green: "shadow-[0_0_40px_rgba(34,197,94,0.06)]",
    white: "",
  };
  const glowBg = {
    gold: "bg-gold/[0.08]",
    violet: "bg-violet/[0.08]",
    green: "bg-green/[0.05]",
    white: "",
  };
  return (
    <div
      className={cn(
        "relative border border-white/[0.06] bg-[#0a0a12] p-5 overflow-hidden",
        glow && glowClass[accent]
      )}
    >
      {glow && (
        <div
          className={cn("absolute top-0 right-0 w-32 h-32 blur-3xl pointer-events-none", glowBg[accent])}
        />
      )}
      <div className="relative flex items-center gap-2 mb-3">
        {pulse && <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", `bg-${accent}`)} />}
        <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/35">{label}</p>
      </div>
      <p className={cn("relative text-3xl sm:text-4xl font-black font-mono tabular-nums leading-none", colors[accent])}>
        {value}
      </p>
      <p className="relative text-[10px] font-mono text-white/30 mt-2">{sub}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-1">{label}</p>
      <p className="text-base sm:text-lg font-mono font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

function OpsTile({
  label,
  value,
  accent = "white",
}: {
  label: string;
  value: string;
  accent?: "white" | "violet" | "gold" | "green" | "red";
}) {
  const colors = {
    white: "text-white",
    violet: "text-violet",
    gold: "text-gold",
    green: "text-green",
    red: "text-red",
  };
  return (
    <div className="border border-white/[0.06] bg-[#0a0a12] p-4 hover:border-white/15 transition-colors">
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">{label}</p>
      <p className={cn("text-xl font-mono font-black tabular-nums leading-none", colors[accent])}>
        {value}
      </p>
    </div>
  );
}

function HotWalletSection({
  stats,
  userId,
  onUpdated,
}: {
  stats: Stats;
  userId: string | null;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(stats.hotWallet.balance));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const ratio = stats.hotWallet.ratio;
  const liability = stats.hotWallet.liability;
  const balance = stats.hotWallet.balance;

  // Ratio thresholds: <1 = danger, 1-2 = warning, 2-5 = ok, >5 = flush
  let ratioColor: "red" | "gold" | "green" | "violet" = "green";
  let ratioLabel = "healthy";
  if (ratio < 1) {
    ratioColor = "red";
    ratioLabel = "danger · underwater";
  } else if (ratio < 2) {
    ratioColor = "gold";
    ratioLabel = "thin · top up soon";
  } else if (ratio < 5) {
    ratioColor = "green";
    ratioLabel = "healthy";
  } else {
    ratioColor = "violet";
    ratioLabel = "flush";
  }

  const save = async () => {
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hot-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, balance: n, reason: reason || null }),
      });
      if (res.ok) {
        setEditing(false);
        setReason("");
        onUpdated();
      }
    } catch (err) {
      console.error("hot wallet update failed:", err);
    }
    setSaving(false);
  };

  const ratioColors = {
    red: "text-red border-red/30",
    gold: "text-gold border-gold/30",
    green: "text-green border-green/30",
    violet: "text-violet border-violet/30",
  };
  const ratioBg = {
    red: "bg-red/[0.04]",
    gold: "bg-gold/[0.03]",
    green: "bg-green/[0.03]",
    violet: "bg-violet/[0.03]",
  };
  const glowBg = {
    red: "bg-red/[0.1]",
    gold: "bg-gold/[0.08]",
    green: "bg-green/[0.05]",
    violet: "bg-violet/[0.05]",
  };

  return (
    <section>
      <SectionHeader code="hw" title="hot wallet monitor" sub="admin-maintained · update when you top up on-chain" />
      <div
        className={cn(
          "border rounded p-5 sm:p-6 relative overflow-hidden",
          ratioColors[ratioColor].split(" ")[1],
          ratioBg[ratioColor]
        )}
      >
        <div
          className={cn(
            "absolute top-0 right-0 w-48 h-48 blur-3xl pointer-events-none",
            glowBg[ratioColor]
          )}
        />

        <div className="relative grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
              coverage ratio
            </p>
            <p className={cn("text-5xl sm:text-6xl font-black font-mono tabular-nums leading-none", ratioColors[ratioColor].split(" ")[0])}>
              {ratio.toFixed(2)}x
            </p>
            <p className={cn("text-[11px] font-mono uppercase tracking-widest mt-2 font-bold", ratioColors[ratioColor].split(" ")[0])}>
              {ratioLabel}
            </p>
          </div>

          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
              hot wallet
            </p>
            <p className="text-2xl font-black font-mono tabular-nums text-white">
              ${balance.toFixed(2)}
            </p>
            <button
              onClick={() => setEditing(!editing)}
              className="text-[10px] font-mono uppercase tracking-wider text-violet hover:text-white mt-2"
            >
              {editing ? "cancel" : "update →"}
            </button>
          </div>

          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
              user liability
            </p>
            <p className="text-2xl font-black font-mono tabular-nums text-white/70">
              ${liability.toFixed(2)}
            </p>
            <p className="text-[9px] font-mono text-white/25 mt-2">
              deficit: ${Math.max(0, liability - balance).toFixed(2)}
            </p>
          </div>
        </div>

        {editing && (
          <div className="relative mt-5 pt-5 border-t border-white/[0.06] space-y-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
                new balance (after top-up)
              </label>
              <input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
                reason / tx reference
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="topped up with 500 usdc · tx 0x..."
                className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
              />
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="w-full px-4 py-2.5 bg-violet/10 border border-violet/30 text-violet text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-violet/20 disabled:opacity-30 transition-all rounded"
            >
              {saving ? "saving..." : "save balance"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function QuickAction({
  href,
  label,
  sub,
  badge,
  badgeTone = "violet",
}: {
  href: string;
  label: string;
  sub: string;
  badge?: number;
  badgeTone?: "violet" | "gold";
}) {
  const badgeColors = {
    violet: "bg-violet/15 text-violet border-violet/30",
    gold: "bg-gold/15 text-gold border-gold/30",
  };
  return (
    <Link
      href={href}
      className="group block border border-white/[0.06] bg-[#0a0a12] p-5 hover:border-violet/30 hover:bg-white/[0.02] transition-all relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-violet/[0.03] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-white mb-1 uppercase tracking-wider">{label}</p>
          <p className="text-[11px] text-white/40 font-mono">{sub}</p>
        </div>
        {badge !== undefined && (
          <span
            className={cn(
              "text-[10px] font-mono font-black border rounded px-1.5 py-0.5 tabular-nums",
              badgeColors[badgeTone]
            )}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="relative mt-4 text-[10px] font-mono text-white/30 uppercase tracking-widest group-hover:text-violet transition-colors">
        open →
      </div>
    </Link>
  );
}
