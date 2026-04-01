"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { MOVE_ICONS, BANKROLL } from "@/lib/game/constants";
import type { BetType, RoundPhase } from "@/lib/game/constants";

interface ActiveBetDisplay {
  betType: BetType;
  amount: number;
}

interface BettingPanelProps {
  phase: RoundPhase;
  balance: number;
  activeBets: ActiveBetDisplay[];
  onPlaceChip: (betType: BetType, chipAmount: number) => void;
  onClearAll: () => void;
  disabled?: boolean;
  winningMove?: string | null;
  roundResult?: string | null;
}

const CHIPS = [1, 5, 10, 25];

const BET_SPOTS = [
  { type: "rock" as BetType, icon: MOVE_ICONS.rock64, label: "Rock", category: "move" },
  { type: "paper" as BetType, icon: MOVE_ICONS.paper64, label: "Paper", category: "move" },
  { type: "scissors" as BetType, icon: MOVE_ICONS.scissors64, label: "Scissors", category: "move" },
  { type: "draw" as BetType, icon: MOVE_ICONS.draw64, label: "Draw", category: "move" },
  { type: "violet" as BetType, icon: "/characters/bull-64.png", label: "Bull", category: "player", color: "violet" },
  { type: "magenta" as BetType, icon: "/characters/bear-64.png", label: "Bear", category: "player", color: "magenta" },
];

