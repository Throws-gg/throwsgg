"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { RoundResult } from "@/lib/game/constants";

interface Winner {
  username: string;
  amount: number;
  payout: number;
  betType: string;
}

interface RoundWinnersProps {
  winners: Winner[];
  result: RoundResult | null;
  visible: boolean;
}

export function RoundWinners({ winners, result, visible }: RoundWinnersProps) {
  if (!visible || winners.length === 0) return null;

  const sorted = [...winners].sort((a, b) => b.payout - a.payout);
  const top = sorted.slice(0, 5);

  const resultColor =
    result === "violet_win"
      ? "text-violet"
      : result === "magenta_win"
        ? "text-magenta"
        : "text-muted-foreground";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-card border border-border rounded-lg overflow-hidden"
        >
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              round winners
            </span>
            <span className={cn("text-xs font-bold", resultColor)}>
              {winners.length} winner{winners.length !== 1 && "s"}
            </span>
          </div>

          <div className="divide-y divide-border">
            {top.map((winner, i) => (
              <motion.div
                key={`${winner.username}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center justify-between px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <span className="text-gold text-sm">👑</span>
                  )}
                  {i === 1 && (
                    <span className="text-muted-foreground text-sm">🥈</span>
                  )}
                  {i === 2 && (
                    <span className="text-muted-foreground text-sm">🥉</span>
                  )}
                  {i > 2 && (
                    <span className="text-muted-foreground text-xs w-5 text-center">
                      {i + 1}
                    </span>
                  )}
                  <span className="text-sm font-medium truncate max-w-[120px]">
                    {winner.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {winner.betType}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-green font-bold font-mono text-sm">
                    +${winner.payout.toFixed(2)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {sorted.length > 5 && (
            <div className="px-4 py-1.5 text-center">
              <span className="text-[10px] text-muted-foreground">
                +{sorted.length - 5} more winners
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Placeholder version when no real winners data is available yet.
 * Shows a "no bets this round" or placeholder during results phase.
 */
export function RoundWinnersPlaceholder({
  visible,
  result,
}: {
  visible: boolean;
  result: RoundResult | null;
}) {
  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className={
            result === "draw"
              ? "bg-cyan/5 border border-cyan/20 rounded-lg px-4 py-3 text-center"
              : "bg-card border border-border rounded-lg px-4 py-3 text-center"
          }
        >
          <p className={result === "draw" ? "text-xs text-cyan" : "text-xs text-muted-foreground"}>
            {result === "draw"
              ? "draw — player bets refunded 🤝"
              : "no bets this round — be the first next time"}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
