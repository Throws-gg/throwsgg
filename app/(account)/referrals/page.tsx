"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { track } from "@/lib/analytics/posthog";
import { cn } from "@/lib/utils";

// ======= TYPES =======

interface ReferralEntry {
  id: string;
  username: string;
  joinedAt: string;
  totalWagered: number;
  earnings: number;
  status: "pending" | "active" | "activated";
}

interface AffiliateInfo {
  tier: number;
  tierName: string;
  rate: number;
  rolling30dNgr: number;
  tierFloor: number;
  tierCeiling: number | null;
  nextTier: number | null;
  nextTierName: string | null;
  nextTierFloor: number | null;
}

interface PeriodEntry {
  id: string;
  periodStart: string;
  periodEnd: string;
  ngrGenerated: number;
  grossCommission: number;
  netCommission: number;
  status: "open" | "held" | "claimable" | "paid" | "voided";
  heldUntil: string | null;
  paidAt: string | null;
}

interface ReferralsData {
  referralCode: string;
  isAffiliate: boolean;
  referralRate: number | null;
  affiliate: AffiliateInfo | null;
  stats: {
    totalReferrals: number;
    activatedReferrals: number;
    claimable: number;
    heldInPeriods?: number;
    unrolledPending?: number;
    lifetime: number;
  };
  referrals: ReferralEntry[];
  periods?: PeriodEntry[];
}

// ======= HELPERS =======

