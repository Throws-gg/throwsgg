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
      if (spot.color === "violet") return "bg-gradient-to-b from-violet/20 to-violet/8 border-violet shadow-[0_0_16px_rgba(139,92,246,0.2)]";
      if (spot.color === "magenta") return "bg-gradient-to-b from-magenta/20 to-magenta/8 border-magenta shadow-[0_0_16px_rgba(236,72,153,0.2)]";
      return "bg-gradient-to-b from-cyan/15 to-cyan/5 border-cyan shadow-[0_0_16px_rgba(6,182,212,0.15)]";
    }
    if (spot.color === "violet") return "bg-gradient-to-b from-violet/8 to-violet/3 border-violet/25 hover:border-violet/50 hover:from-violet/12 hover:to-violet/5 hover:shadow-[inset_0_1px_0_rgba(139,92,246,0.15)]";
    if (spot.color === "magenta") return "bg-gradient-to-b from-magenta/8 to-magenta/3 border-magenta/25 hover:border-magenta/50 hover:from-magenta/12 hover:to-magenta/5 hover:shadow-[inset_0_1px_0_rgba(236,72,153,0.15)]";
    return "bg-gradient-to-b from-white/[0.05] to-white/[0.01] border-[rgba(255,255,255,0.1)] hover:border-violet/30 hover:from-violet/[0.08] hover:to-violet/[0.02] hover:shadow-[inset_0_1px_0_rgba(139,92,246,0.15)]";
  };

  return (
    <div className="space-y-2.5">
      {/* Move bets — compact row */}
      <div className={cn(
        "bg-card rounded-lg p-2 sm:p-3 border transition-all",
        !betsLocked ? "border-violet/20" : "border-border",
        betsLocked && !isResults && "opacity-50"
      )}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] sm:text-xs font-bold text-foreground uppercase tracking-wide">move bet</span>
          <span className="text-sm sm:text-base text-cyan font-mono font-black bg-cyan/10 px-2.5 py-0.5 rounded">2.91x</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BET_SPOTS.filter((s) => s.category === "move").map((spot) => {
            const amount = getBetAmount(spot.type);
            const isWin = isResults && winningMove === spot.type;
            return (
              <button key={spot.type} onClick={() => handleTapSpot(spot.type)}
                disabled={betsLocked && !isResults}
                className={cn("rounded-xl p-2 sm:p-2.5 text-center transition-all border relative min-h-[52px] sm:min-h-[60px]",
                  "active:scale-90 active:brightness-125 transition-[transform,filter,background,border,box-shadow] duration-75",
                  getSpotStyle(spot), betsLocked && !isResults && "cursor-not-allowed")}>
                <Image src={spot.icon} alt={spot.label} width={32} height={32}
                  className="mx-auto w-8 h-8 sm:w-10 sm:h-10 object-contain" />
                <span className={cn("block text-[9px] sm:text-[11px] font-bold mt-0.5",
                  isWin ? (winnerColor === "violet" ? "text-violet" : "text-magenta")
                    : isResults && !winningMove && spot.type === "draw" ? "text-cyan"
                    : "text-foreground/70")}>
                  {spot.label}{isWin && " ✓"}
                </span>
                <AnimatePresence>
                  {amount > 0 && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className="absolute -top-2 -right-2 bg-cyan text-black text-[9px] font-black rounded-full min-w-[28px] h-5 flex items-center justify-center px-1 shadow-[0_0_8px_rgba(6,182,212,0.4)]">
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
          <span className="text-sm sm:text-base text-cyan font-mono font-black bg-cyan/10 px-2.5 py-0.5 rounded">1.94x</span>
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
                className={cn("rounded-xl p-2.5 sm:p-3.5 text-center transition-all border font-bold relative min-h-[48px]",
                  "active:scale-90 active:brightness-125 transition-[transform,filter,background,border,box-shadow] duration-75",
                  getSpotStyle(spot), betsLocked && !isResults && "cursor-not-allowed")}>
                <div className="flex items-center justify-center gap-2">
                  <Image src={spot.icon} alt={spot.label} width={24} height={24}
                    className="w-6 h-6 sm:w-8 sm:h-8 object-contain" />
                  <span className={cn("text-sm sm:text-base font-black",
                    isResults && roundResult === "draw" ? "text-cyan"
                      : spot.color === "violet" ? "text-violet" : "text-magenta")}>
                    {spot.label}{isWin && " ✓"}
                  </span>
                </div>
                <AnimatePresence>
                  {amount > 0 && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className={cn("absolute -top-2 -right-2 text-white text-[9px] font-black rounded-full min-w-[28px] h-5 flex items-center justify-center px-1",
                        spot.color === "violet" ? "bg-violet shadow-[0_0_8px_rgba(139,92,246,0.4)]"
                          : "bg-magenta shadow-[0_0_8px_rgba(236,72,153,0.4)]")}>
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
                className={cn("flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black border",
                  "active:scale-90 active:brightness-125 transition-[transform,filter,background,border,box-shadow] duration-75",
                  selectedChip === chip
                    ? "bg-violet/15 border-violet text-violet scale-[1.03] shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                    : "bg-secondary/80 border-[rgba(255,255,255,0.1)] text-foreground/70 hover:border-foreground/20",
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
