"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

// ======= VIP TIER SYSTEM =======

interface VipTier {
  name: string;
  min: number;
  color: string;
  glow: string;
}

const VIP_TIERS: VipTier[] = [
  { name: "Bronze", min: 0, color: "#CD7F32", glow: "rgba(205,127,50,0.3)" },
  { name: "Silver", min: 1_000, color: "#C0C0C0", glow: "rgba(192,192,192,0.3)" },
  { name: "Gold", min: 10_000, color: "#F59E0B", glow: "rgba(245,158,11,0.4)" },
  { name: "Platinum", min: 50_000, color: "#06B6D4", glow: "rgba(6,182,212,0.4)" },
  { name: "Diamond", min: 250_000, color: "#8B5CF6", glow: "rgba(139,92,246,0.5)" },
];

function getVipTier(totalWagered: number) {
  let tier = VIP_TIERS[0];
  for (const t of VIP_TIERS) {
    if (totalWagered >= t.min) tier = t;
  }
  return tier;
}

function getNextTier(totalWagered: number): VipTier | null {
  for (const t of VIP_TIERS) {
    if (totalWagered < t.min) return t;
  }
  return null;
}

function getProgressToNext(totalWagered: number) {
  const current = getVipTier(totalWagered);
  const next = getNextTier(totalWagered);
  if (!next) return 1;
  const range = next.min - current.min;
  const progress = totalWagered - current.min;
  return Math.min(progress / range, 1);
}

// ======= TIER BADGE =======

function TierBadge({ tier, size = "md" }: { tier: VipTier; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "text-[9px] px-2 py-0.5",
    md: "text-[11px] px-3 py-1",
    lg: "text-xs px-4 py-1.5",
  };
  return (
    <span
      className={cn("font-black uppercase tracking-wider rounded-full border", sizes[size])}
      style={{
        color: tier.color,
        borderColor: `${tier.color}40`,
        backgroundColor: `${tier.color}10`,
        boxShadow: `0 0 12px ${tier.glow}`,
      }}
    >
      {tier.name}
    </span>
  );
}

// ======= STAT CARD =======

function StatCard({ label, value, subValue, color, delay }: {
  label: string; value: string; subValue?: string; color?: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 space-y-1"
    >
      <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">{label}</p>
      <p className={cn("text-xl font-black font-mono tabular-nums", color || "text-white")}>
        {value}
      </p>
      {subValue && (
        <p className="text-[10px] text-white/20">{subValue}</p>
      )}
    </motion.div>
  );
}

// ======= VIP PROGRESS =======

