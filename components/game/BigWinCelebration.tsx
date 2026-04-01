"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type WinTier = "none" | "small" | "medium" | "big";

function getWinTier(amount: number): WinTier {
  if (amount >= 500) return "big";
  if (amount >= 100) return "medium";
  if (amount >= 50) return "small";
  return "none";
}

interface BigWinCelebrationProps {
  winAmount: number | null;
  username?: string;
  onComplete?: () => void;
}

export function BigWinCelebration({
  winAmount,
  username,
  onComplete,
}: BigWinCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const tier = winAmount ? getWinTier(winAmount) : "none";

  useEffect(() => {
    if (tier === "none" || !winAmount) return;

    setVisible(true);
    const duration = tier === "big" ? 4000 : tier === "medium" ? 3000 : 2000;

    const timeout = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timeout);
  }, [winAmount, tier, onComplete]);

  if (tier === "none") return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Confetti particles */}
          {(tier === "medium" || tier === "big") && (
            <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
              {Array.from({ length: tier === "big" ? 50 : 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className={`absolute w-2 h-2 rounded-full ${
                    i % 3 === 0
                      ? "bg-violet"
                      : i % 3 === 1
                        ? "bg-magenta"
                        : "bg-gold"
                  }`}
                  initial={{
                    x: `${Math.random() * 100}vw`,
                    y: -20,
                    rotate: 0,
                    opacity: 1,
                  }}
                  animate={{
                    y: "110vh",
                    rotate: Math.random() * 720 - 360,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 2 + Math.random() * 2,
                    delay: Math.random() * 0.5,
                    ease: "easeIn",
                  }}
                />
              ))}
            </div>
          )}

          {/* Big win overlay */}
          {tier === "big" && (
            <motion.div
              className="fixed inset-0 z-[99] flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="text-center"
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 10 }}
              >
                <div className="text-6xl sm:text-8xl font-black text-gold drop-shadow-[0_0_30px_rgba(245,158,11,0.5)]">
                  +${winAmount?.toFixed(2)}
                </div>
                {username && (
                  <div className="text-xl text-gold/80 mt-2 font-bold">
                    {username} ABSOLUTE UNIT
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Medium win toast */}
          {tier === "medium" && (
            <motion.div
              className="fixed top-20 left-1/2 z-[99] pointer-events-none"
              initial={{ x: "-50%", y: -50, opacity: 0 }}
              animate={{ x: "-50%", y: 0, opacity: 1 }}
              exit={{ x: "-50%", y: -50, opacity: 0 }}
            >
              <div className="bg-gold/20 border border-gold/40 rounded-lg px-6 py-3 text-center backdrop-blur-sm">
                <div className="text-2xl font-bold text-gold">
                  +${winAmount?.toFixed(2)}
                </div>
                {username && (
                  <div className="text-sm text-gold/70">{username} cooked</div>
                )}
              </div>
            </motion.div>
          )}

          {/* Small win - just inline animation handled elsewhere */}
        </>
      )}
    </AnimatePresence>
  );
}
