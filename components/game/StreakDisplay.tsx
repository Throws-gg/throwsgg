"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { RoundResult, Move } from "@/lib/game/constants";

interface RecentResult {
  result: RoundResult;
  winningMove: Move | null;
}

interface StreakDisplayProps {
  recentResults: RecentResult[];
}

function getStreak(results: RecentResult[]): {
  player: "bull" | "bear" | null;
  count: number;
} {
  if (results.length === 0) return { player: null, count: 0 };

  const first = results[0].result;
  if (first === "draw") return { player: null, count: 0 };

  const player = first === "violet_win" ? "bull" : "bear";
  let count = 1;

  for (let i = 1; i < results.length; i++) {
    if (results[i].result === first) {
      count++;
    } else {
      break;
    }
  }

  return { player, count };
}

function getResultStats(results: RecentResult[]) {
  const stats = { violet: 0, magenta: 0, draw: 0 };
  for (const r of results) {
    if (r.result === "violet_win") stats.violet++;
    else if (r.result === "magenta_win") stats.magenta++;
    else stats.draw++;
  }
  return stats;
}

const MOVE_LETTER: Record<Move, string> = {
  rock: "R",
  paper: "P",
  scissors: "S",
};

export function StreakDisplay({ recentResults }: StreakDisplayProps) {
  const streak = useMemo(() => getStreak(recentResults), [recentResults]);
  const stats = useMemo(
    () => getResultStats(recentResults),
    [recentResults]
  );
  const total = recentResults.length || 1;

  return (
    <div className="space-y-2">
      {/* Current streak */}
      {streak.count >= 2 && (
        <div
          className={cn(
            "text-center py-1.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider border",
            streak.player === "bull"
              ? "bg-violet/10 text-violet border-violet/20"
              : "bg-magenta/10 text-magenta border-magenta/20"
          )}
        >
          {streak.player === "bull" ? "BULL" : "BEAR"} {streak.count}-STREAK
          {streak.count >= 5 && " 🔥"}
          {streak.count >= 8 && "🔥"}
          {streak.count >= 10 && " 💀"}
        </div>
      )}

      {/* Results strip — coloured dots for quick scanning */}
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        <span className="text-[10px] text-muted-foreground mr-1 shrink-0 font-bold uppercase">
          Last {recentResults.length}:
        </span>
        {recentResults.map((r, i) => (
          <span
            key={i}
            className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0 inline-block",
              r.result === "violet_win" && "bg-violet",
              r.result === "magenta_win" && "bg-magenta",
              r.result === "draw" && "bg-cyan"
            )}
            title={
              r.result === "draw"
                ? "Draw"
                : `${r.result === "violet_win" ? "Bull" : "Bear"} won with ${r.winningMove}`
            }
          />
        ))}
      </div>

      {/* Win distribution bar */}
      {recentResults.length > 0 && (
        <div className="space-y-1">
          <div className="flex h-2.5 rounded-full overflow-hidden bg-background/50 border border-border">
            <div
              className="bg-violet transition-all duration-500"
              style={{ width: `${(stats.violet / total) * 100}%` }}
            />
            <div
              className="bg-cyan/50 transition-all duration-500"
              style={{ width: `${(stats.draw / total) * 100}%` }}
            />
            <div
              className="bg-magenta transition-all duration-500"
              style={{ width: `${(stats.magenta / total) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-violet font-bold">
              Bull {Math.round((stats.violet / total) * 100)}%
            </span>
            <span className="text-cyan font-bold">
              D {Math.round((stats.draw / total) * 100)}%
            </span>
            <span className="text-magenta font-bold">
              Bear {Math.round((stats.magenta / total) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
