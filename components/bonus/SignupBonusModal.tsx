"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

interface BonusData {
  granted: boolean;
  bonus_amount?: number;
  wagering_required?: number;
  expires_at?: string;
  signups_remaining?: number;
}

const STORAGE_KEY = "throws_signup_bonus_granted";

/**
 * Pops up on first page load after a user signs up and receives the signup bonus.
 * Reads from localStorage (set by the auth sync flow) and clears once dismissed.
 */
export function SignupBonusModal() {
  const [data, setData] = useState<BonusData | null>(null);
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as BonusData;
      if (parsed?.granted) {
        setData(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setData(null);
  };

  const handleStartBetting = () => {
    handleDismiss();
    router.push("/racing");
  };

  if (!data) return null;

  const bonusAmount = data.bonus_amount || 20;
  const wageringRequired = data.wagering_required || 60;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={handleDismiss}
        />

        {/* Modal */}
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className="relative z-10 w-full max-w-sm rounded-2xl border border-gold/30
            bg-gradient-to-br from-[#15100a] via-[#0e0a14] to-[#0e1014]
            shadow-[0_30px_80px_-20px_rgba(245,158,11,0.3)]
            overflow-hidden"
        >
          {/* Ambient glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gold/15 rounded-full blur-[100px] -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet/10 rounded-full blur-[80px] -ml-16 -mb-16" />

          {/* Content */}
          <div className="relative p-6 space-y-5 text-center">
            {/* Top icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: "spring", damping: 12 }}
              className="mx-auto w-16 h-16 rounded-full bg-gold/15 border-2 border-gold/40 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]"
            >
              <span className="text-3xl">🎁</span>
            </motion.div>

            {/* Headline */}
            <div className="space-y-1">
              <p className="text-[10px] text-gold/60 font-bold uppercase tracking-[0.2em]">
                Welcome bonus
              </p>
              <h2 className="text-3xl font-black text-white">
                You got{" "}
                <span className="bg-gradient-to-r from-gold to-yellow-300 bg-clip-text text-transparent">
                  ${bonusAmount}
                </span>
              </h2>
              <p className="text-xs text-white/40">
                added to your bonus balance
              </p>
            </div>

            {/* Terms */}
            <div className="rounded-xl bg-black/30 border border-white/[0.08] p-4 space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-white/50">Wagering requirement</span>
                <span className="text-white font-bold font-mono">
                  ${wageringRequired.toFixed(0)} (3x)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/50">Expires</span>
                <span className="text-white font-bold">14 days</span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleStartBetting}
              className="w-full py-3.5 rounded-xl font-black text-sm tracking-wide
                bg-gradient-to-r from-gold to-yellow-400 text-black
                shadow-[0_6px_24px_rgba(245,158,11,0.35)]
                hover:opacity-95 active:scale-[0.99] transition-all"
            >
              START BETTING
            </button>

            <button
              onClick={handleDismiss}
              className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
            >
              I&apos;ll check it out later
            </button>

            {typeof data.signups_remaining === "number" && (
              <p className="text-[10px] text-gold/40 font-mono">
                {data.signups_remaining} signup bonuses remaining
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
