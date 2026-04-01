"use client";

import { useEffect, useRef } from "react";

/**
 * Client-side ticker that calls /api/game/tick every second
 * to keep the game loop running. In production this would be
 * replaced by pg_cron or an external timer, but for dev/MVP
 * this ensures rounds auto-cycle as long as anyone has the arena open.
 */
export function useGameTicker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Tick immediately on mount
    tick();

    // Then tick every 2 seconds
    intervalRef.current = setInterval(tick, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}

async function tick() {
  try {
    await fetch("/api/game/tick", { method: "POST" });
  } catch {
    // Silently retry on next interval
  }
}
