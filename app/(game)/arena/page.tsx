"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGameState } from "@/hooks/useGameState";
import { useUserStore } from "@/stores/userStore";
import { BattleArena } from "@/components/game/BattleArena";
import { BettingPanel } from "@/components/game/BettingPanel";
import { StreakDisplay } from "@/components/game/StreakDisplay";
import { BigWinCelebration } from "@/components/game/BigWinCelebration";
import { ShareButton } from "@/components/game/ShareButton";
import { RoundWinnersPlaceholder } from "@/components/game/RoundWinners";
import { DevToolbar } from "@/components/game/DevToolbar";
import { WinnersBanner } from "@/components/game/WinnersBanner";
import { ChatFeed } from "@/components/chat/ChatFeed";
import { ChatTicker } from "@/components/chat/ChatTicker";
import { useChat } from "@/hooks/useChat";
import { useSound } from "@/hooks/useSound";
import type { BetType } from "@/lib/game/constants";

// Map DB bet types to display names
function betLabel(type: string): string {
  const map: Record<string, string> = {
    violet: "Bull 🐂",
    magenta: "Bear 🐻",
    rock: "Rock 🪨",
    paper: "Paper 📄",
    scissors: "Scissors ✂️",
    draw: "Draw 🤝",
  };
  return map[type] || type;
}

