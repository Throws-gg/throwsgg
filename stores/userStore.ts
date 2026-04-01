import { create } from "zustand";
import type { BetType, BetCategory } from "@/lib/game/constants";

export interface ActiveBet {
  id: string;
  roundId: string;
  betType: BetType;
  betCategory: BetCategory;
  amount: number;
  multiplier: number;
  status: "pending" | "won" | "lost" | "push" | "cancelled";
  payout?: number;
}

interface UserStore {
  // Profile
  userId: string | null;
  username: string | null;
  avatarUrl: string | null;
  balance: number;
  totalWagered: number;
  totalProfit: number;

  // Active bets for current round
  activeBets: ActiveBet[];

  // Actions
  setUser: (user: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    balance: number;
    totalWagered: number;
    totalProfit: number;
  }) => void;
  setBalance: (balance: number) => void;
  addActiveBet: (bet: ActiveBet) => void;
  clearActiveBets: () => void;
  updateBetStatus: (
    betId: string,
    status: ActiveBet["status"],
    payout?: number
  ) => void;
  logout: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
  userId: null,
  username: null,
  avatarUrl: null,
  balance: 0,
  totalWagered: 0,
  totalProfit: 0,
  activeBets: [],

  setUser: (user) =>
    set({
      userId: user.userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      balance: user.balance,
      totalWagered: user.totalWagered,
      totalProfit: user.totalProfit,
    }),

  setBalance: (balance) => set({ balance }),

  addActiveBet: (bet) =>
    set((state) => ({ activeBets: [...state.activeBets, bet] })),

  clearActiveBets: () => set({ activeBets: [] }),

  updateBetStatus: (betId, status, payout) =>
    set((state) => ({
      activeBets: state.activeBets.map((b) =>
        b.id === betId ? { ...b, status, payout } : b
      ),
    })),

  logout: () =>
    set({
      userId: null,
      username: null,
      avatarUrl: null,
      balance: 0,
      totalWagered: 0,
      totalProfit: 0,
      activeBets: [],
    }),
}));
