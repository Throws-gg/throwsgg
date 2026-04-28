"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { cn } from "@/lib/utils";
import { RakebackCard } from "@/components/bonus/RakebackCard";
import { getAllRakebackTiers } from "@/lib/rakeback/tiers";

// ======= VIP TIER SYSTEM =======
// Unified with the rakeback ladder. The VIP "tier" is just the rakeback tier
// dressed up — same thresholds, same names. Headline benefit at each tier =
// X% rakeback rate. Listed perks below have to be things we actually deliver
// (or can deliver day one) so the page tells the truth about every claim.

interface VipTier {
  name: string;
  min: number;
  color: string;
  glow: string;
}

// Pull thresholds from the rakeback ladder so the two systems can never drift.
// Visual styling (color/glow) lives here.
const TIER_STYLES: Record<string, { color: string; glow: string }> = {
  bronze:   { color: "#CD7F32", glow: "rgba(205,127,50,0.3)" },
  silver:   { color: "#C0C0C0", glow: "rgba(192,192,192,0.3)" },
  gold:     { color: "#F59E0B", glow: "rgba(245,158,11,0.4)" },
  platinum: { color: "#06B6D4", glow: "rgba(6,182,212,0.4)" },
  diamond:  { color: "#8B5CF6", glow: "rgba(139,92,246,0.5)" },
};