export function BettingPanel({
  phase, balance, activeBets, onPlaceChip, onClearAll,
  disabled, winningMove, roundResult,
}: BettingPanelProps) {
  const [selectedChip, setSelectedChip] = useState(1);
  const betsLocked = phase !== "betting" || disabled;
  const isResults = phase === "results";
  const totalBet = activeBets.reduce((sum, b) => sum + b.amount, 0);
  const winnerColor = roundResult === "violet_win" ? "violet" : roundResult === "magenta_win" ? "magenta" : null;

  const getBetAmount = (type: BetType) =>
    activeBets.find((b) => b.betType === type)?.amount || 0;

  const maxBet = BANKROLL.MAX_BET;

  const handleTapSpot = (type: BetType) => {
    if (betsLocked) return;
    if (balance < selectedChip) return;
    // Check max bet per type
    const currentOnType = getBetAmount(type);
    if (currentOnType + selectedChip > maxBet) return;
    onPlaceChip(type, selectedChip);
  };

  const getSpotStyle = (spot: (typeof BET_SPOTS)[0]) => {
    const hasChips = getBetAmount(spot.type) > 0;
    const isWinningMove = isResults && winningMove === spot.type;
    const isWinningPlayer = isResults &&
      ((roundResult === "violet_win" && spot.type === "violet") ||
        (roundResult === "magenta_win" && spot.type === "magenta"));
    const isDraw = isResults && roundResult === "draw";
    const isDrawSpot = spot.type === "draw";
    const isLoser = isResults && !isWinningMove && !isWinningPlayer &&
      !(isDraw && isDrawSpot) && !(isDraw && spot.category === "player");

    if (isWinningMove || isWinningPlayer) {
      return winnerColor === "violet"
        ? "bg-violet/25 border-violet shadow-[0_0_20px_rgba(139,92,246,0.4)] scale-[1.03] ring-1 ring-violet/30"
        : "bg-magenta/25 border-magenta shadow-[0_0_20px_rgba(236,72,153,0.4)] scale-[1.03] ring-1 ring-magenta/30";
    }
    if (isDraw && isDrawSpot) return "bg-cyan/15 border-cyan shadow-[0_0_12px_rgba(6,182,212,0.3)]";
    if (isDraw && spot.category === "player") return "bg-cyan/10 border-cyan/30";
    if (isLoser) return "bg-secondary/20 border-border opacity-35";
    if (hasChips && !betsLocked) {
      if (spot.color === "violet") return "bg-violet/20 border-violet shadow-[0_0_12px_rgba(139,92,246,0.3)]";
      if (spot.color === "magenta") return "bg-magenta/20 border-magenta shadow-[0_0_12px_rgba(236,72,153,0.3)]";
      return "bg-cyan/15 border-cyan shadow-[0_0_10px_rgba(6,182,212,0.3)]";
    }
    if (spot.color === "violet") return "bg-violet/5 border-violet/25 hover:border-violet/50 hover:bg-violet/10";
    if (spot.color === "magenta") return "bg-magenta/5 border-magenta/25 hover:border-magenta/50 hover:bg-magenta/10";
    return "bg-secondary/60 border-border hover:border-violet/30 hover:bg-secondary";
  };

  return (
    <div className="space-y-1.5">
      {/* Move bets — compact row */}
      <div className={cn(
        "bg-card rounded-lg p-2 sm:p-3 border transition-all",
        !betsLocked ? "border-violet/20" : "border-border",
        betsLocked && !isResults && "opacity-50"
      )}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] sm:text-xs font-bold text-foreground uppercase tracking-wide">move bet</span>
          <span className="text-xs sm:text-sm text-cyan font-mono font-black bg-cyan/15 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(6,182,212,0.2)]">2.91x</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BET_SPOTS.filter((s) => s.category === "move").map((spot) => {
            const amount = getBetAmount(spot.type);
            const isWin = isResults && winningMove === spot.type;
            return (
              <button key={spot.type} onClick={() => handleTapSpot(spot.type)}
                disabled={betsLocked && !isResults}
                className={cn("rounded-lg p-1.5 sm:p-2 text-center transition-all border active:scale-95 relative",
                  getSpotStyle(spot), betsLocked && !isResults && "cursor-not-allowed")}>
                <Image src={spot.icon} alt={spot.label} width={32} height={32}
                  className="mx-auto w-7 h-7 sm:w-9 sm:h-9 object-contain" />
                <span className={cn("block text-[9px] sm:text-[10px] font-semibold mt-0.5",
                  isWin ? (winnerColor === "violet" ? "text-violet" : "text-magenta")
                    : isResults && !winningMove && spot.type === "draw" ? "text-cyan"
                    : "text-foreground/70")}>
                  {spot.label}{isWin && " ✓"}
                </span>
                <AnimatePresence>
                  {amount > 0 && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      className="absolute -top-1.5 -right-1.5 bg-cyan text-black text-[8px] font-black rounded-full min-w-[22px] h-4 flex items-center justify-center px-0.5 shadow-[0_0_6px_rgba(6,182,212,0.4)]">
                      ${amount}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>

      {/* Player bets — compact row */}
      <div className={cn(
        "bg-card rounded-lg p-2 sm:p-3 border transition-all",
        !betsLocked ? "border-violet/20" : "border-border",
        betsLocked && !isResults && "opacity-50"
      )}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] sm:text-xs font-bold text-foreground uppercase tracking-wide">player bet</span>
          <span className="text-xs sm:text-sm text-cyan font-mono font-black bg-cyan/15 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(6,182,212,0.2)]">1.94x</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {BET_SPOTS.filter((s) => s.category === "player").map((spot) => {
            const amount = getBetAmount(spot.type);
            const isWin = isResults &&
              ((roundResult === "violet_win" && spot.type === "violet") ||
                (roundResult === "magenta_win" && spot.type === "magenta"));
            return (
              <button key={spot.type} onClick={() => handleTapSpot(spot.type)}
                disabled={betsLocked && !isResults}
                className={cn("rounded-lg p-2 sm:p-3 text-center transition-all border font-bold active:scale-95 relative",
                  getSpotStyle(spot), betsLocked && !isResults && "cursor-not-allowed")}>
                <div className="flex items-center justify-center gap-1.5">
                  <Image src={spot.icon} alt={spot.label} width={24} height={24}
                    className="w-5 h-5 sm:w-7 sm:h-7 object-contain" />
                  <span className={cn("text-sm sm:text-base font-bold",
                    isResults && roundResult === "draw" ? "text-cyan"
                      : spot.color === "violet" ? "text-violet" : "text-magenta")}>
                    {spot.label}{isWin && " ✓"}
                  </span>
                </div>
                <AnimatePresence>
                  {amount > 0 && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      className={cn("absolute -top-1.5 -right-1.5 text-white text-[8px] font-black rounded-full min-w-[22px] h-4 flex items-center justify-center px-0.5",
                        spot.color === "violet" ? "bg-violet shadow-[0_0_6px_rgba(139,92,246,0.4)]"
                          : "bg-magenta shadow-[0_0_6px_rgba(236,72,153,0.4)]")}>
                      ${amount}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chip rack */}
      <div className={cn(
        "bg-card rounded-lg p-2 border border-border transition-all",
        betsLocked && "opacity-0 h-0 p-0 overflow-hidden border-0"
      )}>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1 flex-1">
            {CHIPS.map((chip) => (
              <button key={chip} onClick={() => setSelectedChip(chip)}
                disabled={balance < chip}
                className={cn("flex-1 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-black transition-all border active:scale-95",
                  selectedChip === chip
                    ? "bg-violet/20 border-violet text-violet shadow-[0_0_10px_rgba(139,92,246,0.3)] scale-[1.05]"
                    : "bg-secondary/80 border-border text-foreground/70 hover:border-violet/30",
                  balance < chip && "opacity-25 cursor-not-allowed")}>
                ${chip}
              </button>
            ))}
          </div>
          {totalBet > 0 && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }}
              onClick={onClearAll}
              className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-red bg-red/10 border border-red/30 hover:bg-red/20 active:scale-95">
              CLR
            </motion.button>
          )}
        </div>
        {totalBet > 0 && (
          <div className="mt-1 text-center text-[10px] text-muted-foreground">
            bet: <span className="font-bold text-foreground">${totalBet.toFixed(2)}</span>
            {" · "}bal: ${balance.toFixed(2)}
          </div>
        )}
      </div>

      {/* Phase message */}
      {betsLocked && phase !== "betting" && !isResults && (
        <div className="text-center text-[10px] text-muted-foreground">
          {phase === "countdown" && "bets locked — here we go..."}
          {phase === "battle" && "⚔️ throwing..."}
        </div>
      )}
    </div>
  );
}