function formatCurrency(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ======= MAIN PAGE =======

export default function ReferralsPage() {
  const userId = useUserStore((s) => s.userId);
  const username = useUserStore((s) => s.username);
  const setBalance = useUserStore((s) => s.setBalance);
  const authedFetch = useAuthedFetch();

  const [data, setData] = useState<ReferralsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ amount: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    // Wait for the user store to hydrate. If the user is actually signed out,
    // PrivyAuthBridge will leave username/userId null forever — but the navbar
    // shows "sign in" then, and this page isn't reachable through nav anyway.
    if (!userId) return;

    setFetchError(null);
    try {
      const res = await authedFetch(`/api/referrals/me?userId=${userId}`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setFetchError(json.error || "Failed to load referrals");
      }
    } catch {
      setFetchError("Network error");
    }
    setLoading(false);
  }, [userId, authedFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const referralCode = data?.referralCode || "";
  const referralLink = referralCode ? `throws.gg/r/${referralCode}` : "";
  const fullReferralLink = referralCode
    ? `https://throws.gg/r/${referralCode}`
    : "";

  const handleCopy = useCallback(() => {
    if (!fullReferralLink) return;
    navigator.clipboard.writeText(fullReferralLink);
    track("referral_link_copied", { referral_code: referralCode });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullReferralLink, referralCode]);

  const handleShareX = useCallback(() => {
    if (!fullReferralLink) return;
    track("referral_shared_x", { referral_code: referralCode });
    const text = encodeURIComponent(
      `16 AI horses. new race every 3 minutes. provably fair. crypto-native.\n\nthrows.gg is the fastest horse racing on the internet. $20 free when you sign up:\n\n${fullReferralLink}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }, [fullReferralLink, referralCode]);

  const handleClaim = useCallback(async () => {
    if (!userId || claiming || !data) return;
    if (data.stats.claimable < 0.01) return;

    setClaiming(true);
    try {
      const res = await authedFetch("/api/referrals/claim", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        track("referral_earnings_claimed", {
          amount_usd: json.claimed,
          new_balance: json.newBalance,
        });
        setClaimResult({ amount: json.claimed });
        setBalance(json.newBalance);
        await fetchData();
        setTimeout(() => setClaimResult(null), 3000);
      }
    } catch {
      // silent
    }
    setClaiming(false);
  }, [userId, claiming, data, setBalance, fetchData]);

  // Truly signed out: both userId and username are null.
  if (!userId && !username) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground text-sm">Sign in to view your referrals</p>
      </div>
    );
  }

  // Signed in but still hydrating store or fetching data.
  if (loading || !data) {
    if (fetchError) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-red/80 text-sm font-mono">{fetchError}</p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-5 h-5 border-2 border-violet/40 border-t-violet rounded-full animate-spin" />
      </div>
    );
  }

  const { affiliate, stats, referrals } = data;
  const periods = data.periods || [];
  const displayRate = affiliate?.rate ?? data.referralRate ?? 0.20;

  // Progress to next tier (affiliates only)
  const tierProgress =
    affiliate && affiliate.nextTierFloor
      ? Math.min(
          1,
          (affiliate.rolling30dNgr - affiliate.tierFloor) /
            (affiliate.nextTierFloor - affiliate.tierFloor)
        )
      : 1;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] pb-20 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ===== HERO: REFERRAL LINK ===== */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl border border-violet/20 bg-gradient-to-br from-violet/[0.08] to-magenta/[0.04] p-6 space-y-5"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet/10 rounded-full blur-[100px] -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-magenta/8 rounded-full blur-[80px] -ml-16 -mb-16" />

          <div className="relative space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-white">
                Earn while they play.
              </h1>
              <p className="text-sm text-white/35">
                Share your link. Earn{" "}
                <span className="text-green font-bold">
                  {(displayRate * 100).toFixed(0)}% of the NGR
                </span>{" "}
                on every bet your referrals make. Forever.
              </p>
            </div>

            {/* Referral link box */}
            <div className="rounded-xl bg-black/30 border border-white/[0.08] p-4 space-y-3 backdrop-blur-sm">
              <p className="text-[10px] text-white/25 uppercase tracking-widest font-medium">
                Your Referral Link
              </p>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 overflow-hidden">
                  <p className="font-mono text-sm text-white/70 truncate select-all">
                    {referralLink}
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  className={cn(
                    "shrink-0 px-4 py-3 rounded-lg text-sm font-bold transition-all active:scale-95",
                    copied
                      ? "bg-green/15 border border-green/30 text-green"
                      : "bg-violet text-white hover:bg-violet/80 shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                  )}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleShareX}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/60 text-xs font-semibold hover:bg-white/[0.06] hover:text-white/80 active:scale-[0.98] transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Share on X
                </button>
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/60 text-xs font-semibold hover:bg-white/[0.06] hover:text-white/80 active:scale-[0.98] transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===== TIER BADGE + PROGRESS (affiliates only) ===== */}
        {affiliate && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
                  Your Tier
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl font-black text-white">
                    {affiliate.tierName}
                  </span>
                  <span className="text-[10px] bg-violet/15 border border-violet/30 text-violet font-bold px-2 py-0.5 rounded-full">
                    {(affiliate.rate * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
                  30-day NGR
                </p>
                <p className="text-xl font-black font-mono text-white tabular-nums mt-1">
                  {formatCurrency(affiliate.rolling30dNgr)}
                </p>
              </div>
            </div>

            {/* Progress to next tier */}
            {affiliate.nextTier !== null && affiliate.nextTierFloor !== null && (
              <div className="space-y-1.5">
                <div className="relative h-2 rounded-full bg-white/[0.04] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${tierProgress * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet to-magenta shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                  />
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/30">Now: {affiliate.tierName}</span>
                  <span className="text-white/25">
                    {formatCurrency(
                      Math.max(0, affiliate.nextTierFloor - affiliate.rolling30dNgr)
                    )}{" "}
                    to {affiliate.nextTierName}
                  </span>
                </div>
              </div>
            )}

            {affiliate.nextTier === null && (
              <p className="text-[11px] text-center text-gold font-semibold">
                You&apos;ve hit the top tier.
              </p>
            )}
          </motion.div>
        )}

        {/* ===== STATS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-xl font-black font-mono tabular-nums text-white">
              {stats.totalReferrals}
            </p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">
              Referrals
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-xl font-black font-mono tabular-nums text-green">
              {formatCurrency(stats.lifetime)}
            </p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">
              Lifetime
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-xl font-black font-mono tabular-nums text-gold">
              {formatCurrency(stats.claimable)}
            </p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">
              Claimable
            </p>
          </div>
        </motion.div>

        {/* ===== HOLD BREAKDOWN (affiliates only) ===== */}
        {affiliate && ((stats.heldInPeriods ?? 0) > 0 || (stats.unrolledPending ?? 0) > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2 text-[11px]"
          >
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
              Pipeline
            </p>
            <div className="flex items-center justify-between text-white/50">
              <span>Not yet rolled up</span>
              <span className="font-mono">
                ${(stats.unrolledPending ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-white/50">
              <span>In 7-day hold</span>
              <span className="font-mono">${(stats.heldInPeriods ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.04] text-gold font-semibold">
              <span>Ready to claim</span>
              <span className="font-mono">${stats.claimable.toFixed(2)}</span>
            </div>
          </motion.div>
        )}

        {/* ===== CLAIM BUTTON ===== */}
        {stats.claimable >= 0.01 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <button
              onClick={handleClaim}
              disabled={claiming}
              className={cn(
                "w-full py-3.5 rounded-xl font-black text-sm transition-all active:scale-[0.99]",
                "bg-gradient-to-r from-green to-green/80 text-black",
                "shadow-[0_4px_20px_rgba(52,211,153,0.25)]",
                "hover:opacity-90",
                claiming && "opacity-60 cursor-not-allowed"
              )}
            >
              {claiming ? "Claiming..." : `Claim $${stats.claimable.toFixed(2)} to Balance`}
            </button>
          </motion.div>
        )}

        {/* ===== CLAIM SUCCESS TOAST ===== */}
        <AnimatePresence>
          {claimResult && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="rounded-xl border border-green/30 bg-green/[0.08] px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-green/20 flex items-center justify-center shrink-0">
                <svg
                  className="w-4 h-4 text-green"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-green text-sm font-bold">
                  +${claimResult.amount.toFixed(2)} added to balance
                </p>
                <p className="text-[10px] text-white/40">Ready to bet</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== HOW IT WORKS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-4"
        >
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
            How It Works
          </p>

          <div className="grid grid-cols-3 gap-3">
            {[
              {
                step: "01",
                title: "Share",
                desc: "Send your link on X, Discord, or anywhere",
                color: "#8B5CF6",
              },
              {
                step: "02",
                title: "They play",
                desc: "They wager 3x their first deposit to unlock you",
                color: "#EC4899",
              },
              {
                step: "03",
                title: "You earn",
                desc: "Weekly payouts after a 7-day hold period",
                color: "#34D399",
              },
            ].map((item) => (
              <div key={item.step} className="space-y-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black"
                  style={{ backgroundColor: `${item.color}15`, color: item.color }}
                >
                  {item.step}
                </div>
                <h3 className="text-sm font-bold text-white/80">{item.title}</h3>
                <p className="text-[11px] text-white/25 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ===== TIER TABLE (affiliates only) ===== */}
        {affiliate && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-white/[0.04]">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
                Tier Structure
              </p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {[
                { tier: 1, name: "Rookie", rate: 35, threshold: "$0 – $25k" },
                { tier: 2, name: "Trainer", rate: 40, threshold: "$25k – $100k" },
                { tier: 3, name: "Owner", rate: 45, threshold: "$100k+" },
              ].map((t) => (
                <div
                  key={t.tier}
                  className={cn(
                    "flex items-center justify-between px-5 py-3",
                    affiliate.tier === t.tier && "bg-violet/[0.05]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black",
                        affiliate.tier === t.tier
                          ? "bg-violet text-white"
                          : affiliate.tier > t.tier
                            ? "bg-green/15 text-green"
                            : "bg-white/[0.04] text-white/30"
                      )}
                    >
                      {affiliate.tier > t.tier ? "✓" : t.tier}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        affiliate.tier === t.tier ? "text-white" : "text-white/50"
                      )}
                    >
                      {t.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-white/35 font-mono">
                      {t.threshold}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-black font-mono w-10 text-right",
                        affiliate.tier === t.tier ? "text-violet" : "text-white/40"
                      )}
                    >
                      {t.rate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ===== RECENT PERIODS ===== */}
        {periods.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-white/[0.04]">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
                Recent Weeks
              </p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {periods.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-5 py-2.5 text-[11px]"
                >
                  <div>
                    <p className="text-white/70 font-medium">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </p>
                    <p className="text-white/25 text-[10px]">
                      NGR: ${p.ngrGenerated.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-green">
                      ${p.netCommission.toFixed(2)}
                    </p>
                    <p
                      className={cn(
                        "text-[9px] font-bold uppercase",
                        p.status === "paid" && "text-white/30",
                        p.status === "claimable" && "text-gold",
                        p.status === "held" && "text-white/40",
                        p.status === "voided" && "text-red/50"
                      )}
                    >
                      {p.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ===== REFERRAL LIST ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
              Your Referrals
            </p>
            <p className="text-[10px] text-white/20">
              {stats.totalReferrals} total &middot; {stats.activatedReferrals} activated
            </p>
          </div>

          {referrals.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-violet/10 border border-violet/20 flex items-center justify-center text-[10px] font-bold text-violet shrink-0">
                    {ref.username.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white/80 truncate">
                        {ref.username}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                          ref.status === "activated" &&
                            "bg-green/10 text-green/80",
                          ref.status === "active" &&
                            "bg-gold/10 text-gold/70",
                          ref.status === "pending" &&
                            "bg-white/[0.04] text-white/25"
                        )}
                      >
                        {ref.status === "activated"
                          ? "Activated"
                          : ref.status === "active"
                            ? "Wagering"
                            : "Pending"}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/20">
                      Joined {formatDate(ref.joinedAt)}
                      {ref.totalWagered > 0 && (
                        <span> &middot; ${ref.totalWagered.toLocaleString()} wagered</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={cn(
                        "text-sm font-bold font-mono tabular-nums",
                        ref.earnings > 0 ? "text-green" : "text-white/20"
                      )}
                    >
                      {ref.earnings > 0 ? `+$${ref.earnings.toFixed(2)}` : "$0.00"}
                    </p>
                    <p className="text-[9px] text-white/15">earned</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center space-y-1">
              <p className="text-white/20 text-sm">No referrals yet</p>
              <p className="text-white/10 text-xs">Share your link to start earning</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
