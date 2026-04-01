"use client";

import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useGameStore } from "@/stores/gameStore";
import { TIMING } from "@/lib/game/constants";
import type { GameState, RoundPhase } from "@/lib/game/constants";

/**
 * Calculate phase and timeRemaining locally from round timestamps.
 * This is the single source of truth for countdown — never use server's timeRemaining.
 */
function calcPhase(status: string, bettingClosesAt: string): { phase: RoundPhase; timeRemaining: number } {
  const now = Date.now();
  const closes = new Date(bettingClosesAt).getTime();
  const countdownEnd = closes + TIMING.COUNTDOWN_DURATION * 1000;
  const battleEnd = countdownEnd + TIMING.BATTLE_DURATION * 1000;
  const resultsEnd = battleEnd + TIMING.RESULTS_DURATION * 1000;

  if (status === "betting") {
    return { phase: "betting", timeRemaining: Math.max(0, Math.ceil((closes - now) / 1000)) };
  } else if (status === "locked") {
    return { phase: "countdown", timeRemaining: Math.max(0, Math.ceil((countdownEnd - now) / 1000)) };
  } else if (status === "playing") {
    return { phase: "battle", timeRemaining: Math.max(0, Math.ceil((battleEnd - now) / 1000)) };
  } else {
    return { phase: "results", timeRemaining: Math.max(0, Math.ceil((resultsEnd - now) / 1000)) };
  }
}

export function useGameState() {
  const store = useGameStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundIdRef = useRef<string>("");
  const lastStatusRef = useRef<string>("");

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/game/state");
      const data = await res.json();
      if (!data.currentRound) return;

      const state = data as GameState;
      const roundChanged = state.currentRound.id !== lastRoundIdRef.current;
      const statusChanged = state.currentRound.status !== lastStatusRef.current;

      lastRoundIdRef.current = state.currentRound.id;
      lastStatusRef.current = state.currentRound.status;

      // Always update round data, results, winners, etc.
      store.setCurrentRound(state.currentRound);
      store.setLastRound(state.lastRound);
      store.setRecentResults(state.recentResults);
      if (state.roundWinners !== undefined) {
        // Only update roundWinners via the store's updateFromGameState
        useGameStore.setState({ roundWinners: state.roundWinners });
      }
      store.setOnlineCount(state.onlineCount);

      // Recalc phase/time locally from timestamps (not server's timeRemaining)
      if (roundChanged || statusChanged) {
        const { phase, timeRemaining } = calcPhase(
          state.currentRound.status,
          state.currentRound.bettingClosesAt
        );
        store.setPhase(phase);
        store.setTimeRemaining(timeRemaining);
      }
    } catch {
      // Silently retry
    }
  }, []);

  useEffect(() => {
    fetchState();

    // Poll every 2 seconds
    pollRef.current = setInterval(fetchState, 2000);

    // Supabase Realtime
    const channel = supabase
      .channel("rounds-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds" },
        () => fetchState()
      )
      .subscribe();

    // Local timer — recalculates from timestamps every second
    // No server dependency, no jitter
    timerRef.current = setInterval(() => {
      const { currentRound } = useGameStore.getState();
      if (!currentRound) return;

      const { phase, timeRemaining } = calcPhase(
        currentRound.status,
        currentRound.bettingClosesAt
      );

      const prevPhase = useGameStore.getState().phase;
      store.setTimeRemaining(timeRemaining);

      // Only update phase if it actually changed (prevents re-render flicker)
      if (phase !== prevPhase) {
        store.setPhase(phase);
      }

      // When time hits 0, refetch to trigger the next phase on server
      if (timeRemaining === 0) {
        fetchState();
      }
    }, 1000);

    return () => {
      channel.unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    currentRound: store.currentRound,
    lastRound: store.lastRound,
    recentResults: store.recentResults,
    roundWinners: store.roundWinners,
    phase: store.phase,
    timeRemaining: store.timeRemaining,
    onlineCount: store.onlineCount,
    refetch: fetchState,
  };
}
