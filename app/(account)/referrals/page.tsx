"use client";

import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

// ======= MOCK DATA =======

const MOCK_REFERRALS = [
  { username: "moonboy_42", joinedAt: "2026-04-01", totalWagered: 1240, earnings: 18.60, status: "active" as const },
  { username: "rugsurvivr", joinedAt: "2026-03-28", totalWagered: 860, earnings: 12.90, status: "active" as const },
  { username: "degenape", joinedAt: "2026-03-25", totalWagered: 320, earnings: 4.80, status: "active" as const },
  { username: "sol_whale", joinedAt: "2026-04-05", totalWagered: 0, earnings: 0, status: "pending" as const },
];

// ======= MAIN PAGE =======

export default function ReferralsPage() {
  const { userId, username } = useUserStore();
  const [copied, setCopied] = useState(false);

  // Generate referral code from username
  const referralCode = useMemo(() => {
    if (!username) return "XXXXXX";
    return username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  }, [username]);

  const referralLink = `throws.gg/r/${referralCode}`;
  const fullReferralLink = `https://throws.gg/r/${referralCode}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullReferralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullReferralLink]);

  const handleShareX = useCallback(() => {
    const text = encodeURIComponent(
      `bet on AI horse racing at throws.gg\n\nnew race every 3 min, provably fair, crypto-native\n\nuse my link for a bonus: ${fullReferralLink}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }, [fullReferralLink]);

  // Stats
  const totalReferrals = MOCK_REFERRALS.length;
  const totalEarned = MOCK_REFERRALS.reduce((sum, r) => sum + r.earnings, 0);
  const pendingEarnings = MOCK_REFERRALS.filter(r => r.status === "active").reduce((sum, r) => sum + r.earnings * 0.1, 0);

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
          {/* Background effects */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet/10 rounded-full blur-[100px] -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-magenta/8 rounded-full blur-[80px] -ml-16 -mb-16" />

          <div className="relative space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-white">
                Earn while they play.
              </h1>
              <p className="text-sm text-white/35">
                Share your link. When your referrals bet, you earn{" "}
                <span className="text-green font-bold">5% of the house edge</span> on every bet they make. Forever.
              </p>
            </div>

            {/* Referral link box */}
            <div className="rounded-xl bg-black/30 border border-white/[0.08] p-4 space-y-3 backdrop-blur-sm">
              <p className="text-[10px] text-white/25 uppercase tracking-widest font-medium">Your Referral Link</p>

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

              {/* Share buttons */}
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

        {/* ===== STATS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-2xl font-black font-mono tabular-nums text-white">{totalReferrals}</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">Referrals</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-2xl font-black font-mono tabular-nums text-green">${totalEarned.toFixed(2)}</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">Earned</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-4 text-center">
            <p className="text-2xl font-black font-mono tabular-nums text-gold">${pendingEarnings.toFixed(2)}</p>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mt-1">Pending</p>
          </div>
        </motion.div>

        {/* ===== HOW IT WORKS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-5 space-y-4"
        >
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">How It Works</p>

          <div className="grid grid-cols-3 gap-3">
            {[
              {
                step: "01",
                title: "Share",
                desc: "Send your unique link to friends on X, Discord, or anywhere",
                color: "#8B5CF6",
              },
              {
                step: "02",
                title: "They play",
                desc: "When they sign up and start betting, you're linked forever",
                color: "#EC4899",
              },
              {
                step: "03",
                title: "You earn",
                desc: "5% of the house edge on every bet they make. Paid in real-time",
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

        {/* ===== COMMISSION DETAILS ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="rounded-xl border border-green/10 bg-green/[0.02] p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green/15 flex items-center justify-center">
              <span className="text-green text-[11px] font-black">$</span>
            </div>
            <p className="text-sm font-bold text-white/80">Commission Structure</p>
          </div>
          <div className="space-y-2 text-[12px] text-white/35 leading-relaxed">
            <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span>Base commission rate</span>
              <span className="font-bold text-green font-mono">5%</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span>Commission calculated on</span>
              <span className="text-white/50 font-medium">House edge per bet</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span>Duration</span>
              <span className="text-white/50 font-medium">Lifetime</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span>Minimum payout</span>
              <span className="text-white/50 font-medium font-mono">$1.00</span>
            </div>
          </div>
        </motion.div>

        {/* ===== REFERRAL LIST ===== */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-white/[0.04] flex items-center justify-between">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">Your Referrals</p>
            <p className="text-[10px] text-white/20">{totalReferrals} total</p>
          </div>

          {MOCK_REFERRALS.length > 0 ? (
            <div className="divide-y divide-white/[0.04]">
              {MOCK_REFERRALS.map((ref) => (
                <div key={ref.username} className="flex items-center gap-3 px-5 py-3">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-violet/10 border border-violet/20 flex items-center justify-center text-[10px] font-bold text-violet shrink-0">
                    {ref.username.slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white/80 truncate">{ref.username}</span>
                      <span className={cn(
                        "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                        ref.status === "active"
                          ? "bg-green/10 text-green/70"
                          : "bg-white/[0.04] text-white/25"
                      )}>
                        {ref.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/20">
                      Joined {new Date(ref.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {ref.totalWagered > 0 && (
                        <span> &middot; ${ref.totalWagered.toLocaleString()} wagered</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={cn(
                      "text-sm font-bold font-mono tabular-nums",
                      ref.earnings > 0 ? "text-green" : "text-white/20"
                    )}>
                      {ref.earnings > 0 ? `+$${ref.earnings.toFixed(2)}` : "$0.00"}
                    </p>
                    <p className="text-[9px] text-white/15">earned</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <p className="text-white/20 text-sm">No referrals yet</p>
              <p className="text-white/10 text-xs mt-1">Share your link to start earning</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
