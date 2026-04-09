"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LiveWin {
  id: string;
  username: string;
  amount: number;
  game: string;
  multiplier: number;
}

// Simulated wins for social proof — replace with real data from API/websocket
const SIMULATED_WINS: LiveWin[] = [
  { id: "1", username: "degenKing", amount: 142.5, game: "Moon Shot", multiplier: 8.2 },
  { id: "2", username: "0xape", amount: 29.1, game: "Bull 2.91x", multiplier: 2.91 },
  { id: "3", username: "rugSurvivor", amount: 388.0, game: "Rug Pull", multiplier: 12.8 },
  { id: "4", username: "paperhands", amount: 9.7, game: "Rock", multiplier: 2.91 },
  { id: "5", username: "moonboy", amount: 67.9, game: "Thunder Edge", multiplier: 4.2 },
  { id: "6", username: "whale.sol", amount: 1250.0, game: "Dead Cat", multiplier: 22.0 },
  { id: "7", username: "ctDegen", amount: 19.4, game: "Bear 1.94x", multiplier: 1.94 },
  { id: "8", username: "flashcrash", amount: 55.2, game: "Crown Jewel", multiplier: 3.9 },
];

export function LiveWinsTicker() {
  const [wins] = useState(SIMULATED_WINS);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative overflow-hidden w-full border-b border-white/[0.04] bg-white/[0.01]">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-[#08080D] to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-[#08080D] to-transparent" />

      <div
        ref={containerRef}
        className="flex gap-6 py-2 px-4 animate-[ticker-scroll_30s_linear_infinite]"
        style={{ width: "max-content" }}
      >
        {/* Double the items for seamless loop */}
        {[...wins, ...wins].map((win, i) => (
          <div key={`${win.id}-${i}`} className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-green font-black font-mono">
              +${win.amount.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/30">
              <span className="text-violet/60 font-semibold">{win.username}</span>
              {" "}won on{" "}
              <span className="text-white/50 font-medium">{win.game}</span>
            </span>
            <span className="text-[9px] text-white/20 font-mono">{win.multiplier}x</span>
          </div>
        ))}
      </div>
    </div>
  );
}