const VIP_TIERS: VipTier[] = getAllRakebackTiers().map((t) => ({
  name: t.label,
  min: t.minWagered,
  color: TIER_STYLES[t.tier].color,
  glow: TIER_STYLES[t.tier].glow,
}));

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
  const { username, totalWagered, totalProfit, balance, referralCode, userId } = useUserStore();
  const authedFetch = useAuthedFetch();
  const [editingUsername, setEditingUsername] = useState(false);
  const [streak, setStreak] = useState<{
    current: number;
    longest: number;
    bettedToday: boolean;
    atRisk: boolean;
  } | null>(null);

  // Stats that need API data show "—" until we wire them up.
  // Better to show honest zeros than fake numbers that destroy trust.
  const hasBetHistory = totalWagered > 0;

  const currentTier = getVipTier(totalWagered);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/streak/status");
        if (!res.ok) return;
        const data = (await res.json()) as {
          current: number;
          longest: number;
          bettedToday: boolean;
          atRisk: boolean;
        };
        if (!cancelled) setStreak(data);
      } catch {
        // silent — non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, userId]);

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
                <button
                  onClick={() => setEditingUsername(true)}
                  aria-label="Edit username"
                  className="text-white/30 hover:text-violet transition-colors p-1 -m-1"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <TierBadge tier={currentTier} size="sm" />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/25">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                  Online
                </span>
                {hasBetHistory && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-white/15" />
                    <span>{totalWagered >= 1000 ? "Regular" : "New bettor"}</span>
                  </>
                )}
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

        {/* ===== RAKEBACK ===== */}
        <RakebackCard />

        {/* ===== REFERRAL CARD ===== */}
        {referralCode && <ReferralCard code={referralCode} />}

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
            label="Balance"
            value={`$${balance.toFixed(2)}`}
            color="text-green"
            delay={0.4}
          />
          <StatCard
            label="Win Rate"
            value={hasBetHistory ? "—" : "—"}
            subValue={hasBetHistory ? "coming soon" : "place your first bet"}
            delay={0.45}
          />
          <StatCard
            label="Biggest Win"
            value={hasBetHistory ? "—" : "—"}
            subValue={hasBetHistory ? "coming soon" : "could be you"}
            color="text-gold"
            delay={0.5}
          />
          <StatCard
            label="Streak"
            value={
              streak && streak.current > 0
                ? `${streak.current}🔥`
                : hasBetHistory
                  ? "0"
                  : "—"
            }
            subValue={
              streak && streak.current > 0
                ? streak.bettedToday
                  ? `best ${streak.longest}`
                  : streak.atRisk
                    ? "bet today to keep it"
                    : `best ${streak.longest}`
                : hasBetHistory
                  ? "place a bet today"
                  : "start a streak"
            }
            color={streak?.atRisk ? "text-gold" : undefined}
            delay={0.55}
          />
        </div>

        {/* ===== VIP TIER LADDER ===== */}
        {/* Five real tiers — same thresholds as the rakeback ladder, same
            names, headline perk at each tier is the rakeback rate. Every
            listed perk is shipped today (rakeback + daily bonus tiers) or
            can be delivered day-one (priority withdrawal review = manual
            queue ordering on admin side). No "rolling out soon" hedging. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">VIP Ladder</p>
            <span className="text-[9px] text-white/30 font-mono uppercase tracking-wider">
              wager more · earn more
            </span>
          </div>

          <div className="space-y-1.5">
            {[
              { tier: "Bronze",   rakeback: "5%",  daily: "$0.10/day",                                 extra: null as string | null },
              { tier: "Silver",   rakeback: "10%", daily: "$0.20/day",                                 extra: null },
              { tier: "Gold",     rakeback: "15%", daily: "$0.35/day",                                 extra: null },
              { tier: "Platinum", rakeback: "20%", daily: "$0.50/day",                                 extra: "priority withdrawal review" },
              { tier: "Diamond",  rakeback: "25%", daily: "$1.00/day",                                 extra: "priority review · founder DM" },
            ].map((b) => {
              const tierData = VIP_TIERS.find(t => t.name === b.tier)!;
              const unlocked = totalWagered >= tierData.min;
              const isCurrent = currentTier.name === b.tier;
              return (
                <div
                  key={b.tier}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all",
                    isCurrent
                      ? "border-white/[0.12] bg-white/[0.04]"
                      : unlocked
                        ? "border-white/[0.06] bg-white/[0.02]"
                        : "border-white/[0.04] bg-white/[0.01] opacity-50"
                  )}
                  style={isCurrent ? { boxShadow: `inset 0 0 0 1px ${tierData.color}40` } : undefined}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 uppercase"
                    style={{
                      backgroundColor: `${tierData.color}18`,
                      color: tierData.color,
                    }}
                  >
                    {b.tier.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-[12px] font-bold text-white/85">{b.tier}</p>
                      <p className="text-[9px] text-white/30 font-mono tabular-nums">
                        {tierData.min === 0 ? "$0+" : `$${tierData.min.toLocaleString()}+ wagered`}
                      </p>
                    </div>
                    <p className="text-[10px] text-white/45 leading-tight mt-0.5 truncate">
                      <span className="text-white/65 font-semibold">{b.rakeback} rakeback</span>
                      <span className="text-white/25"> · </span>
                      <span className="text-white/55">{b.daily} login</span>
                      {b.extra && (
                        <>
                          <span className="text-white/25"> · </span>
                          <span className="text-white/55">{b.extra}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {isCurrent && (
                    <span
                      className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: `${tierData.color}20`, color: tierData.color }}
                    >
                      You
                    </span>
                  )}
                  {!isCurrent && unlocked && (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {editingUsername && (
        <UsernameEditModal
          current={username || ""}
          onClose={() => setEditingUsername(false)}
        />
      )}
    </div>
  );
}

// ======= REFERRAL CARD =======

function ReferralCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const fullLink = `https://throws.gg/r/${code}`;
  const displayLink = `throws.gg/r/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — silent
    }
  };

  const handleShareX = () => {
    const text = encodeURIComponent(
      `16 virtual horses. new race every 3 minutes. provably fair. crypto-native.\n\nthrows.gg is the fastest horse racing on the internet. $20 free when you sign up:\n\n${fullLink}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="relative overflow-hidden rounded-xl border border-violet/20 bg-gradient-to-br from-violet/[0.08] to-magenta/[0.04] p-5 space-y-4"
    >
      <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] -mr-16 -mt-16 bg-violet/15 pointer-events-none" />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
              Your Referral Link
            </p>
            <p className="text-sm text-white/70 mt-1">
              Earn <span className="text-green font-bold">20% of NGR</span> for every friend you bring. Forever.
            </p>
          </div>
          <Link
            href="/referrals"
            className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-violet/80 hover:text-violet whitespace-nowrap"
          >
            details →
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2.5 overflow-hidden">
            <p className="font-mono text-xs sm:text-sm text-white/70 truncate select-all">
              {displayLink}
            </p>
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              "shrink-0 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95",
              copied
                ? "bg-green/15 border border-green/30 text-green"
                : "bg-violet text-white hover:bg-violet/80 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <button
          onClick={handleShareX}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/60 text-xs font-semibold hover:bg-white/[0.06] hover:text-white/80 active:scale-[0.99] transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>
      </div>
    </motion.div>
  );
}

// ======= USERNAME EDIT MODAL =======

function UsernameEditModal({ current, onClose }: { current: string; onClose: () => void }) {
  const setUsernameInStore = useUserStore((s) => s.setUsername);
  const authedFetch = useAuthedFetch();
  const [value, setValue] = useState(current);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const valid = /^[a-z0-9_]{3,20}$/.test(clean);
  const changed = clean !== current;

  const submit = async () => {
    if (!valid || !changed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authedFetch("/api/user/username", {
        method: "POST",
        body: JSON.stringify({ username: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update");
        setSubmitting(false);
        return;
      }
      setUsernameInStore(data.username);
      onClose();
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 16, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        className="relative z-10 w-full max-w-sm rounded-xl border border-white/10 bg-[#0a0a12] p-6 space-y-4"
      >
        <div>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
            edit username
          </p>
          <h2 className="text-lg font-black text-white">pick a new handle</h2>
          <p className="text-[11px] text-white/40 mt-1">
            3-20 chars, lowercase letters, numbers, or underscores. You can change this once every 7 days.
          </p>
        </div>

        <div>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => {
              setError(null);
              setValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
            placeholder="new_username"
            className="w-full px-3 py-2.5 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
          />
          {value && clean !== value && (
            <p className="text-[10px] text-white/40 mt-1.5 font-mono">
              will be saved as: <span className="text-violet">{clean || "(empty)"}</span>
            </p>
          )}
          {error && (
            <p className="text-[11px] text-red font-mono mt-1.5">{error}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded bg-white/[0.04] border border-white/10 text-white/60 text-xs font-mono font-bold uppercase tracking-wider hover:bg-white/[0.08]"
          >
            cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || !changed || submitting}
            className={cn(
              "flex-1 px-4 py-2 rounded text-xs font-mono font-bold uppercase tracking-wider transition-all",
              valid && changed && !submitting
                ? "bg-violet/15 border border-violet/40 text-violet hover:bg-violet/25"
                : "bg-white/[0.03] border border-white/[0.06] text-white/30 cursor-not-allowed"
            )}
          >
            {submitting ? "saving..." : "save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
