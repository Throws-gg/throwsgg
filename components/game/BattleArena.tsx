"use client";

import { useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { PLAYER_NAMES, PLAYER_IMAGES, MOVE_ICONS } from "@/lib/game/constants";
import type { RoundPhase, Move, RoundResult } from "@/lib/game/constants";

interface BattleArenaProps {
  phase: RoundPhase;
  timeRemaining: number;
  violetMove?: Move | null;
  magentaMove?: Move | null;
  result?: RoundResult | null;
  roundNumber?: number;
}

const MOVE_ICON_SRC: Record<Move, string> = {
  rock: MOVE_ICONS.rock96,
  paper: MOVE_ICONS.paper96,
  scissors: MOVE_ICONS.scissors96,
};

const COMMENTARY: Record<string, string[]> = {
  betting: ["place your throws, degens", "who's cooking this round?", "bull or bear?", "lock it in"],
  countdown: ["here we go...", "it's throwing time", "hold your breath...", "3... 2... 1..."],
  battle: ["⚔️", "THROW!"],
  violet_win: ["BULL COOKED", "bull ate that", "bullish af", "bull diff"],
  magenta_win: ["BEAR ATE THAT", "bear cooked fr", "bearish. rip.", "bear diff"],
  draw: ["bro... again?", "draw. pain.", "no winner no loser"],
};

function getCommentary(key: string, seed: number): string {
  const options = COMMENTARY[key] || ["..."];
  return options[Math.abs(seed) % options.length];
}

// ======= PARTICLES =======

function Fireworks({ player }: { player: "violet" | "magenta" }) {
  const particles = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i, angle: (i / 30) * 360, distance: 50 + Math.random() * 100,
      size: 3 + Math.random() * 5, delay: Math.random() * 0.4, duration: 0.6 + Math.random() * 0.8,
    }));
  }, []);
  const base = player === "violet" ? "rgb(139,92,246)" : "rgb(236,72,153)";
  const glow = player === "violet" ? "rgba(139,92,246,0.6)" : "rgba(236,72,153,0.6)";
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        return (
          <motion.div key={p.id} className="absolute rounded-full"
            style={{ width: p.size, height: p.size, backgroundColor: p.id % 4 === 0 ? "#F59E0B" : base,
              boxShadow: `0 0 8px ${p.id % 4 === 0 ? "rgba(245,158,11,0.8)" : glow}`, left: "50%", top: "50%" }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(rad) * p.distance, y: Math.sin(rad) * p.distance, opacity: [1, 1, 0], scale: [0, 1.8, 0] }}
            transition={{ duration: p.duration, delay: p.delay, ease: "easeOut", repeat: Infinity, repeatDelay: 0.6 }}
          />
        );
      })}
    </div>
  );
}

function VictoryRings({ player }: { player: "violet" | "magenta" }) {
  const ring = player === "violet" ? "border-violet/50" : "border-magenta/50";
  return <>
    {[0, 0.3, 0.6].map((delay, i) => (
      <motion.div key={i} className={cn("absolute inset-0 rounded-full border-2", ring)}
        initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 3, opacity: 0 }}
        transition={{ duration: 1.2, delay, repeat: Infinity, ease: "easeOut" }} />
    ))}
  </>;
}

// ======= COUNTDOWN =======

function CountdownDisplay({ time, phase }: { time: number; phase: RoundPhase }) {
  if (phase === "battle") {
    return (
      <motion.div className="text-gold font-black text-4xl sm:text-5xl"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}>⚔️</motion.div>
    );
  }
  if (phase === "results") return null;
  if (phase === "countdown") {
    return (
      <motion.div key={`cd-${time}`} initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        className="text-6xl sm:text-8xl font-black text-red drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]">
        {time}
      </motion.div>
    );
  }
  // Betting — colour shifts as time runs out
  const urgency = time <= 5 ? "critical" : time <= 10 ? "warning" : "normal";
  return (
    <motion.div className={cn("font-mono font-black tabular-nums text-3xl sm:text-4xl",
        urgency === "normal" && "text-cyan", urgency === "warning" && "text-gold", urgency === "critical" && "text-red")}
      animate={urgency === "critical" ? { scale: [1, 1.15, 1] } : urgency === "warning" ? { scale: [1, 1.05, 1] } : {}}
      transition={urgency !== "normal" ? { duration: 0.5, repeat: Infinity } : {}}>
      0:{String(time).padStart(2, "0")}
    </motion.div>
  );
}

// ======= CHARACTER ORB =======

