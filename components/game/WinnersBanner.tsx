"use client";

import { motion, AnimatePresence } from "framer-motion";

interface WinnersBannerProps {
  visible: boolean;
  winnerCount: number;
  totalPayout: number;
}

export function WinnersBanner({
  visible,
  winnerCount,
  totalPayout,
}: WinnersBannerProps) {
  return (
    <AnimatePresence>
      {visible && winnerCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: "spring", damping: 15 }}
          className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-3 text-center"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-gold text-lg">🎉</span>
            <span className="text-sm font-bold text-gold">
              {winnerCount} {winnerCount === 1 ? "winner" : "winners"} took home
              ${totalPayout.toFixed(2)}
            </span>
            <span className="text-gold text-lg">🎉</span>
          </div>
          <p className="text-[10px] text-gold/60 mt-0.5">
            congrats degens
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
