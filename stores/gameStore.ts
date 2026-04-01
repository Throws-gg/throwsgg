import { create } from "zustand";
import type {
  GameState,
  RoundPhase,
  RoundResult,
} from "@/lib/game/constants";

interface GameStore {
  currentRound: GameState["currentRound"] | null;
  lastRound: GameState["lastRound"];
  recentResults: GameState["recentResults"];
  roundWinners: GameState["roundWinners"];
  phase: RoundPhase;
  timeRemaining: number;
  onlineCount: number;

  setCurrentRound: (round: GameState["currentRound"]) => void;
  setLastRound: (round: GameState["lastRound"]) => void;
  setRecentResults: (results: GameState["recentResults"]) => void;
  setPhase: (phase: RoundPhase) => void;
  setTimeRemaining: (time: number) => void;
  setOnlineCount: (count: number) => void;
  updateFromGameState: (state: GameState) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentRound: null,
  lastRound: null,
  recentResults: [] as GameState["recentResults"],
  roundWinners: null,
  phase: "betting",
  timeRemaining: 0,
  onlineCount: 0,

  setCurrentRound: (round) => set({ currentRound: round }),
  setLastRound: (round) => set({ lastRound: round }),
  setRecentResults: (results) => set({ recentResults: results }),
  setPhase: (phase) => set({ phase }),
  setTimeRemaining: (time) => set({ timeRemaining: time }),
  setOnlineCount: (count) => set({ onlineCount: count }),
  updateFromGameState: (state) =>
    set({
      currentRound: state.currentRound,
      lastRound: state.lastRound,
      recentResults: state.recentResults,
      roundWinners: state.roundWinners,
      phase: state.phase,
      timeRemaining: state.timeRemaining,
      onlineCount: state.onlineCount,
    }),
}));
