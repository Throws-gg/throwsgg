"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ======= TYPES & MOCK DATA =======

type BetResult = "won" | "lost";
type BetType = "win" | "place" | "show";

interface HistoryBet {
  id: string;
  horseName: string;
  horseColor: string;
  betType: BetType;
  odds: number;
  stake: number;
  payout: number;
  result: BetResult;
  raceNumber: number;
  timestamp: string;
}

const MOCK_BETS: HistoryBet[] = [
  { id: "1", horseName: "Moon Shot", horseColor: "#FBBF24", betType: "win", odds: 3.16, stake: 10, payout: 31.60, result: "won", raceNumber: 1284, timestamp: "2026-04-09T14:22:00Z" },
  { id: "2", horseName: "Thunder Edge", horseColor: "#8B5CF6", betType: "place", odds: 1.85, stake: 25, payout: 0, result: "lost", raceNumber: 1283, timestamp: "2026-04-09T14:19:00Z" },
  { id: "3", horseName: "Rug Pull", horseColor: "#EC4899", betType: "win", odds: 12.80, stake: 5, payout: 64.00, result: "won", raceNumber: 1281, timestamp: "2026-04-09T14:13:00Z" },
  { id: "4", horseName: "Crown Jewel", horseColor: "#22C55E", betType: "show", odds: 1.35, stake: 50, payout: 67.50, result: "won", raceNumber: 1280, timestamp: "2026-04-09T14:10:00Z" },
  { id: "5", horseName: "Night Fury", horseColor: "#EF4444", betType: "win", odds: 5.80, stake: 10, payout: 0, result: "lost", raceNumber: 1279, timestamp: "2026-04-09T14:07:00Z" },
  { id: "6", horseName: "Paper Hands", horseColor: "#F59E0B", betType: "win", odds: 6.50, stake: 5, payout: 0, result: "lost", raceNumber: 1278, timestamp: "2026-04-09T14:04:00Z" },
  { id: "7", horseName: "Dead Cat", horseColor: "#64748B", betType: "place", odds: 3.20, stake: 15, payout: 48.00, result: "won", raceNumber: 1276, timestamp: "2026-04-09T13:58:00Z" },
  { id: "8", horseName: "Iron Phantom", horseColor: "#06B6D4", betType: "win", odds: 4.20, stake: 20, payout: 0, result: "lost", raceNumber: 1275, timestamp: "2026-04-09T13:55:00Z" },
  { id: "9", horseName: "Moon Shot", horseColor: "#FBBF24", betType: "win", odds: 2.90, stake: 25, payout: 72.50, result: "won", raceNumber: 1274, timestamp: "2026-04-09T13:52:00Z" },
  { id: "10", horseName: "Volt Runner", horseColor: "#8B5CF6", betType: "show", odds: 1.40, stake: 100, payout: 0, result: "lost", raceNumber: 1273, timestamp: "2026-04-09T13:49:00Z" },
];

type Filter = "all" | "won" | "lost";

// ======= FORMAT HELPERS =======

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ======= MAIN PAGE =======