function VipProgress({ totalWagered }: { totalWagered: number }) {
  const currentTier = getVipTier(totalWagered);
  const nextTier = getNextTier(totalWagered);
  const progress = getProgressToNext(totalWagered);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">VIP Status</p>
          <div className="flex items-center gap-2">
            <TierBadge tier={currentTier} size="lg" />
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black font-mono tabular-nums text-white">
            ${totalWagered.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-white/25">total wagered</p>
        </div>
      </div>

      {/* Tier progress bar */}
      <div className="space-y-2">
        <div className="relative h-3 rounded-full bg-white/[0.04] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier?.color || currentTier.color})`,
              boxShadow: `0 0 12px ${currentTier.glow}`,
            }}
          />
        </div>

        {nextTier ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold" style={{ color: currentTier.color }}>
              {currentTier.name}
            </span>
            <span className="text-[10px] text-white/25">
              ${(nextTier.min - totalWagered).toLocaleString()} to{" "}
              <span className="font-semibold" style={{ color: nextTier.color }}>{nextTier.name}</span>
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-center font-semibold" style={{ color: currentTier.color }}>
            Max tier reached
          </p>
        )}
      </div>

      {/* Tier roadmap */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
        {VIP_TIERS.map((t, i) => {
          const reached = totalWagered >= t.min;
          return (
            <div key={t.name} className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                  reached ? "border-transparent" : "border-white/10"
                )}
                style={reached ? {
                  backgroundColor: `${t.color}25`,
                  borderColor: t.color,
                  boxShadow: `0 0 8px ${t.glow}`,
                } : {}}
              >
                {reached && (
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span
                className={cn("text-[8px] font-bold uppercase", reached ? "" : "text-white/20")}
                style={reached ? { color: t.color } : {}}
              >
                {t.name}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ======= MAIN PAGE =======

export default function ProfilePage() {
  const { userId, username, totalWagered, totalProfit, balance } = useUserStore();

  // Placeholder stats for fields we don't track yet
  const placeholderStats = useMemo(() => ({
    winRate: 47.3,
    totalBets: 284,
    biggestWin: 388.0,
    currentStreak: 3,
    streakType: "W" as const,
    memberSince: "Mar 2026",
  }), []);

  const currentTier = getVipTier(totalWagered);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] pb-20 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ===== HERO ===== */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#0F0F1A] to-[#0C0C14] p-6"
        >
          {/* Ambient glow based on VIP tier */}
          <div
            className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] -mr-16 -mt-16 opacity-20"
            style={{ backgroundColor: currentTier.color }}
          />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-[60px] -ml-12 -mb-12 opacity-10"
            style={{ backgroundColor: currentTier.color }}
          />

          <div className="relative flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 flex items-center justify-center text-xl sm:text-2xl font-black shrink-0"
              style={{
                borderColor: `${currentTier.color}60`,
                backgroundColor: `${currentTier.color}15`,
                color: currentTier.color,
                boxShadow: `0 0 20px ${currentTier.glow}`,
              }}
            >
              {username?.slice(0, 2).toUpperCase() || "??"}
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-white truncate">
                  {username || "anon"}
                </h1>
                <TierBadge tier={currentTier} size="sm" />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/25">
                <span>Member since {placeholderStats.memberSince}</span>
                <span className="w-1 h-1 rounded-full bg-white/15" />
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                  Online
                </span>
              </div>
              {/* Favourite game */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-white/20 uppercase tracking-wider">Favourite:</span>
                <span className="text-[10px] bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5 text-white/40 font-medium">
                  Racing
                </span>
              </div>
            </div>

            {/* Balance */}
            <div className="hidden sm:block text-right shrink-0">
              <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1">Balance</p>
              <p className="text-2xl font-black font-mono tabular-nums text-green">
                ${balance.toFixed(2)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* ===== VIP PROGRESS ===== */}
        <VipProgress totalWagered={totalWagered} />

        {/* ===== STATS GRID ===== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Total Wagered"
            value={`$${totalWagered.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            delay={0.3}
          />
          <StatCard
            label="Net Profit"
            value={`${totalProfit >= 0 ? "+" : ""}$${totalProfit.toFixed(2)}`}
            color={totalProfit >= 0 ? "text-green" : "text-red"}
            delay={0.35}
          />
          <StatCard
            label="Win Rate"
            value={`${placeholderStats.winRate}%`}
            subValue="284 total bets"
            delay={0.4}
          />
          <StatCard
            label="Total Bets"
            value={placeholderStats.totalBets.toLocaleString()}
            subValue="Races only"
            delay={0.45}
          />
          <StatCard
            label="Biggest Win"
            value={`$${placeholderStats.biggestWin.toFixed(2)}`}
            subValue="Moon Shot @ 12.80x"
            color="text-gold"
            delay={0.5}
          />
          <StatCard
            label="Current Streak"
            value={`${placeholderStats.currentStreak}${placeholderStats.streakType}`}
            subValue={placeholderStats.streakType === "W" ? "On a roll" : "Bounce back incoming"}
            color={placeholderStats.streakType === "W" ? "text-green" : "text-red"}
            delay={0.55}
          />
        </div>

        {/* ===== VIP BENEFITS PREVIEW ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3"
        >
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">VIP Benefits</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { tier: "Silver", benefit: "Reduced withdrawal fees", icon: "%" },
              { tier: "Gold", benefit: "Priority withdrawals", icon: "~" },
              { tier: "Platinum", benefit: "Weekly rakeback", icon: "$" },
              { tier: "Diamond", benefit: "Personal account manager", icon: "*" },
            ].map((b) => {
              const tierData = VIP_TIERS.find(t => t.name === b.tier)!;
              const unlocked = totalWagered >= tierData.min;
              return (
                <div
                  key={b.tier}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all",
                    unlocked
                      ? "border-white/[0.08] bg-white/[0.03]"
                      : "border-white/[0.04] bg-white/[0.01] opacity-40"
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                    style={{
                      backgroundColor: `${tierData.color}15`,
                      color: tierData.color,
                    }}
                  >
                    {b.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-white/70 font-medium truncate">{b.benefit}</p>
                    <p className="text-[9px] font-semibold" style={{ color: tierData.color }}>
                      {unlocked ? "Unlocked" : `Unlocks at ${b.tier}`}
                    </p>
                  </div>
                  {unlocked && (
                    <svg className="w-3.5 h-3.5 ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
