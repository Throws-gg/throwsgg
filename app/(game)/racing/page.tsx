"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/userStore";
import { useAuthActions } from "@/lib/auth/auth-context";
import { RaceCanvas } from "@/components/racing/RaceCanvas";
import { RACE_TIMING, BANKROLL_RACING } from "@/lib/racing/constants";
import type { RaceState, RaceEntry, RacePhase, Horse } from "@/lib/racing/constants";
import { getHorseIdentity } from "@/lib/racing/constants";
import { RaceWinCard } from "@/components/racing/RaceWinCard";
import { HorseSprite } from "@/components/racing/HorseSprite";
import { PodiumResults } from "@/components/racing/PodiumResults";
import { BigWinCelebration } from "@/components/game/BigWinCelebration";
import { ChatFeed } from "@/components/chat/ChatFeed";
import { ChatTicker } from "@/components/chat/ChatTicker";
import { LiveWinsTicker } from "@/components/racing/LiveWinsTicker";
import { useChat } from "@/hooks/useChat";
import { WageringProgress } from "@/components/bonus/WageringProgress";
import { DailyBonusCard } from "@/components/bonus/DailyBonusCard";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { track } from "@/lib/analytics/posthog";
import { getRakebackTier, EDGE_RATE } from "@/lib/rakeback/tiers";

// ======= TIMESTAMP-BASED COUNTDOWN (no jitter) =======

function calcRacePhase(status: string, bettingClosesAt: string, raceStartsAt?: string): { phase: RacePhase; timeRemaining: number } {
  const now = Date.now();
  const closes = new Date(bettingClosesAt).getTime();
  const closedEnd = closes + RACE_TIMING.CLOSED_DURATION * 1000;

  // If we have raceStartsAt (set by the server when the race actually starts running),
  // use that for race/results timing. This avoids the bug where the cron is delayed
  // and the client calculates timeRemaining=0 from the derived timestamp.
  const raceStart = raceStartsAt ? new Date(raceStartsAt).getTime() : closedEnd;
  const raceEnd = raceStart + RACE_TIMING.RACE_DURATION * 1000;
  const resultsEnd = raceEnd + RACE_TIMING.RESULTS_DURATION * 1000;

  // Optimistic phase advancement — if the wall clock has moved past a boundary
  // but the server tick hasn't yet updated `status`, advance the phase client
  // side so the UI never stalls at "0 seconds" waiting for the cron to catch up.
  //
  // We only advance a SINGLE step: we never jump more than one phase ahead of
  // the server. If the server is many phases behind (e.g. the user just opened
  // the site and the background tick is still catching up), chaining the
  // advancement would briefly render phases that have no backing server data
  // (no checkpoints, no finish positions) and the UI would flash through
  // "racing → closed → racing" as the real server state lands.
  if (status === "betting" && now >= closes) {
    status = "closed";
  } else if (status === "closed" && now >= closedEnd) {
    status = "racing";
  } else if (status === "racing" && now >= raceEnd) {
    status = "settled";
  }

  if (status === "betting") return { phase: "betting", timeRemaining: Math.max(0, Math.ceil((closes - now) / 1000)) };
  if (status === "closed") return { phase: "closed", timeRemaining: Math.max(0, Math.ceil((closedEnd - now) / 1000)) };
  if (status === "racing") return { phase: "racing", timeRemaining: Math.max(0, Math.ceil((raceEnd - now) / 1000)) };
  return { phase: "results", timeRemaining: Math.max(0, Math.ceil((resultsEnd - now) / 1000)) };
}

// ======= HORSE COLORS =======

const HORSE_SPRITES = ["🐎", "🏇", "🐴", "🐎", "🏇", "🐴", "🐎", "🏇"];

// Session-level bet counter (survives across component re-renders but resets on page reload)
let sessionBetCount = 0;
const MIN_RACE_BET = BANKROLL_RACING.MIN_BET;

function floorCents(n: number): number {
  return Math.floor(Math.max(0, n) * 100) / 100;
}

function formatStake(n: number): string {
  return n < 1 || !Number.isInteger(n) ? n.toFixed(2) : n.toFixed(0);
}

function stakeChipsForOdds(odds: number): number[] {
  if (odds >= 250) return [0.10, 0.25, 0.50];
  if (odds >= 100) return [0.25, 0.50, 1];
  if (odds >= 30) return [0.50, 1, 2];
  if (odds >= 10) return [1, 2, 5];
  return [1, 5, 10];
}

// ======= MAIN PAGE =======