function CharacterOrb({ player, phase, move, isWinner, isLoser, isDraw, timeRemaining, isCentered }: {
  player: "violet" | "magenta"; phase: RoundPhase; move?: Move | null;
  isWinner: boolean; isLoser: boolean; isDraw: boolean; timeRemaining: number; isCentered: boolean;
}) {
  const isBetting = phase === "betting";
  const isCountdown = phase === "countdown";
  const isBattle = phase === "battle";
  const isResults = phase === "results";
  const name = PLAYER_NAMES[player];
  const imageSrc = PLAYER_IMAGES[player];
  const urgency = isBetting && timeRemaining <= 5 ? "critical" : isBetting && timeRemaining <= 10 ? "warning" : "normal";

  const c = player === "violet"
    ? { border: "border-violet", bg: "bg-violet/10", bgWin: "bg-violet/25",
        glow: "shadow-[0_0_30px_rgba(139,92,246,0.3)]", glowMd: "shadow-[0_0_50px_rgba(139,92,246,0.5)]",
        glowLg: "shadow-[0_0_80px_rgba(139,92,246,0.7)]", glowWin: "shadow-[0_0_100px_rgba(139,92,246,0.8)]",
        text: "text-violet" }
    : { border: "border-magenta", bg: "bg-magenta/10", bgWin: "bg-magenta/25",
        glow: "shadow-[0_0_30px_rgba(236,72,153,0.3)]", glowMd: "shadow-[0_0_50px_rgba(236,72,153,0.5)]",
        glowLg: "shadow-[0_0_80px_rgba(236,72,153,0.7)]", glowWin: "shadow-[0_0_100px_rgba(236,72,153,0.8)]",
        text: "text-magenta" };

  const orbGlow = isWinner ? c.glowWin : (isCountdown || isBattle) ? c.glowLg
    : urgency === "critical" ? c.glowLg : urgency === "warning" ? c.glowMd : c.glow;
  const orbBg = isWinner ? c.bgWin : c.bg;
  const orbBorder = isWinner ? "border-4" : "border-2";

  const orbSize = isCentered
    ? "w-32 h-32 sm:w-44 sm:h-44"
    : "w-28 h-28 sm:w-40 sm:h-40";
  const imgSize = isCentered
    ? "w-28 h-28 sm:w-40 sm:h-40"
    : "w-24 h-24 sm:w-36 sm:h-36";
  const moveSize = isCentered
    ? "w-20 h-20 sm:w-28 sm:h-28"
    : "w-14 h-14 sm:w-24 sm:h-24";

  // Simple, clean animations per phase — no shaking, no jitter
  const containerAnim = isBattle
    ? { x: 0, y: 0, scale: 1, opacity: 1 }
    : isCountdown
      ? { x: 0, y: 0, scale: [1, 1.05, 1], opacity: 1 }
      : isWinner
        ? { x: 0, y: [0, -8, 0], scale: 1, opacity: 1 }
        : { x: 0, y: 0, scale: 1, opacity: 1 };

  const containerTransition = isCountdown
    ? { duration: 0.5, repeat: Infinity, delay: player === "magenta" ? 0.25 : 0 }
    : isWinner
      ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" as const }
      : { duration: 0.3 };

  const orbAnim = isWinner
    ? { scale: [1, 1.1, 1.05], opacity: 1 }
    : isLoser
      ? { scale: 0.75, opacity: 0.2 }
      : { scale: 1, opacity: 1 };
  const orbTransition = isWinner
    ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0.4 };

  return (
    <motion.div className="flex flex-col items-center gap-1"
      animate={containerAnim} transition={containerTransition}>
      <div className="relative">
        <motion.div
          className={cn(orbSize, "rounded-full flex items-center justify-center relative z-10 overflow-hidden transition-all duration-300",
            orbBg, orbBorder, c.border, orbGlow)}
          animate={orbAnim} transition={orbTransition}>
          {(isBattle || isResults) && move ? (
            <motion.div initial={{ scale: 0, rotate: player === "violet" ? -180 : 180 }}
              animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 10, stiffness: 200 }}>
              <Image src={MOVE_ICON_SRC[move]} alt={move} width={112} height={112}
                className={cn(moveSize, "object-contain")} />
            </motion.div>
          ) : (
            <Image src={imageSrc} alt={name} width={176} height={176}
              className={cn(imgSize, "object-contain")} priority />
          )}
        </motion.div>
        {isWinner && <><Fireworks player={player} /><VictoryRings player={player} /></>}
      </div>
      <motion.span className={cn("text-[10px] sm:text-sm font-black tracking-wider uppercase", c.text)}
        animate={{ opacity: isLoser ? 0.2 : 1, scale: isWinner ? 1.1 : 1 }}
        transition={{ duration: 0.3 }}>
        {isWinner ? `👑 ${name} 👑` : name}
      </motion.span>
    </motion.div>
  );
}

// ======= RESULT BANNER =======

