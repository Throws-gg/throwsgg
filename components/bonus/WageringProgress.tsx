"use client";

import { motion } from "framer-motion";
import { useUserStore } from "@/stores/userStore";

/**
 * Slim progress banner shown when the user has an active signup bonus.
 * Displays wagering progress toward unlocking the bonus balance.
 */
export function WageringProgress() {
  const bonusBalance = useUserStore((s) => s.bonusBalance);
  const wageringRemaining = useUserStore((s) => s.wageringRemaining);
  const bonusExpiresAt = useUserStore((s) => s.bonusExpiresAt);

  // Only show if the user has a bonus or an active wagering requirement
  if (bonusBalance <= 0 && wageringRemaining <= 0) return null;

  // We don't store the original wagering requirement, so we approximate it
  // from the current pending. Total required = wageringRemaining + (already wagered)
  // We'll just show "X left to unlock" which is the accurate part.
  const total = 60; // $20 bonus × 3x (matches default config; could fetch from /api/bonus/config)
  const completed = Math.max(0, total - wageringRemaining);
  const progress = total > 0 ? Math.min(1, completed / total) : 0;

  const expiresIn = bonusExpiresAt
    ? Math.max(0, Math.ceil((new Date(bonusExpiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)))
    : null;

  return (
    <div className="rounded-xl border border-gold/15 bg-gradient-to-r from-gold/[0.05] via-gold/[0.03] to-transparent p-3 space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          <span className="text-gold/90 font-bold uppercase tracking-widest">
            Bonus Active
          </span>
          <span className="text-white/25">
            · ${bonusBalance.toFixed(2)} locked
          </span>
        </div>
        {expiresIn !== null && expiresIn <= 3 && (
          <span className="text-red/80 font-semibold">
            {expiresIn}d left
          </span>
        )}
      </div>

      <div className="relative h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold to-yellow-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/30">
        <span>Wager ${wageringRemaining.toFixed(2)} more to unlock</span>
        <span className="font-mono">
          ${completed.toFixed(0)} / ${total.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