export default function ArenaPage() {
  const {
    currentRound,
    lastRound,
    recentResults,
    roundWinners,
    phase,
    timeRemaining,
  } = useGameState();

  const { userId, username, balance, activeBets } = useUserStore();
  const { messages: chatMessages, unreadCount, sendMessage } = useChat();
  const { play, playWin } = useSound();
  const [bigWin, setBigWin] = useState<{
    amount: number;
    username?: string;
  } | null>(null);

  const prevPhaseRef = useRef(phase);
  const prevTimeRef = useRef(timeRemaining);
  const prevRoundRef = useRef(currentRound?.id);
  const lastBetsRef = useRef<{ betType: BetType; amount: number }[]>([]);

  // Sound triggers on phase changes and countdown
  useEffect(() => {
    const prev = prevPhaseRef.current;

    // Phase transition sounds
    if (phase !== prev) {
      if (phase === "battle") {
        play("battle_whoosh");
        // Collision sound slightly delayed for impact moment
        setTimeout(() => play("collision_impact"), 300);
      }
      if (phase === "betting" && prev === "results") play("new_round");
    }

    // Countdown ticks (final 5 seconds of betting or during countdown phase)
    if (phase === "countdown" && timeRemaining !== prevTimeRef.current && timeRemaining > 0) {
      if (timeRemaining === 1) {
        play("countdown_final");
      } else {
        play("countdown_tick");
      }
    }

    prevTimeRef.current = timeRemaining;
  }, [phase, timeRemaining, play]);

  // Build active bets display for the chip-rack panel
  const activeBetDisplays = activeBets
    .filter((b) => b.status === "pending")
    .map((b) => ({ betType: b.betType, amount: b.amount }));

  // When round changes or enters results phase, check bet outcomes
  useEffect(() => {
    const roundChanged = currentRound?.id !== prevRoundRef.current;
    const enteredResults =
      phase === "results" && prevPhaseRef.current !== "results";

    prevPhaseRef.current = phase;
    prevRoundRef.current = currentRound?.id;

    if (!userId || activeBets.length === 0) return;

    // When a new round starts, settle the previous round's bets
    if (roundChanged || enteredResults) {
      settleBets();
    }
  }, [phase, currentRound?.id]);

  // Check bet outcomes against the settled round
  const settleBets = useCallback(async () => {
    if (!userId) return;

    // Fetch the user's latest bets from the server
    try {
      const res = await fetch(
        `/api/bet/history?userId=${userId}&limit=10`
      );
      const data = await res.json();

      if (data.bets) {
        const pendingBets = useUserStore.getState().activeBets;

        for (const serverBet of data.bets) {
          const localBet = pendingBets.find(
            (b) => b.id === serverBet.id
          );
          if (localBet && serverBet.status !== "pending") {
            const payout = serverBet.payout
              ? parseFloat(serverBet.payout)
              : 0;

            useUserStore
              .getState()
              .updateBetStatus(serverBet.id, serverBet.status, payout);

            // Sound + celebration
            if (serverBet.status === "won") {
              playWin(payout);
              if (payout >= 50) {
                setBigWin({ amount: payout, username: username || undefined });
              }
            } else if (serverBet.status === "lost") {
              play("loss");
            } else if (serverBet.status === "push") {
              play("draw_push");
            }
          }
        }
      }

      // Refresh balance from server
      const userRes = await fetch("/api/dev/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username || "testdegen" }),
      });
      const userData = await userRes.json();
      if (userData.user) {
        useUserStore.getState().setBalance(userData.user.balance);
      }
    } catch (err) {
      console.error("Failed to settle bets:", err);
    }
  }, [userId, username]);

  // Save last bets for re-bet, then clear when new round starts
  useEffect(() => {
    if (phase === "betting") {
      const bets = useUserStore.getState().activeBets;
      const settledBets = bets.filter((b) => b.status !== "pending");
      if (settledBets.length > 0) {
        lastBetsRef.current = settledBets.map((b) => ({
          betType: b.betType,
          amount: b.amount,
        }));
      }
      if (settledBets.length > 0) {
        const timeout = setTimeout(() => {
          useUserStore.getState().clearActiveBets();
        }, 3000);
        return () => clearTimeout(timeout);
      }
    }
  }, [phase]);

  // Chip-rack: batch rapid taps and send one API call
  // UI updates instantly, server syncs after taps stop (150ms debounce)
  const pendingChipsRef = useRef<Map<string, { betType: BetType; total: number }>>(new Map());
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handlePlaceChip = useCallback(
    (betType: BetType, chipAmount: number) => {
      if (!userId || !currentRound) return;

      const store = useUserStore.getState();
      if (store.balance < chipAmount) return;

      // Sound
      play("bet_placed");

      // 1. INSTANT UI update
      store.setBalance(store.balance - chipAmount);

      const existing = store.activeBets.find(
        (b) => b.betType === betType && b.status === "pending"
      );

      if (existing) {
        const updated = store.activeBets.map((b) =>
          b.id === existing.id
            ? { ...b, amount: b.amount + chipAmount }
            : b
        );
        store.clearActiveBets();
        updated.forEach((b) => store.addActiveBet(b));
      } else {
        const tempId = `temp_${betType}`;
        const category = ["rock", "paper", "scissors", "draw"].includes(betType)
          ? "move"
          : "player";
        const multiplier = category === "move" ? 2.91 : 1.94;
        store.addActiveBet({
          id: tempId,
          roundId: currentRound.id,
          betType: betType as BetType,
          betCategory: category as "move" | "player",
          amount: chipAmount,
          multiplier,
          status: "pending",
        });
      }

      // 2. BATCH: accumulate chips per betType
      const pending = pendingChipsRef.current.get(betType);
      if (pending) {
        pending.total += chipAmount;
      } else {
        pendingChipsRef.current.set(betType, { betType, total: chipAmount });
      }

      // 3. DEBOUNCE: send after 150ms of no taps on this betType
      const existingTimer = debounceTimersRef.current.get(betType);
      if (existingTimer) clearTimeout(existingTimer);

      debounceTimersRef.current.set(
        betType,
        setTimeout(() => {
          const batch = pendingChipsRef.current.get(betType);
          if (!batch) return;
          pendingChipsRef.current.delete(betType);
          debounceTimersRef.current.delete(betType);

          // Send one API call with the total accumulated amount
          // On success: just swap temp ID to real ID, don't touch amounts or balance
          // On error: rollback the batch amount
          fetch("/api/bet/place", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              roundId: currentRound.id,
              betType: batch.betType,
              amount: batch.total,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error) {
                console.error("Bet failed:", data.error);
                // Rollback: refund balance and reduce/remove the bet
                const s = useUserStore.getState();
                s.setBalance(s.balance + batch.total);
                const bet = s.activeBets.find(
                  (b) => b.betType === batch.betType && b.status === "pending"
                );
                if (bet) {
                  const newAmount = bet.amount - batch.total;
                  const updated = s.activeBets
                    .map((b) =>
                      b.id === bet.id
                        ? newAmount > 0 ? { ...b, amount: newAmount } : null
                        : b
                    )
                    .filter(Boolean) as typeof s.activeBets;
                  s.clearActiveBets();
                  updated.forEach((b) => s.addActiveBet(b));
                }
                return;
              }

              // Success: swap temp ID to real ID only (preserve optimistic amounts)
              const s = useUserStore.getState();
              const bets = s.activeBets.map((b) =>
                b.betType === batch.betType && b.id.startsWith("temp_")
                  ? { ...b, id: data.bet.id }
                  : b
              );
              s.clearActiveBets();
              bets.forEach((b) => s.addActiveBet(b));
            })
            .catch(() => {
              // Network error: rollback
              const s = useUserStore.getState();
              s.setBalance(s.balance + batch.total);
            });
        }, 150)
      );
    },
    [userId, currentRound]
  );

  // Clear all bets — OPTIMISTIC
  const handleClearAll = useCallback(() => {
    if (!userId || !currentRound) return;

    const store = useUserStore.getState();
    const pendingBets = store.activeBets.filter((b) => b.status === "pending");
    const totalRefund = pendingBets.reduce((sum, b) => sum + b.amount, 0);

    // 1. INSTANT UI update
    store.setBalance(store.balance + totalRefund);
    store.clearActiveBets();

    // 2. BACKGROUND server sync
    fetch("/api/bet/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        roundId: currentRound.id,
        clearAll: true,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.newBalance !== undefined) {
          useUserStore.getState().setBalance(data.newBalance);
        }
      })
      .catch(() => {});
  }, [userId, currentRound]);

  // Quick re-bet
  const handleReBet = useCallback(() => {
    if (!userId || !currentRound || phase !== "betting") return;
    const last = lastBetsRef.current;
    if (last.length === 0) return;
    for (const bet of last) {
      handlePlaceChip(bet.betType, bet.amount);
    }
  }, [userId, currentRound, phase, handlePlaceChip]);

  // Chat send handler
  const handleChatSend = useCallback(
    (message: string) => {
      if (!userId || !username) return;
      sendMessage(userId, username, message);
    },
    [userId, username, sendMessage]
  );

  // Calculate wins for display
  const wonBets = activeBets.filter((b) => b.status === "won");
  const lostBets = activeBets.filter((b) => b.status === "lost");
  const pushBets = activeBets.filter((b) => b.status === "push");
  const totalWin = wonBets.reduce((sum, b) => sum + (b.payout || 0), 0);
  const totalLost = lostBets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3.5rem)]">
      {/* Main game area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Battle arena — during countdown/battle: flex-1 + center. During betting: just top. */}
        <div className="flex flex-col flex-1 justify-center px-3 sm:px-4 pt-1 sm:pt-2">
          <BattleArena
            phase={phase}
            timeRemaining={timeRemaining}
            violetMove={currentRound?.violetMove || undefined}
            magentaMove={currentRound?.magentaMove || undefined}
            result={currentRound?.result || undefined}
            roundNumber={currentRound?.roundNumber}
          />

          {/* Results feedback — shows inside the battle area during results */}
          {phase === "results" && (
            <div className="space-y-1 px-1 mt-1">
              <WinnersBanner visible={true}
                winnerCount={roundWinners?.winnerCount || 0}
                totalPayout={roundWinners?.totalPayout || 0} />
              {wonBets.map((bet) => (
                <div key={bet.id}
                  className="flex items-center justify-between bg-green/10 border border-green/30 rounded-lg px-3 py-1.5">
                  <div>
                    <span className="text-green font-bold text-sm">+${(bet.payout || 0).toFixed(2)}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">{betLabel(bet.betType)} {bet.multiplier}x</span>
                  </div>
                  <ShareButton winAmount={bet.payout || 0} betType={betLabel(bet.betType)}
                    roundNumber={currentRound?.roundNumber || 0} />
                </div>
              ))}
              {lostBets.map((bet) => (
                <div key={bet.id}
                  className="flex items-center justify-between bg-red/5 border border-red/20 rounded-lg px-3 py-1.5">
                  <span className="text-red font-bold text-sm">-${bet.amount.toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground">{betLabel(bet.betType)} — rip</span>
                </div>
              ))}
              {pushBets.map((bet) => (
                <div key={bet.id}
                  className="flex items-center justify-between bg-cyan/5 border border-cyan/20 rounded-lg px-3 py-1.5">
                  <span className="text-cyan font-medium text-sm">↩ ${bet.amount.toFixed(2)}</span>
                  <span className="text-[10px] text-muted-foreground">{betLabel(bet.betType)} — push</span>
                </div>
              ))}
              <RoundWinnersPlaceholder visible={activeBets.length === 0}
                result={currentRound?.result ?? lastRound?.result ?? null} />
            </div>
          )}
        </div>

        {/* BOTTOM: Betting UI — pinned at bottom, collapses during countdown/battle */}
        <motion.div
          animate={{
            height: (phase === "countdown" || phase === "battle") ? 0 : "auto",
            opacity: (phase === "countdown" || phase === "battle") ? 0 : 1,
          }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden sm:!h-auto sm:!opacity-100 px-3 sm:px-4 pb-14 sm:pb-2 space-y-1"
        >
          {/* Quick re-bet */}
          {phase === "betting" && lastBetsRef.current.length > 0 && activeBetDisplays.length === 0 && userId && (
            <button
              onClick={handleReBet}
              className="w-full py-2 rounded-lg bg-violet/15 border border-violet/30 text-violet text-xs font-bold hover:bg-violet/25 active:scale-[0.98] transition-all"
            >
              same bet? — {lastBetsRef.current.map(b =>
                `${b.betType === "violet" ? "Bull" : b.betType === "magenta" ? "Bear" : b.betType} $${b.amount}`
              ).join(" + ")}
            </button>
          )}

          {/* Chat ticker — mobile only */}
          <div className="lg:hidden">
            <ChatTicker messages={chatMessages} unreadCount={unreadCount}
              onSend={handleChatSend} userId={userId} />
          </div>

          {/* Betting panel */}
          <BettingPanel phase={phase} balance={balance} activeBets={activeBetDisplays}
            onPlaceChip={handlePlaceChip} onClearAll={handleClearAll} disabled={!userId}
            winningMove={currentRound?.winningMove} roundResult={currentRound?.result} />

          {/* Streak + stats */}
          <StreakDisplay recentResults={recentResults} />

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span>{currentRound?.betCount || 0} bets this round</span>
          </div>

          {!userId && phase === "betting" && (
            <p className="text-center text-[10px] text-muted-foreground">
              gm degen. login to start throwing.
            </p>
          )}
        </motion.div>
      </div>

      {/* Chat sidebar — desktop only */}
      <aside className="hidden lg:flex w-[300px] border-l border-border flex-col bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-bold">chat</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            live
          </div>
        </div>
        <ChatFeed
          messages={chatMessages}
          onSend={handleChatSend}
          userId={userId}
          className="flex-1 min-h-0"
        />
      </aside>

      {/* Big win celebration overlay */}
      <BigWinCelebration
        winAmount={bigWin?.amount || null}
        username={bigWin?.username}
        onComplete={() => setBigWin(null)}
      />

      {/* Dev toolbar — remove before production */}
      <DevToolbar />
    </div>
  );
}
