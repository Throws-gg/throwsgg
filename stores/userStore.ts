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

  // Money — split between cash (withdrawable) and bonus (locked until wagered)
  balance: number;               // cash balance
  bonusBalance: number;          // locked bonus funds
  wageringRemaining: number;     // how much more to wager before bonus unlocks
  bonusExpiresAt: string | null;

  totalWagered: number;
  totalProfit: number;
  referralCode: string | null;

  // Active bets for current round
  activeBets: ActiveBet[];

  // Actions
  setUser: (user: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    balance: number;
    bonusBalance?: number;
    wageringRemaining?: number;
    bonusExpiresAt?: string | null;
    totalWagered: number;
    totalProfit: number;
    referralCode?: string | null;
  }) => void;
  setBalance: (balance: number) => void;
  setBonusState: (state: {
    cashBalance?: number;
    bonusBalance?: number;
    wageringRemaining?: number;
  }) => void;
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
  bonusBalance: 0,
  wageringRemaining: 0,
  bonusExpiresAt: null,
  totalWagered: 0,
  totalProfit: 0,
  referralCode: null,
  activeBets: [],

  setUser: (user) =>
    set({
      userId: user.userId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      balance: user.balance,
      bonusBalance: user.bonusBalance ?? 0,
      wageringRemaining: user.wageringRemaining ?? 0,
      bonusExpiresAt: user.bonusExpiresAt ?? null,
      totalWagered: user.totalWagered,
      totalProfit: user.totalProfit,
      referralCode: user.referralCode ?? null,
    }),

  setBalance: (balance) => set({ balance }),

  setBonusState: (s) =>
    set((state) => ({
      balance: s.cashBalance ?? state.balance,
      bonusBalance: s.bonusBalance ?? state.bonusBalance,
      wageringRemaining: s.wageringRemaining ?? state.wageringRemaining,
    })),

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
      bonusBalance: 0,
      wageringRemaining: 0,
      bonusExpiresAt: null,
      totalWagered: 0,
      totalProfit: 0,
      referralCode: null,
      activeBets: [],
    }),
}));
