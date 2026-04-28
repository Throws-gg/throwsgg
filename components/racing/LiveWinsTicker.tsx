"use client";

import { useEffect, useState } from "react";

interface LiveWin {
  id: string;
  username: string;
  horseName: string;
  lockedOdds: number;
  payout: number;
  profit: number;
  raceNumber: number;
  settledAt: string;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Horizontally-scrolling ticker of recent winning bets.
 * Fetches from /api/race/wins-feed (10s edge cache, won bets with
 * profit >= $5 or odds >= 5.0). Polls every 30s.
 *
 * Renders nothing if there are no qualifying wins yet — the ticker should
 * never show fake data. Earlier hardcoded mock content was deliberately
 * removed; this component now goes live the first time a real player wins.
 */
export function LiveWinsTicker() {
  const [wins, setWins] = useState<LiveWin[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/race/wins-feed?limit=20");
        if (!res.ok) return;
        const data = (await res.json()) as { wins?: LiveWin[] };
        if (!cancelled && data.wins) setWins(data.wins);
      } catch {
        // silent — non-critical
      }
    };
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (wins.length === 0) return null;

  // Double the items for a seamless CSS scroll loop.
  const items = [...wins, ...wins];

  return (
    <div className="relative overflow-hidden w-full border-b border-white/[0.04] bg-white/[0.01]">
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-[#08080D] to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-[#08080D] to-transparent" />

      <div
        className="flex gap-6 py-2 px-4 animate-[ticker-scroll_60s_linear_infinite]"
        style={{ width: "max-content" }}
      >
        {items.map((win, i) => (
          <div key={`${win.id}-${i}`} className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-green-400 font-black font-mono">
              +${win.payout.toFixed(2)}
            </span>
            <span className="text-[10px] text-white/30">
              <span className="text-violet-300/80 font-semibold">
                {win.username}
              </span>
              {" "}backed{" "}
              <span className="text-white/60 font-medium">{win.horseName}</span>
            </span>
            <span className="text-[9px] text-white/25 font-mono">
              {win.lockedOdds.toFixed(2)}x
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