function ResultBanner({ result, violetMove, magentaMove }: {
  result: RoundResult; violetMove: Move; magentaMove: Move;
}) {
  const MOVE_LABEL: Record<Move, string> = { rock: "ROCK", paper: "PAPER", scissors: "SCISSORS" };
  const bullWon = result === "violet_win";
  const bearWon = result === "magenta_win";
  const resultDesc = useMemo(() => {
    if (result === "draw") return `both threw ${MOVE_LABEL[violetMove]}`;
    const w = bullWon ? violetMove : magentaMove;
    const l = bullWon ? magentaMove : violetMove;
    const verbs: Record<string, Record<string, string>> = { rock: { scissors: "crushes" }, paper: { rock: "covers" }, scissors: { paper: "cuts" } };
    return `${MOVE_LABEL[w]} ${verbs[w]?.[l] || "beats"} ${MOVE_LABEL[l]}`;
  }, [result, violetMove, magentaMove]);

  return (
    <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", damping: 12, delay: 0.2 }} className="text-center">
      <div className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm sm:text-base",
          bullWon && "bg-violet/20 text-violet shadow-[0_0_20px_rgba(139,92,246,0.3)]",
          bearWon && "bg-magenta/20 text-magenta shadow-[0_0_20px_rgba(236,72,153,0.3)]",
          result === "draw" && "bg-cyan/20 text-cyan shadow-[0_0_20px_rgba(6,182,212,0.3)]")}>
        {bullWon && <Image src={PLAYER_IMAGES.violet64} alt="Bull" width={24} height={24} className="w-5 h-5 sm:w-6 sm:h-6" />}
        {bearWon && <Image src={PLAYER_IMAGES.magenta64} alt="Bear" width={24} height={24} className="w-5 h-5 sm:w-6 sm:h-6" />}
        {bullWon ? "BULL WINS" : bearWon ? "BEAR WINS" : "🤝 DRAW!"}
      </div>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="text-[10px] sm:text-xs text-muted-foreground mt-1">{resultDesc}</motion.p>
    </motion.div>
  );
}

// ======= MAIN =======

export function BattleArena({ phase, timeRemaining, violetMove, magentaMove, result, roundNumber }: BattleArenaProps) {
  const isResults = phase === "results";
  const isBattleOrResults = phase === "battle" || isResults;
  const isCentered = phase === "countdown" || phase === "battle" || isResults;
  const bullWon = isResults && result === "violet_win";
  const bearWon = isResults && result === "magenta_win";
  const isDraw = isResults && result === "draw";

  const showVioletMove = isBattleOrResults ? violetMove : undefined;
  const showMagentaMove = isBattleOrResults ? magentaMove : undefined;
  const showResult = isResults ? result : undefined;

  const commentary = useMemo(() => {
    const seed = roundNumber ?? 0;
    if (isResults && result) return getCommentary(result, seed);
    return getCommentary(phase, seed);
  }, [phase, result, isResults, roundNumber]);

  return (
    <motion.div
      className={cn(
        "flex flex-col items-center transition-all duration-300",
        isCentered ? "gap-2 sm:gap-4" : "gap-1 sm:gap-2"
      )}
      layout
    >
      {/* Round + timer row */}
      <div className="flex items-center gap-3">
        {roundNumber && (
          <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">
            #{roundNumber.toLocaleString()}
          </span>
        )}
        {!isResults && phase !== "countdown" && (
          <span className="text-[9px] sm:text-xs uppercase font-bold text-muted-foreground tracking-[0.2em]">
            {phase === "betting" ? "BETTING" : "THROWING"}
          </span>
        )}
      </div>

      {/* Countdown */}
      <AnimatePresence mode="wait">
        <CountdownDisplay key={`${phase}-${timeRemaining}`} time={timeRemaining} phase={phase} />
      </AnimatePresence>

      {/* Characters */}
      <div className={cn(
        "flex items-center gap-2 sm:gap-8 transition-all duration-300",
        isCentered ? "min-h-[160px] sm:min-h-[240px]" : "min-h-[130px] sm:min-h-[200px]"
      )}>
        <CharacterOrb player="violet" phase={phase} move={showVioletMove}
          isWinner={bullWon} isLoser={bearWon} isDraw={isDraw}
          timeRemaining={timeRemaining} isCentered={isCentered} />

        <div className="text-center min-w-[30px] sm:min-w-[50px]">
          <AnimatePresence mode="wait">
            {isResults && showResult && showVioletMove && showMagentaMove ? (
              <ResultBanner key="result" result={showResult} violetMove={showVioletMove} magentaMove={showMagentaMove} />
            ) : (
              <motion.span key="vs"
                className={cn("text-base sm:text-xl font-black",
                  phase === "countdown" ? "text-red/60" : phase === "battle" ? "text-gold/60" : "text-muted-foreground/40")}>
                {phase === "battle" ? "⚡" : "vs"}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <CharacterOrb player="magenta" phase={phase} move={showMagentaMove}
          isWinner={bearWon} isLoser={bullWon} isDraw={isDraw}
          timeRemaining={timeRemaining} isCentered={isCentered} />
      </div>

      {/* Commentary — hidden on mobile during betting */}
      <AnimatePresence mode="wait">
        <motion.p key={`${phase}-${result}`} initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          className={cn("text-xs sm:text-sm italic text-center font-medium hidden sm:block",
            bullWon && "text-violet", bearWon && "text-magenta", isDraw && "text-cyan",
            !isResults && "text-muted-foreground",
            isCentered && "!block"
          )}>
          {commentary}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}