export default function HistoryPage() {
  const [filter, setFilter] = useState<Filter>("all");

  const filteredBets = useMemo(() => {
    if (filter === "all") return MOCK_BETS;
    return MOCK_BETS.filter(b => b.result === filter);
  }, [filter]);

  // Summary stats
  const stats = useMemo(() => {
    const total = MOCK_BETS.length;
    const wins = MOCK_BETS.filter(b => b.result === "won").length;
    const totalStaked = MOCK_BETS.reduce((sum, b) => sum + b.stake, 0);
    const totalPayout = MOCK_BETS.reduce((sum, b) => sum + b.payout, 0);
    const netPL = totalPayout - totalStaked;
    return { total, wins, winRate: total > 0 ? (wins / total) * 100 : 0, netPL };
  }, []);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] pb-20 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ===== HEADER ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-black text-white">Bet History</h1>
          <p className="text-sm text-white/25 mt-0.5">Your complete track record</p>
        </motion.div>

        {/* ===== SUMMARY STATS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-2xl font-black font-mono tabular-nums text-white">{stats.total}</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">Total Bets</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-2xl font-black font-mono tabular-nums text-white">{stats.winRate.toFixed(1)}%</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">Win Rate</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className={cn(
              "text-2xl font-black font-mono tabular-nums",
              stats.netPL >= 0 ? "text-green" : "text-red"
            )}>
              {stats.netPL >= 0 ? "+" : ""}${stats.netPL.toFixed(2)}
            </p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">Net P/L</p>
          </div>
        </motion.div>

        {/* ===== FILTER TABS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1"
        >
          {([
            { key: "all" as Filter, label: "All", count: MOCK_BETS.length },
            { key: "won" as Filter, label: "Wins", count: MOCK_BETS.filter(b => b.result === "won").length },
            { key: "lost" as Filter, label: "Losses", count: MOCK_BETS.filter(b => b.result === "lost").length },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                filter === tab.key
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/30 hover:text-white/50"
              )}
            >
              {tab.label}
              <span className={cn(
                "text-[9px] font-mono px-1.5 py-0.5 rounded-full",
                filter === tab.key ? "bg-white/10 text-white/60" : "bg-white/[0.03] text-white/20"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </motion.div>

        {/* ===== BET LIST ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] overflow-hidden"
        >
          {/* Desktop header — hidden on mobile */}
          <div className="hidden sm:grid grid-cols-[1fr_80px_70px_70px_80px_70px] gap-2 px-5 py-2.5 border-b border-white/[0.04] text-[10px] text-white/20 uppercase tracking-wider font-medium">
            <span>Horse</span>
            <span>Type</span>
            <span className="text-right">Odds</span>
            <span className="text-right">Stake</span>
            <span className="text-right">Payout</span>
            <span className="text-right">Time</span>
          </div>

          {filteredBets.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {filteredBets.map((bet, i) => (
                <motion.div
                  key={bet.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                >
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-[1fr_80px_70px_70px_80px_70px] gap-2 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors">
                    {/* Horse */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: bet.horseColor }} />
                      <span className="text-sm font-semibold text-white/80 truncate">{bet.horseName}</span>
                      <span className="text-[10px] text-white/15 font-mono">#{bet.raceNumber}</span>
                    </div>

                    {/* Type */}
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-2 py-0.5 rounded w-fit",
                      bet.betType === "win" ? "bg-violet/10 text-violet/60" :
                      bet.betType === "place" ? "bg-cyan/10 text-cyan/60" :
                      "bg-gold/10 text-gold/60"
                    )}>
                      {bet.betType}
                    </span>

                    {/* Odds */}
                    <span className="text-sm font-mono text-white/40 text-right">{bet.odds.toFixed(2)}x</span>

                    {/* Stake */}
                    <span className="text-sm font-mono text-white/50 text-right">${bet.stake.toFixed(2)}</span>

                    {/* Payout */}
                    <span className={cn(
                      "text-sm font-bold font-mono text-right",
                      bet.result === "won" ? "text-green" : "text-red/50"
                    )}>
                      {bet.result === "won" ? `+$${bet.payout.toFixed(2)}` : `-$${bet.stake.toFixed(2)}`}
                    </span>

                    {/* Time */}
                    <span className="text-[11px] text-white/20 text-right font-mono">
                      {formatTime(bet.timestamp)}
                    </span>
                  </div>

                  {/* Mobile card */}
                  <div className="sm:hidden px-4 py-3 flex items-center gap-3">
                    {/* Left: colour dot + result indicator */}
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${bet.horseColor}15` }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bet.horseColor }} />
                      </div>
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black",
                        bet.result === "won" ? "bg-green text-black" : "bg-red/80 text-white"
                      )}>
                        {bet.result === "won" ? "W" : "L"}
                      </div>
                    </div>

                    {/* Middle: horse + details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white/80 truncate">{bet.horseName}</span>
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                          bet.betType === "win" ? "bg-violet/10 text-violet/50" :
                          bet.betType === "place" ? "bg-cyan/10 text-cyan/50" :
                          "bg-gold/10 text-gold/50"
                        )}>
                          {bet.betType}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/20 mt-0.5">
                        {bet.odds.toFixed(2)}x &middot; ${bet.stake.toFixed(2)} stake &middot; #{bet.raceNumber}
                      </p>
                    </div>

                    {/* Right: payout */}
                    <div className="text-right shrink-0">
                      <p className={cn(
                        "text-sm font-bold font-mono tabular-nums",
                        bet.result === "won" ? "text-green" : "text-red/50"
                      )}>
                        {bet.result === "won" ? `+$${bet.payout.toFixed(2)}` : `-$${bet.stake.toFixed(2)}`}
                      </p>
                      <p className="text-[10px] text-white/15 font-mono">{formatTime(bet.timestamp)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-16 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-white/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3" />
                  <path d="M3.05 11a9 9 0 1 1 .5 4" />
                  <path d="M3 16l-1-4 4-1" />
                </svg>
              </div>
              <p className="text-white/25 text-sm font-medium">No bets found</p>
              <p className="text-white/12 text-xs">
                {filter !== "all" ? "Try changing the filter" : "Place your first bet to see it here"}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
