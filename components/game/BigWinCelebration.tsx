"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type WinTier = "none" | "small" | "medium" | "big";

function getWinTier(amount: number): WinTier {
  if (amount >= 100) return "big";
  if (amount >= 25) return "medium";
  if (amount >= 10) return "small";
  return "none";
}

function ConfettiLayer({ count }: { count: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: `${Math.random() * 100}vw`,
        rotate: Math.random() * 720 - 360,
        duration: 2 + Math.random() * 2,
        delay: Math.random() * 0.5,
        color: i % 3 === 0 ? "bg-violet" : i % 3 === 1 ? "bg-magenta" : "bg-gold",
      })),
    [count]
  );

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute w-2 h-2 rounded-full ${p.color}`}
          initial={{ x: p.x, y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: "110vh", rotate: p.rotate, opacity: 0 }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
        />
      ))}
    </div>
  );
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

    // Screen shake for big wins
    if (tier === "big" || tier === "medium") {
      document.body.classList.add("animate-screen-shake");
      setTimeout(() => document.body.classList.remove("animate-screen-shake"), 400);
    }

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
            <ConfettiLayer count={tier === "big" ? 40 : 16} />
          )}

          {/* Big win overlay */}
          {tier === "big" && (
            <motion.div
              className="fixed inset-0 z-[99] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/40 pointer-events-none" />
              <motion.div
                className="text-center relative z-10"
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
                {/* Share on X button */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => {
                    const text = encodeURIComponent(
                      `just hit +$${winAmount?.toFixed(2)} on @throwsgg LFG`
                    );
                    window.open(
                      `https://x.com/intent/tweet?text=${text}`,
                      "_blank"
                    );
                  }}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                    bg-white/10 border border-white/20 text-white text-sm font-bold
                    hover:bg-white/15 active:scale-95 transition-all backdrop-blur-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Share on X
                </motion.button>
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