export default function RacingPage() {
  const [raceState, setRaceState] = useState<RaceState | null>(null);
  const [phase, setPhase] = useState<RacePhase>("betting");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedHorse, setSelectedHorse] = useState<RaceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBets, setActiveBets] = useState<{
    id: string; horseId: number; horseName: string; amount: number;
    lockedOdds: number; potentialPayout: number; status: string; payout?: number;
    betType?: string; fromBonus?: number;
  }[]>([]);
  const [shareWinBet, setShareWinBet] = useState<{
    horse: Horse; betAmount: number; lockedOdds: number; payout: number;
    gatePosition: number;
  } | null>(null);
  const [bigWin, setBigWin] = useState<{ amount: number; username?: string } | null>(null);
  const [rakebackToast, setRakebackToast] = useState<{ amount: number; tierLabel: string } | null>(null);
  const settledRef = useRef(false);

  const lastRaceIdRef = useRef("");
  const lastStatusRef = useRef("");

  // Subscribe to bonusBalance + wageringRemaining reactively so the bet
  // modal sees fresh values. Earlier this was reading via getState() at
  // mount time which returned a stale snapshot — users with cash + bonus
  // saw "Insufficient balance" because totalFunds was computed against
  // an outdated bonus value (often 0 right after login).
  const { userId, balance, username, bonusBalance, wageringRemaining, totalWagered } = useUserStore();
  const { login } = useAuthActions();
  const { messages: chatMessages, unreadCount, sendMessage } = useChat();
  // Sound hooks removed — no audio assets for racing yet
  const play = (_name: string) => {};
  const playWin = (_amount: number) => {};
  const authedFetch = useAuthedFetch();

  // Use ref so fetchState always sees latest bets without re-creating the callback
  const activeBetsRef = useRef(activeBets);
  activeBetsRef.current = activeBets;

  // Fetch state
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/race/state");
      const data = await res.json();
      if (data.currentRace) {
        const state = data as RaceState;
        setRaceState(state);

        // Only update phase from server on round/status change
        const raceChanged = state.currentRace.id !== lastRaceIdRef.current;
        const statusChanged = state.currentRace.status !== lastStatusRef.current;
        if (raceChanged || statusChanged) {
          const { phase: p, timeRemaining: t } = calcRacePhase(
            state.currentRace.status,
            state.currentRace.bettingClosesAt,
            state.currentRace.raceStartsAt
          );
          setPhase(p);
          setTimeRemaining(t);

          // Clear bets when new race starts
          if (raceChanged) {
            setActiveBets([]);
          }

          // Clear settlement flag on new race
          if (raceChanged) {
            settledRef.current = false;
            setRakebackToast(null);
          }

          // Check bet outcomes when race settles
          const currentBets = activeBetsRef.current;
          if (state.currentRace.status === "settled" && state.currentRace.winningHorseId && currentBets.length > 0 && !settledRef.current) {
            settledRef.current = true;
            const updatedBets = currentBets.map(bet => {
              // Find horse's finish position from entries
              const horseEntry = state.currentRace.entries.find((e: RaceEntry) => e.horseId === bet.horseId);
              const finishPos = horseEntry?.finishPosition || 99;

              const isWin = bet.betType === "win" && finishPos === 1;
              const isPlace = bet.betType === "place" && finishPos <= 2;
              const isShow = bet.betType === "show" && finishPos <= 3;
              // Default to win check for old bets without betType
              const isDefaultWin = !bet.betType && bet.horseId === state.currentRace.winningHorseId;

              if (isWin || isPlace || isShow || isDefaultWin) {
                return { ...bet, status: "won", payout: bet.amount * bet.lockedOdds };
              }
              return { ...bet, status: "lost", payout: 0 };
            });

            setActiveBets(updatedBets);

            // Compute instant-rakeback amount for the toast.
            // Mirrors the SQL accrue_rakeback() formula: cash stake × edge × tier %.
            // Bonus-funded portion of stake earns no rakeback.
            const cashStakeTotal = currentBets.reduce(
              (s, b) => s + Math.max(0, b.amount - (b.fromBonus ?? 0)),
              0
            );
            if (cashStakeTotal > 0) {
              const tier = getRakebackTier(totalWagered);
              const rakebackAmount = cashStakeTotal * EDGE_RATE * tier.tierPct;
              if (rakebackAmount >= 0.01) {
                setRakebackToast({
                  amount: rakebackAmount,
                  tierLabel: tier.label,
                });
              }
            }

            // Find the top winning bet
            const wonBets = updatedBets.filter(b => b.status === "won");
            const totalWinPayout = wonBets.reduce((sum, b) => sum + (b.payout || 0), 0);
            const topWinBet = wonBets.sort((a, b) => (b.payout || 0) - (a.payout || 0))[0];

            // Sound effects
            if (totalWinPayout > 0) {
              playWin(totalWinPayout);
              const totalStaked = wonBets.reduce((s, b) => s + b.amount, 0);
              track("bet_won", {
                race_id: state.currentRace.id,
                race_number: state.currentRace.raceNumber,
                total_payout: totalWinPayout,
                total_staked: totalStaked,
                profit_usd: totalWinPayout - totalStaked,
                winning_bets: wonBets.length,
                top_odds: topWinBet?.lockedOdds,
                top_payout: topWinBet?.payout || 0,
              });
            } else {
              play("loss");
              const lostStake = currentBets.reduce((s, b) => s + b.amount, 0);
              track("bet_lost", {
                race_id: state.currentRace.id,
                race_number: state.currentRace.raceNumber,
                lost_bets: currentBets.length,
                total_staked: lostStake,
              });
            }

            // Big win celebration
            if (totalWinPayout >= 10) {
              setBigWin({ amount: totalWinPayout, username: username || undefined });
            }

            // Auto-open share card for wins (after short delay for celebration)
            if (topWinBet) {
              const entry = state.currentRace.entries.find((e: RaceEntry) => e.horseId === topWinBet.horseId);
              if (entry) {
                setTimeout(() => {
                  setShareWinBet({
                    horse: entry.horse,
                    betAmount: topWinBet.amount,
                    lockedOdds: topWinBet.lockedOdds,
                    payout: topWinBet.payout || 0,
                    gatePosition: entry.gatePosition,
                  });
                }, totalWinPayout >= 10 ? 2500 : 800);
              }
            }

            // Refresh balance + bonus state for the authenticated user
            if (userId) {
              authedFetch("/api/user/me")
                .then(r => r.json())
                .then(d => {
                  if (d.user) {
                    useUserStore.getState().setBonusState({
                      cashBalance: d.user.balance,
                      bonusBalance: d.user.bonusBalance,
                      wageringRemaining: d.user.wageringRemaining,
                    });
                  }
                })
                .catch(() => {});
            }
          }
        }
        lastRaceIdRef.current = state.currentRace.id;
        lastStatusRef.current = state.currentRace.status;
      }
    } catch { /* retry next poll */ }
    setLoading(false);
  }, []);

  // Track page view once when first race loads
  const trackedViewRef = useRef(false);
  useEffect(() => {
    if (raceState?.currentRace && !trackedViewRef.current) {
      trackedViewRef.current = true;
      track("race_viewed", {
        race_id: raceState.currentRace.id,
        race_number: raceState.currentRace.raceNumber,
        phase,
        logged_in: !!userId,
      });
    }
  }, [raceState?.currentRace?.id]);

  // Smart polling — adapts interval based on race phase + tab visibility.
  // Cuts API calls by ~60% vs flat 2s polling, 100% when tab is hidden.
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let visible = true;

    function getPollInterval(): number {
      // Exponential backoff on errors (2s → 4s → 8s → 16s cap)
      if (errorCountRef.current > 0) {
        return Math.min(2000 * Math.pow(2, errorCountRef.current), 16000);
      }
      if (!raceState?.currentRace) return 3000; // No race yet — moderate
      const status = raceState.currentRace.status;
      if (status === "racing") return 1500;     // Fast — positions updating
      if (status === "closed") return 2000;      // Gates loading — watch closely
      if (status === "betting") return 5000;     // Slow — just odds + timer
      return 5000;                                // Results / settled — waiting
    }

    async function poll() {
      if (cancelled || !visible) return;
      try {
        await fetchState();
        errorCountRef.current = 0;
      } catch {
        errorCountRef.current = Math.min(errorCountRef.current + 1, 4);
      }
      if (!cancelled && visible) {
        pollRef.current = setTimeout(poll, getPollInterval());
      }
    }

    // Visibility change — stop polling when tab is hidden
    function handleVisibility() {
      visible = !document.hidden;
      if (visible && !cancelled) {
        // Tab came back — fetch immediately then resume polling
        poll();
      } else if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    // Initial fetch + start polling
    poll();

    // Local timer for countdown (runs independently of poll)
    const timer = setInterval(() => {
      if (!raceState?.currentRace) return;
      const { phase: p, timeRemaining: t } = calcRacePhase(
        raceState.currentRace.status,
        raceState.currentRace.bettingClosesAt,
        raceState.currentRace.raceStartsAt
      );
      setPhase(p);
      setTimeRemaining(t);
      // When a phase boundary is hit, fetch immediately
      if (t === 0) fetchState();
    }, 1000);

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [raceState?.currentRace?.id, raceState?.currentRace?.status]);

  const handleChatSend = useCallback((message: string) => {
    if (userId && username) sendMessage(userId, username, message);
  }, [userId, username, sendMessage]);

  const handleCancelBet = useCallback(async (betId: string) => {
    if (!userId) return;
    try {
      const res = await authedFetch("/api/race/bet/cancel", {
        method: "POST",
        body: JSON.stringify({ userId, betId }),
      });
      const data = await res.json();
      if (res.ok && data.cancelled) {
        // Remove from active bets and refund balance + bonus locally
        setActiveBets(prev => prev.filter(b => b.id !== betId));
        useUserStore.getState().setBonusState({
          cashBalance: data.newBalance,
          bonusBalance: data.bonusBalance,
          wageringRemaining: data.wageringRemaining,
        });
        track("bet_cancelled", {
          bet_id: betId,
          refunded: data.refunded,
          refund_to_cash: data.refundToCash,
          refund_to_bonus: data.refundToBonus,
        });
      }
    } catch { /* silent — next poll will reconcile */ }
  }, [userId, authedFetch]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Loading races...</p></div>;
  if (!raceState) return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-muted-foreground">Creating first race...</p></div>;

  const { currentRace, recentWinners } = raceState;
  // A race only counts as "results" once the server has actually written
  // finish positions. Until then we keep the racing UI visible — avoids
  // showing a podium with placeholder data during the optimistic phase
  // advancement gap (client thinks race is over, server hasn't settled yet).
  const finishPositionsReady = currentRace.entries.some(
    (e) => typeof e.finishPosition === "number"
  );
  const isResults = phase === "results" && finishPositionsReady;
  const isRacing = phase === "racing" || (phase === "results" && !finishPositionsReady);
  const isBetting = phase === "betting";

  const sortedEntries = [...currentRace.entries].sort((a, b) => {
    if (isResults) return (a.finishPosition || 99) - (b.finishPosition || 99);
    return a.currentOdds - b.currentOdds;
  });
  const selectedRaceEntry = selectedHorse
    ? currentRace.entries.find((entry) => entry.id === selectedHorse.id) || selectedHorse
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
    <LiveWinsTicker />
    <div className="flex h-full overflow-hidden">
    <div className="flex-1 max-w-2xl xl:max-w-[1400px] mx-auto px-4 xl:px-6 py-3 xl:py-4 space-y-3 xl:space-y-4 overflow-x-hidden w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold shrink-0">Race #{currentRace.raceNumber}</h1>
            {/* Provably fair hash — visible inline */}
            {currentRace.serverSeedHash && (
              <button
                onClick={() => {
                  const text = currentRace.serverSeedHash;
                  navigator.clipboard.writeText(text);
                }}
                title={`Server seed hash: ${currentRace.serverSeedHash}\nClick to copy`}
                className="text-[9px] font-mono text-white/15 truncate max-w-[120px] sm:max-w-[180px] hover:text-white/30 transition-colors cursor-pointer"
              >
                {currentRace.serverSeedHash.slice(0, 16)}...
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{currentRace.distance}m</span>
            <span className="capitalize">{currentRace.ground}</span>
            <span>{currentRace.entries.length} runners</span>
          </div>
        </div>
        <div className="text-right relative">
          {/* Urgency pulse ring for betting timer */}
          {isBetting && timeRemaining <= 10 && (
            <div className={cn(
              "absolute -inset-2 rounded-xl border-2 animate-ping",
              timeRemaining <= 5 ? "border-red/30" : "border-gold/20"
            )} style={{ animationDuration: "1.5s" }} />
          )}
          <div className={cn(
            "font-mono font-black tabular-nums relative",
            isBetting ? "text-3xl" : "text-2xl",
            isBetting && timeRemaining > 15 && "text-foreground/80",
            isBetting && timeRemaining <= 15 && timeRemaining > 5 && "text-gold drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]",
            isBetting && timeRemaining <= 5 && "text-red drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]",
            phase === "closed" && "text-gold",
            isRacing && "text-green",
            isResults && "text-muted-foreground"
          )}>
            {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, "0")}
          </div>
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold">
            {phase === "closed" ? "GATES LOADING" : phase}
          </span>
        </div>
      </div>

      {/* Daily login bonus card */}
      <DailyBonusCard />

      {/* Active signup bonus: wagering progress banner */}
      <WageringProgress />

      {/* 2D Race Canvas — during closed phase (idle at gates) and racing */}
      {(phase === "closed" || isRacing) && (
        <RaceCanvas
          entries={currentRace.entries}
          checkpoints={currentRace.checkpoints}
          phase={phase}
          timeRemaining={timeRemaining}
          raceDuration={RACE_TIMING.RACE_DURATION}
          ground={currentRace.ground}
          raceStartsAt={currentRace.raceStartsAt}
          bettingClosesAt={currentRace.bettingClosesAt}
          closedDuration={RACE_TIMING.CLOSED_DURATION}
        />
      )}

      {/* Podium — replaces the race card list during results */}
      {isResults && (
        <PodiumResults
          entries={currentRace.entries}
          raceId={currentRace.id}
          raceNumber={currentRace.raceNumber}
        />
      )}

      {/* Race card — hidden during closed (canvas showing), racing, and results */}
      <div className={cn(
        "rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#11111a] overflow-hidden",
        (isRacing || phase === "closed" || isResults) && "hidden"
      )}>
        <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
            {isResults ? "Results" : "Race Card"}
          </span>
          <span className="text-[10px] text-white/40">
            {currentRace.betCount} bets
          </span>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {sortedEntries.map((entry) => {
            const h = entry.horse;
            // Find the shortest odds in the field so we can give the favourite
            // a clear visual hierarchy — the favourite's odds render larger
            // than the rest of the field, longshots render smaller.
            const minOdds = Math.min(...currentRace.entries.map(e => e.currentOdds));
            const isFav = entry.currentOdds === minOdds;
            const isLongshot = entry.currentOdds >= 15;
            // Ground match — colour the silks ring if this horse prefers today's going.
            const groundMatch = h.groundPreference === currentRace.ground;
            // Implied win % from decimal odds.
            const impliedPct = entry.currentOdds > 0 ? (100 / entry.currentOdds) : 0;

            return (
              <button
                key={entry.id}
                onClick={() => isBetting ? setSelectedHorse(entry) : null}
                disabled={!isBetting}
                className={cn(
                  "group w-full flex items-center gap-3 px-3 py-3 transition-all text-left relative",
                  isResults && entry.finishPosition === 1 && !isRacing && "bg-green/[0.06]",
                  isBetting && "hover:bg-white/[0.04] active:bg-white/[0.06]"
                )}
              >
                {/* Saddle-cloth gate number — filled square in silks colour with white numeral. */}
                <div
                  className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]"
                  style={{ backgroundColor: entry.horse.color }}
                >
                  <span className="text-sm font-black text-white leading-none drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
                    {entry.gatePosition}
                  </span>
                </div>

                {/* Horse sprite — every horse sits inside a circular frame so
                    the row reads cleanly regardless of sprite contrast against
                    the dark background. Ground-match horses get a stronger
                    silks-coloured ring; the rest get a neutral hairline. */}
                <div
                  className="shrink-0 rounded-full p-[2px] flex items-center justify-center bg-white/[0.025]"
                  style={{
                    boxShadow: groundMatch
                      ? `inset 0 0 0 1.5px ${h.color}aa, 0 0 14px ${h.color}30`
                      : `inset 0 0 0 1px rgba(255,255,255,0.14)`,
                  }}
                >
                  <HorseSprite slug={entry.horse.slug} size={56} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{h.name}</span>
                    {isFav && !isResults && (
                      <span className="text-[8px] font-black tracking-wider text-amber-400/70 uppercase shrink-0">FAV</span>
                    )}
                    {isLongshot && !isResults && !isFav && (
                      <span className="text-[8px] font-black tracking-wider text-green/60 uppercase shrink-0">LONG</span>
                    )}
                    {groundMatch && !isResults && (
                      <span
                        title={`Prefers ${h.groundPreference} — today is ${currentRace.ground}`}
                        className="shrink-0 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: h.color }}
                      />
                    )}
                    <a
                      href={`/horse/${entry.horse.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      title={`View form for ${h.name}`}
                      className="shrink-0 text-white/25 hover:text-violet/90 transition-colors"
                      aria-label={`Form guide for ${h.name}`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                    </a>
                    {isResults && !isRacing && entry.finishPosition === 1 && (
                      <span className="text-[10px] bg-green/20 text-green px-1.5 py-0.5 rounded font-bold">WIN</span>
                    )}
                  </div>

                  {/* Form pills — last 5 finishes, most recent on the left.
                      Replaces the tagline as the primary sub-text; the tagline
                      is still available inside the bet modal. */}
                  {h.last5Results.length > 0 ? (
                    <div className="flex items-center gap-1 mt-1">
                      {h.last5Results.slice(0, 5).map((r, i) => (
                        <span
                          key={i}
                          className={cn(
                            "text-[9px] font-black w-4 h-4 rounded-[3px] flex items-center justify-center leading-none tabular-nums",
                            r.position === 1 && "bg-green/20 text-green",
                            r.position === 2 && "bg-white/[0.08] text-white/70",
                            r.position === 3 && "bg-white/[0.05] text-white/55",
                            r.position > 3 && "bg-white/[0.02] text-white/25"
                          )}
                        >
                          {r.position > 9 ? "9" : r.position}
                        </span>
                      ))}
                      <span className="text-[9px] text-white/25 ml-1">form</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-white/25 italic mt-0.5 truncate">{getHorseIdentity(h.slug).tagline}</p>
                  )}
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  {isResults && !isRacing && entry.finishPosition ? (
                    <>
                      <span className="text-[11px] font-mono text-white/35">{entry.currentOdds.toFixed(2)}</span>
                      <span className={cn("text-lg font-black",
                        entry.finishPosition === 1 && "text-green",
                        entry.finishPosition > 1 && entry.finishPosition <= 3 && "text-white/80",
                        entry.finishPosition > 3 && "text-white/30"
                      )}>
                        {entry.finishPosition}
                        <span className="text-[10px]">
                          {entry.finishPosition === 1 ? "st" : entry.finishPosition === 2 ? "nd" : entry.finishPosition === 3 ? "rd" : "th"}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-end">
                        <span className={cn("font-black font-mono leading-none tabular-nums",
                          // Visual hierarchy — favourite renders bigger + hotter,
                          // midfield renders standard, longshots shrink + cool.
                          isFav && "text-2xl text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.25)]",
                          !isFav && entry.currentOdds < 8 && "text-xl text-white/85",
                          !isFav && entry.currentOdds >= 8 && "text-base text-green/80"
                        )}>
                          {entry.currentOdds.toFixed(2)}
                        </span>
                        <span className="text-[8px] text-white/25 font-mono mt-0.5 tabular-nums">
                          {impliedPct.toFixed(0)}%
                        </span>
                      </div>
                      {isBetting && (
                        <span className="text-[9px] text-violet/0 group-hover:text-violet/70 transition-colors font-bold uppercase w-6">
                          BET
                        </span>
                      )}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Connect wallet prompt at bottom of race card */}
        {!userId && isBetting && (
          <div className="px-4 py-3 border-t border-white/[0.04] space-y-1.5">
            <button
              onClick={login}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet to-magenta text-white font-bold text-sm
                         hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(139,92,246,0.2)]"
            >
              connect wallet — $20 free bet
            </button>
            <p className="text-[10px] text-white/20 text-center">
              pick a horse. the next race starts in seconds.
            </p>
          </div>
        )}
      </div>

      {/* Instant rakeback toast — shows briefly when a race settles. */}
      <AnimatePresence>
        {rakebackToast && phase === "results" && (
          <motion.div
            key={`rakeback-${rakebackToast.amount}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            onAnimationComplete={() => {
              setTimeout(() => setRakebackToast(null), 4500);
            }}
            className="rounded-lg border border-cyan/20 bg-cyan/[0.05] px-3 py-1.5 flex items-center justify-between text-[11px]"
          >
            <span className="font-mono text-cyan/80">
              +${rakebackToast.amount.toFixed(2)} rakeback
            </span>
            <span className="text-white/35 font-mono uppercase tracking-widest text-[9px]">
              {rakebackToast.tierLabel} · auto-credited
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active bets + settlement results */}
      {activeBets.length > 0 && (
        <div className="space-y-1.5">
          {activeBets.map((bet) => (
            <div key={bet.id} className={cn(
              "rounded-xl border px-4 py-2.5 flex items-center justify-between",
              bet.status === "pending" && "border-white/[0.06] bg-white/[0.02]",
              bet.status === "won" && "border-green/20 bg-green/[0.04]",
              bet.status === "lost" && "border-red/10 bg-red/[0.02]"
            )}>
              <div className="flex items-center gap-2">
                <HorseSprite slug={currentRace.entries.find(e => e.horseId === bet.horseId)?.horse.slug || ""} size={24} />
                <div>
                  <span className="text-xs font-semibold text-white/80">{bet.horseName}</span>
                  <span className={cn("text-[9px] ml-1.5 px-1 py-0.5 rounded font-bold uppercase",
                    bet.betType === "win" ? "bg-violet/15 text-violet/70" :
                    bet.betType === "place" ? "bg-cyan/15 text-cyan/70" :
                    bet.betType === "show" ? "bg-gold/15 text-gold/70" :
                    "bg-violet/15 text-violet/70"
                  )}>{bet.betType || "win"}</span>
                  <span className="text-[10px] text-white/30 ml-1.5">@ {bet.lockedOdds.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-right">
                {bet.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <div>
                      <span className="text-xs font-mono text-white/50">${bet.amount.toFixed(2)}</span>
                      <span className="text-[9px] text-white/25 block">→ ${bet.potentialPayout.toFixed(2)}</span>
                    </div>
                    {isBetting && (
                      <button
                        onClick={() => handleCancelBet(bet.id)}
                        className="px-2 py-1 rounded border border-red/20 text-red/60 hover:bg-red/10 hover:text-red/80 active:scale-95 transition-all text-[9px] font-bold uppercase"
                      >
                        cancel
                      </button>
                    )}
                  </div>
                )}
                {bet.status === "won" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-green font-mono">+${(bet.payout || 0).toFixed(2)}</span>
                    <button
                      onClick={() => {
                        const entry = currentRace.entries.find(e => e.horseId === bet.horseId);
                        if (entry) {
                          setShareWinBet({
                            horse: entry.horse,
                            betAmount: bet.amount,
                            lockedOdds: bet.lockedOdds,
                            payout: bet.payout || 0,
                            gatePosition: entry.gatePosition,
                          });
                        }
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-cyan/30 text-cyan hover:bg-cyan/10 transition-all"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span className="text-[9px] font-bold">share</span>
                    </button>
                  </div>
                )}
                {bet.status === "lost" && (() => {
                  // Photo-finish near-miss framing — show "X lengths from $Y"
                  // when the user's horse finished within 2 lengths of the
                  // payout-cutoff position for their bet type.
                  // win → 1st, place → ≤2, show → ≤3.
                  const horseEntry = currentRace.entries.find((e) => e.horseId === bet.horseId);
                  const finishPos = horseEntry?.finishPosition ?? 99;
                  const userMargin = horseEntry?.margin ?? null;
                  const cutoffPos =
                    bet.betType === "show" ? 3 : bet.betType === "place" ? 2 : 1;
                  const cutoffEntry = currentRace.entries.find((e) => e.finishPosition === cutoffPos);
                  const cutoffMargin = cutoffEntry?.margin ?? null;
                  const lengthsBehind =
                    userMargin != null && cutoffMargin != null
                      ? Math.max(0, userMargin - cutoffMargin)
                      : null;
                  const showNearMiss =
                    finishPos > cutoffPos &&
                    lengthsBehind != null &&
                    lengthsBehind <= 2.0 &&
                    lengthsBehind > 0;
                  const wouldHavePaid = bet.amount * bet.lockedOdds;
                  return (
                    <div className="text-right">
                      <span className="text-sm font-bold text-red/60 font-mono">-${bet.amount.toFixed(2)}</span>
                      {showNearMiss ? (
                        <p className="text-[9px] text-gold/65 mt-0.5 font-mono tabular-nums">
                          {lengthsBehind!.toFixed(1)}L from ${wouldHavePaid.toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-[9px] text-white/25 mt-0.5">next race soon</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Commentary */}
      {isResults && currentRace.commentary && (
        <div className="rounded-xl border border-gold/15 bg-gold/[0.04] px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <span className="text-gold/50 text-sm mt-0.5">📢</span>
            <div>
              <p className="text-[10px] text-gold/40 uppercase tracking-wider font-bold mb-1">race commentary</p>
              <p className="text-sm text-gold/70 italic leading-relaxed">{currentRace.commentary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Verify-this-race entry point. Surfaces the provably-fair flow inline
          on the results screen so trust is felt, not buried in a sub-page. */}
      {isResults && (
        <a
          href={`/verify?race=${currentRace.raceNumber}`}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 flex items-center justify-between hover:border-cyan/25 hover:bg-cyan/[0.03] transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span className="text-[11px] text-white/55 group-hover:text-white/80 transition-colors">
              Verify this race yourself
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 group-hover:text-cyan/70 transition-colors">
            provably fair →
          </span>
        </a>
      )}

      {/* Next race nudge — Zeigarnik open loop */}
      {isResults && timeRemaining > 0 && (
        <div className="rounded-xl border border-violet/15 bg-violet/[0.03] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet animate-pulse" />
            <span className="text-xs text-white/50">next race in</span>
            <span className="text-sm font-black font-mono tabular-nums text-violet">
              {timeRemaining}s
            </span>
          </div>
          <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">
            new field · new odds
          </span>
        </div>
      )}

      {/* Recent winners */}
      {recentWinners.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] overflow-x-auto">
          <span className="text-white/40 font-bold shrink-0">RECENT:</span>
          {recentWinners.map((w, i) => (
            <span key={i} className="font-bold shrink-0" style={{ color: w.horseColor }}>
              {w.horseName.split(" ")[0]}
            </span>
          ))}
        </div>
      )}

      {/* Chat ticker — mobile only */}
      <div className="lg:hidden">
        <ChatTicker messages={chatMessages} unreadCount={unreadCount}
          onSend={handleChatSend} userId={userId} />
      </div>

      {/* Horse detail / bet card (glassmorphic) */}
      <AnimatePresence>
        {selectedRaceEntry && isBetting && (
          <HorseBetCard
            entry={selectedRaceEntry}
            raceId={currentRace.id}
            userId={userId}
            balance={balance}
            bonusBalance={bonusBalance}
            wageringRemaining={wageringRemaining}
            raceDistance={currentRace.distance}
            raceGround={currentRace.ground}
            authedFetch={authedFetch}
            onClose={() => setSelectedHorse(null)}
            onBetPlaced={(bet) => setActiveBets(prev => [...prev, bet])}
          />
        )}
      </AnimatePresence>

      {/* Share win card modal */}
      {shareWinBet && (
        <RaceWinCard
          horse={shareWinBet.horse}
          betAmount={shareWinBet.betAmount}
          lockedOdds={shareWinBet.lockedOdds}
          payout={shareWinBet.payout}
          raceNumber={currentRace.raceNumber}
          distance={currentRace.distance}
          ground={currentRace.ground}
          gatePosition={shareWinBet.gatePosition}
          username={username || "anon"}
          onClose={() => setShareWinBet(null)}
        />
      )}

      {/* Big win celebration overlay */}
      <BigWinCelebration
        winAmount={bigWin?.amount || null}
        username={bigWin?.username}
        onComplete={() => setBigWin(null)}
      />
    </div>

    {/* Chat sidebar — desktop only.
        Pinned to viewport height so it stays fixed regardless of how
        tall the center column grows during betting/results phases. */}
    <aside className="hidden lg:flex w-[300px] border-l border-border flex-col bg-card shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] self-start">
      <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
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
    </div>
    </div>
  );
}

// ======= HORSE BET CARD (glassmorphic) =======

function HorseBetCard({
  entry, raceId, userId, balance, bonusBalance = 0, wageringRemaining = 0, raceDistance, raceGround, authedFetch, onClose, onBetPlaced,
}: {
  entry: RaceEntry; raceId: string; userId: string | null; balance: number;
  bonusBalance?: number; wageringRemaining?: number;
  raceDistance: number; raceGround: string;
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onBetPlaced: (bet: { id: string; horseId: number; horseName: string; amount: number; lockedOdds: number; potentialPayout: number; status: string; betType: string; fromBonus?: number }) => void;
}) {
  const { login: connectWallet } = useAuthActions();
  const [betAmount, setBetAmount] = useState(0);
  const [betType, setBetType] = useState<"win" | "place" | "show">("win");
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [liabilityRemainingOverride, setLiabilityRemainingOverride] = useState<number | null>(null);

  const activeOdds = betType === "place" ? entry.placeOdds : betType === "show" ? entry.showOdds : entry.currentOdds;
  const totalFunds = balance + bonusBalance;
  const knownRemainingLiability = liabilityRemainingOverride ?? entry.liabilityRemaining ?? null;
  const liabilityStakeCap = knownRemainingLiability !== null
    ? floorCents(knownRemainingLiability / activeOdds)
    : null;
  const baseStakeCap = Math.min(totalFunds, BANKROLL_RACING.MAX_BET);
  const maxAllowed = floorCents(Math.min(
    baseStakeCap,
    liabilityStakeCap ?? Number.POSITIVE_INFINITY
  ));
  const potentialPayout = betAmount * activeOdds;
  const chips = stakeChipsForOdds(activeOdds);
  const isLiabilityLimited = liabilityStakeCap !== null && liabilityStakeCap < baseStakeCap;

  const h = entry.horse;
  const winRate = h.careerRaces > 0 ? ((h.careerWins / h.careerRaces) * 100).toFixed(0) : "—";
  const placeRate = h.careerRaces > 0 ? (((h.careerWins + h.careerPlaces + h.careerShows) / h.careerRaces) * 100).toFixed(0) : "—";

  // Ground match — just colour the text, don't explain why
  const groundMatch = h.groundPreference === raceGround;
  const groundAdjacent = ["firm", "good", "soft", "heavy"];
  const groundSteps = Math.abs(groundAdjacent.indexOf(h.groundPreference) - groundAdjacent.indexOf(raceGround));

  useEffect(() => {
    setLiabilityRemainingOverride(null);
  }, [entry.id]);

  useEffect(() => {
    setBetAmount((prev) => prev > maxAllowed ? maxAllowed : prev);
  }, [maxAllowed]);

  const handlePlaceBet = async () => {
    if (!userId || betAmount < MIN_RACE_BET) return;

    // Auto-cap to whatever the user can actually afford (cash + bonus combined)
    // and to the per-horse liability cap if known. Frictionless: clicking
    // "Bet $5" with $1 cash + $0 bonus quietly places a $1 bet rather than
    // erroring out and asking the user to fix it.
    const stake = floorCents(Math.min(betAmount, maxAllowed)); // round DOWN to cents — never bet a fraction we can't cover
    if (stake < MIN_RACE_BET) {
      // Truly nothing to bet with — surface this as a guard rather than silently failing.
      setResult({
        success: false,
        message: isLiabilityLimited ? "This horse has reached its betting limit" : "Add funds to place a bet",
      });
      return;
    }

    setPlacing(true);
    try {
      const res = await authedFetch("/api/race/bet", {
        method: "POST",
        body: JSON.stringify({ userId, raceId, horseId: entry.horseId, amount: stake, betType }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If liability limit hit, auto-cap to max allowed
        if (data.maxBet !== undefined || data.remainingLiability !== undefined) {
          const lockedOdds = Number(data.lockedOdds || activeOdds);
          const remaining = typeof data.remainingLiability === "number"
            ? data.remainingLiability
            : Number(data.maxBet || 0) * lockedOdds;
          const cap = floorCents(typeof data.maxBet === "number" ? data.maxBet : remaining / lockedOdds);
          setLiabilityRemainingOverride(floorCents(remaining));
          if (cap >= MIN_RACE_BET) {
            setBetAmount(cap);
            setResult({ success: false, message: `Only $${cap.toFixed(2)} left at ${lockedOdds.toFixed(2)}x` });
          } else {
            setResult({ success: false, message: "This horse has reached its betting limit" });
          }
        } else {
          setResult({ success: false, message: data.error });
        }
      } else {
        useUserStore.getState().setBonusState({
          cashBalance: data.newBalance,
          bonusBalance: data.bonusBalance,
          wageringRemaining: data.wageringRemaining,
        });
        onBetPlaced({
          id: data.bet.id,
          horseId: entry.horseId,
          horseName: entry.horse.name,
          amount: data.bet.amount,
          lockedOdds: data.bet.lockedOdds,
          potentialPayout: data.bet.potentialPayout,
          status: "pending",
          betType: data.bet.betType || betType,
          fromBonus: data.fromBonus || 0,
        });
        sessionBetCount++;
        const store = useUserStore.getState();

        // Track bonus conversion — this is a key retention moment
        if (data.bonusConverted) {
          track("bonus_converted", {
            cash_balance_after: data.newBalance,
            total_wagered: store.totalWagered + data.bet.amount,
          });
        }

        track("bet_placed", {
          race_id: raceId,
          horse_name: entry.horse.name,
          horse_id: entry.horseId,
          bet_type: betType,
          amount_usd: data.bet.amount,
          locked_odds: data.bet.lockedOdds,
          potential_payout: data.bet.potentialPayout,
          is_first_bet: sessionBetCount === 1 && store.totalWagered <= data.bet.amount,
          from_cash: data.fromCash || 0,
          from_bonus: data.fromBonus || 0,
          wagering_counted: data.wageringCounted || false,
          bonus_converted: data.bonusConverted || false,
          balance_after: data.newBalance,
          bonus_balance_after: data.bonusBalance || 0,
          session_bet_number: sessionBetCount,
        });
        setResult({ success: true, message: `Bet placed! Potential win: $${Number(data.bet.potentialPayout).toFixed(2)}` });
        setTimeout(() => { onClose(); setResult(null); }, 1500);
      }
    } catch { setResult({ success: false, message: "Failed to place bet" }); }
    setPlacing(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#14141f]/95 backdrop-blur-xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">

        {/* Header — name, gate, odds */}
        <div className="flex items-center gap-3">
          <HorseSprite slug={h.slug} size={48} className="shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color: h.color }}>{entry.gatePosition}.</span>
              <h3 className="text-base font-bold text-white">{h.name}</h3>
            </div>
            <p className="text-[10px] text-white/40 italic">{getHorseIdentity(h.slug).tagline}</p>
          </div>
          <div className="text-right">
            <span className={cn("text-2xl font-black font-mono",
              activeOdds < 3 ? "text-red/80" : activeOdds < 8 ? "text-white" : "text-green/80"
            )}>{activeOdds.toFixed(2)}</span>
            <p className="text-[9px] text-white/25 capitalize">{betType}</p>
          </div>
        </div>

        {/* Bet type selector — Win / Place / Show */}
        <div className="flex rounded-lg bg-white/[0.03] border border-white/[0.06] p-0.5">
          {([
            { type: "win" as const, label: "Win", desc: "1st", odds: entry.currentOdds },
            { type: "place" as const, label: "Place", desc: "Top 2", odds: entry.placeOdds },
            { type: "show" as const, label: "Show", desc: "Top 3", odds: entry.showOdds },
          ]).map((t) => (
            <button
              key={t.type}
              onClick={() => { setBetType(t.type); setResult(null); }}
              className={cn(
                "flex-1 py-2 rounded-md text-center transition-all",
                betType === t.type
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/30 hover:text-white/50"
              )}
            >
              <span className="text-[11px] font-bold block">{t.label}</span>
              <span className="text-[9px] text-white/25 block">{t.desc} · {t.odds.toFixed(2)}x</span>
            </button>
          ))}
        </div>

        {/* ===== FORM GUIDE ===== */}

        {/* Speed Rating + Today's Conditions */}
        <div className="flex items-center gap-3">
          <div className="text-center px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <span className="text-lg font-black text-cyan font-mono">{h.speedRating || 70}</span>
            <p className="text-[8px] text-white/30 uppercase">Rating</p>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40">{raceDistance}m · <span className="capitalize">{raceGround}</span></span>
              <span className={cn("text-[10px] capitalize font-semibold",
                groundMatch ? "text-green/80" : groundSteps === 1 ? "text-white/45" : "text-red/50"
              )}>
                Prefers {h.groundPreference} {groundMatch ? "✓" : ""}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40">
                {h.speed > h.stamina ? "Sprinter type" : h.stamina > h.speed ? "Stayer type" : "Versatile"}
              </span>
              <span className="text-[10px] text-white/30">Avg finish: {(h.avgFinish || 4.5).toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Stats bars */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: "Speed", value: h.speed, color: "#06B6D4" },
            { label: "Stamina", value: h.stamina, color: "#22C55E" },
            { label: "Form", value: h.form, color: "#F59E0B" },
            { label: "Consistency", value: h.consistency, color: "#8B5CF6" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <span className="text-[10px] text-white/40 w-12">{stat.label}</span>
              <div className="flex-1 bg-white/[0.05] rounded-full h-1.5">
                <div className="h-full rounded-full" style={{ width: `${stat.value}%`, backgroundColor: stat.color }} />
              </div>
              <span className="text-[10px] font-bold text-white/50 w-5 text-right">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Career + Distance/Ground Records */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5 space-y-2">
          {/* Career line */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] text-white/30">Career:</span>
              <span className="text-[10px] text-white/60">{h.careerRaces} starts</span>
              <span className="text-[10px] text-green/60">{h.careerWins}W</span>
              <span className="text-[10px] text-white/40">{h.careerPlaces}P</span>
              <span className="text-[10px] text-white/30">{h.careerShows}S</span>
            </div>
            <span className="text-[10px] font-mono text-white/40">{winRate}%</span>
          </div>

          {/* Distance record for THIS race's distance */}
          {(() => {
            const dr = h.distanceRecord?.[String(raceDistance)];
            return dr && dr.starts > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30">At {raceDistance}m:</span>
                <span className={cn("text-[10px] font-semibold",
                  dr.wins / dr.starts > 0.25 ? "text-green/70" : "text-white/45"
                )}>
                  {dr.wins}/{dr.starts} wins · {dr.places}/{dr.starts} top 3
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30">At {raceDistance}m:</span>
                <span className="text-[10px] text-white/25">No runs</span>
              </div>
            );
          })()}

          {/* Ground record for THIS race's ground */}
          {(() => {
            const gr = h.groundRecord?.[raceGround];
            return gr && gr.starts > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 capitalize">On {raceGround}:</span>
                <span className={cn("text-[10px] font-semibold",
                  gr.wins / gr.starts > 0.25 ? "text-green/70" : "text-white/45"
                )}>
                  {gr.wins}/{gr.starts} wins · {gr.places}/{gr.starts} top 3
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 capitalize">On {raceGround}:</span>
                <span className="text-[10px] text-white/25">No runs</span>
              </div>
            );
          })()}

          {/* Gate record */}
          {(() => {
            const gatR = h.gateRecord?.[String(entry.gatePosition)];
            return gatR && gatR.starts > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30">From gate {entry.gatePosition}:</span>
                <span className="text-[10px] text-white/45">{gatR.wins}/{gatR.starts} wins</span>
              </div>
            ) : null;
          })()}
        </div>

        {/* Last 5 form */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/30 mr-1">Form:</span>
          {h.last5Results.length > 0 ? h.last5Results.map((r, i) => (
            <span key={i} className={cn(
              "text-[10px] font-bold w-5.5 h-5.5 rounded flex items-center justify-center",
              r.position === 1 && "bg-green/15 text-green border border-green/20",
              r.position === 2 && "bg-white/[0.06] text-white/60",
              r.position === 3 && "bg-white/[0.04] text-white/45",
              r.position > 3 && "bg-white/[0.02] text-white/25"
            )}>
              {r.position}
            </span>
          )) : (
            <span className="text-[10px] text-white/25">No recent runs</span>
          )}
        </div>

        {/* Separator */}
        <div className="border-t border-white/[0.04]" />

        {/* Bet controls */}
        {userId ? (
          <>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-white/35 text-[10px]">Odds</p>
                <p className="text-white font-bold font-mono">{activeOdds.toFixed(2)}x</p>
              </div>
              <div>
                <p className="text-white/35 text-[10px]">$1 pays</p>
                <p className="text-green font-bold font-mono">${activeOdds.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-white/35 text-[10px]">Max stake</p>
                <p className={cn("font-bold font-mono", maxAllowed >= MIN_RACE_BET ? "text-white" : "text-red/70")}>
                  {maxAllowed >= MIN_RACE_BET ? `$${maxAllowed.toFixed(2)}` : "$0.00"}
                </p>
              </div>
              {isLiabilityLimited && (
                <p className="col-span-3 text-[10px] text-gold/70 border-t border-white/[0.04] pt-2 font-mono tabular-nums">
                  Only ${maxAllowed.toFixed(2)} left at {activeOdds.toFixed(2)}x
                </p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {chips.map((chip) => {
                const remainingStake = floorCents(maxAllowed - betAmount);
                const addAmount = floorCents(Math.min(chip, remainingStake));
                const atMax = maxAllowed < MIN_RACE_BET || remainingStake <= 0;
                return (
                  <button key={chip}
                    onClick={() => setBetAmount((prev) => {
                      const next = prev + addAmount;
                      setResult(null);
                      return floorCents(Math.min(next, maxAllowed));
                    })}
                    disabled={atMax}
                    className={cn("min-h-[46px] py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 flex flex-col items-center justify-center",
                      "bg-white/[0.04] border-white/[0.08] text-white/70 hover:bg-white/[0.06]",
                      atMax && "opacity-25")}>
                    <span>+${formatStake(addAmount)}</span>
                    <span className="text-[9px] text-white/30 font-mono">${(addAmount * activeOdds).toFixed(2)}</span>
                  </button>
                );
              })}
              <button
                onClick={() => { setBetAmount(maxAllowed); setResult(null); }}
                disabled={maxAllowed < MIN_RACE_BET}
                className={cn("min-h-[46px] py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 flex flex-col items-center justify-center",
                  "bg-violet/[0.10] border-violet/20 text-violet/90 hover:bg-violet/[0.14]",
                  maxAllowed < MIN_RACE_BET && "opacity-25")}
              >
                <span>MAX</span>
                <span className="text-[9px] text-white/35 font-mono">${maxAllowed.toFixed(2)}</span>
              </button>
            </div>

            {betAmount > 0 && (
              <button onClick={() => { setBetAmount(0); setResult(null); }}
                className="w-full py-2 rounded-xl text-[10px] font-bold text-red bg-red/10 border border-red/20">CLEAR STAKE</button>
            )}

            {betAmount > 0 && (() => {
              // Mirror the server's "spend cash first, then bonus" allocation
              // so the user sees up-front exactly how the stake will be split.
              // Avoids the "where did my bonus go?" surprise post-bet.
              const fromCash = Math.min(balance, betAmount);
              const fromBonus = Math.max(0, betAmount - balance);
              const showSplit = fromBonus > 0;
              return (
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white/40 text-[10px]">Stake</p>
                      <p className="text-white font-bold font-mono">${betAmount.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/40 text-[10px]">Potential Win</p>
                      <p className="text-green font-bold font-mono">${potentialPayout.toFixed(2)}</p>
                    </div>
                  </div>
                  {showSplit && (
                    <div className="flex items-center gap-1.5 text-[10px] text-white/45 pt-1.5 border-t border-white/[0.04]">
                      <span className="font-mono tabular-nums">${fromCash.toFixed(2)}</span>
                      <span className="text-white/25">cash</span>
                      <span className="text-white/20">+</span>
                      <span className="font-mono tabular-nums text-violet/70">${fromBonus.toFixed(2)}</span>
                      <span className="text-white/25">bonus</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <button onClick={handlePlaceBet} disabled={betAmount < MIN_RACE_BET || maxAllowed < MIN_RACE_BET || placing}
              className={cn("w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.99]",
                betAmount >= MIN_RACE_BET && maxAllowed >= MIN_RACE_BET
                  ? "bg-gradient-to-r from-violet to-magenta text-white shadow-[0_4px_20px_rgba(139,92,246,0.25)]"
                  : "bg-white/[0.04] text-white/40")}>
              {placing
                ? "Placing..."
                : maxAllowed < MIN_RACE_BET
                  ? isLiabilityLimited ? "Limit reached" : "Add funds"
                  : betAmount < MIN_RACE_BET
                    ? "Select amount"
                    : `Place $${betAmount.toFixed(2)} ${betType} bet`}
            </button>

            {result && (
              <p className={cn("text-xs text-center", result.success ? "text-green" : "text-red")}>{result.message}</p>
            )}
          </>
        ) : (
          <div className="space-y-2 py-1">
            <button
              onClick={() => {
                onClose();
                connectWallet();
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet to-magenta text-white font-bold text-sm
                         hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(139,92,246,0.2)]"
            >
              connect wallet — $20 free bet
            </button>
            <p className="text-[10px] text-white/20 text-center">
              takes 10 seconds. bet on {h.name} before gates close.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
