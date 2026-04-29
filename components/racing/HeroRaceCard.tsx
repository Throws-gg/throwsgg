"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Phase = "betting" | "closed" | "racing" | "results";

interface Entry {
  id: string;
  horseId: number;
  horse: { id: number; name: string; color: string; slug: string };
  gatePosition: number;
  currentOdds: number;
  finishPosition?: number;
}

interface Checkpoint {
  time: number;
  positions: { horseId: number; distance: number }[];
}

interface RaceState {
  currentRace: {
    id: string;
    raceNumber: number;
    status: string;
    distance: number;
    ground: string;
    serverSeedHash: string;
    raceStartsAt: string;
    bettingClosesAt: string;
    betCount: number;
    totalVolume: number;
    entries: Entry[];
    winningHorseId: number | null;
    checkpoints?: Checkpoint[];
  };
  timeRemaining: number;
  phase: Phase;
  waiting?: boolean;
}

const RACE_DURATION_SEC = 20;
const RESULTS_DURATION_SEC = 15;

/**
 * Compute the absolute deadline (ms epoch) for the active phase.
 * This anchors the countdown to a fixed point in time so the visible
 * timer can never tick *up* between server polls — it's a pure function
 * of the server's stable phase-boundary timestamps.
 */
function deadlineFor(phase: Phase, race: RaceState["currentRace"]): number {
  const raceStart = new Date(race.raceStartsAt).getTime();
  if (phase === "betting" || phase === "closed") {
    // For betting we want bettingClosesAt; for closed we want raceStartsAt
    return phase === "betting" ? new Date(race.bettingClosesAt).getTime() : raceStart;
  }
  if (phase === "racing") return raceStart + RACE_DURATION_SEC * 1000;
  return raceStart + (RACE_DURATION_SEC + RESULTS_DURATION_SEC) * 1000;
}

const POLL_MS = 2000;

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function HeroRaceCard() {
  const [state, setState] = useState<RaceState | null>(null);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/race/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RaceState;
        if (!cancelled) setState(data);
      } catch {
        // silent
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!state || state.waiting || !state.currentRace) {
    return <SkeletonCard />;
  }

  const { currentRace, phase } = state;
  // Anchor countdown to the absolute server-provided deadline. The server
  // sends stable phase-boundary timestamps (bettingClosesAt, raceStartsAt) on
  // every response — even cached ones — so the visible timer monotonically
  // ticks down regardless of cache age or network jitter.
  const deadlineMs = deadlineFor(phase, currentRace);
  const liveSeconds = now > 0 ? Math.max(0, (deadlineMs - now) / 1000) : state.timeRemaining;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/[0.08] bg-[#0B0B12]/80 backdrop-blur-md overflow-hidden
                 shadow-[0_30px_80px_-30px_rgba(139,92,246,0.25)]"
    >
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.012]">
        <div className="flex items-center gap-2.5">
          <div className="relative w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-green animate-ping opacity-50" />
            <span className="absolute inset-0 rounded-full bg-green" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/45">
            Race #{currentRace.raceNumber.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-white/35">
          <span>{currentRace.distance}m</span>
          <span className="text-white/15">·</span>
          <span className="capitalize">{currentRace.ground}</span>
        </div>
      </div>

      {/* Phase + countdown */}
      <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
        <PhaseLabel phase={phase} />
        <CountdownDisplay phase={phase} seconds={liveSeconds} />
      </div>

      {/* Body — switches on phase */}
      <div className="px-2 pb-2 min-h-[280px]">
        <AnimatePresence mode="wait">
          {phase === "betting" || phase === "closed" ? (
            <motion.div key="betting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <RunnersList entries={currentRace.entries} />
            </motion.div>
          ) : phase === "racing" ? (
            <motion.div key="racing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <LaneViz
                entries={currentRace.entries}
                checkpoints={currentRace.checkpoints}
                raceStartsAt={currentRace.raceStartsAt}
                now={now}
              />
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <ResultsList entries={currentRace.entries} winningHorseId={currentRace.winningHorseId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — commit hash + total volume.
          Pre-race we show the SHA-256 *commitment* of the server seed; the seed
          itself stays hidden until settle. Showing the commit doesn't leak
          results — that's the entire point of commit-reveal. */}
      <div className="border-t border-white/[0.05] px-4 py-2.5 flex items-center justify-between text-[10px] font-mono">
        <a
          href={phase === "results" ? `/verify?race=${currentRace.raceNumber}` : "/verify"}
          className="text-white/30 hover:text-cyan transition-colors flex items-center gap-1.5 group"
        >
          <span className="text-white/25 uppercase tracking-wider">{phase === "results" ? "seed" : "commit"}</span>
          <span className="text-white/55 group-hover:text-cyan transition-colors">
            {currentRace.serverSeedHash?.slice(0, 8) ?? "—"}…{currentRace.serverSeedHash?.slice(-4) ?? ""}
          </span>
          <span className="text-white/20 group-hover:text-cyan/70 transition-colors">verify →</span>
        </a>
        <div className="text-white/30 tabular-nums">
          <span className="text-white/15 uppercase tracking-wider mr-1.5">vol</span>
          ${currentRace.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
    </motion.div>
  );
}

function PhaseLabel({ phase }: { phase: Phase }) {
  const text =
    phase === "betting" ? "betting open" :
    phase === "closed" ? "gates loading" :
    phase === "racing" ? "racing" : "results";
  const color =
    phase === "betting" ? "text-green" :
    phase === "closed" ? "text-gold" :
    phase === "racing" ? "text-magenta" : "text-cyan";
  return (
    <div className={`text-[11px] font-mono uppercase tracking-[0.16em] ${color}`}>
      {text}
    </div>
  );
}

function CountdownDisplay({ phase, seconds }: { phase: Phase; seconds: number }) {
  const display =
    phase === "results" ? "settled" :
    phase === "racing" ? `${Math.ceil(seconds)}s` :
    formatCountdown(seconds);
  return (
    <div className="font-mono tabular-nums text-2xl font-light text-white/85 leading-none">
      {display}
    </div>
  );
}

function RunnersList({ entries }: { entries: Entry[] }) {
  // Determine favourite (lowest odds) for subtle emphasis
  const sorted = [...entries].sort((a, b) => a.gatePosition - b.gatePosition);
  const minOdds = Math.min(...entries.map((e) => e.currentOdds));
  return (
    <div className="space-y-px">
      {sorted.map((e) => {
        const isFav = e.currentOdds === minOdds;
        return (
          <div
            key={e.id}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white/[0.02] transition-colors"
          >
            {/* Saddle cloth */}
            <div
              className="w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-mono font-bold text-white/95 shrink-0"
              style={{ backgroundColor: e.horse.color, boxShadow: `inset 0 -1px 2px rgba(0,0,0,0.3)` }}
            >
              {e.gatePosition}
            </div>
            {/* Name */}
            <span className="flex-1 text-[12px] text-white/75 truncate font-medium">
              {e.horse.name}
            </span>
            {/* Odds */}
            <div className="flex items-center gap-1.5">
              {isFav && (
                <span className="text-[8px] font-mono uppercase tracking-wider text-cyan/70">fav</span>
              )}
              <span className={`font-mono tabular-nums text-[12px] ${isFav ? "text-cyan" : "text-white/70"}`}>
                {e.currentOdds.toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LaneViz({
  entries,
  checkpoints,
  raceStartsAt,
  now,
}: {
  entries: Entry[];
  checkpoints?: Checkpoint[];
  raceStartsAt: string;
  now: number;
}) {
  const sorted = [...entries].sort((a, b) => a.gatePosition - b.gatePosition);

  // Compute current normalised distance per horse from checkpoints
  const startMs = new Date(raceStartsAt).getTime();
  const elapsed = now > 0 ? (now - startMs) / 1000 : 0;
  const distances: Record<number, number> = {};

  if (checkpoints && checkpoints.length > 1) {
    const totalDist = Math.max(...checkpoints[checkpoints.length - 1].positions.map((p) => p.distance));
    // Find bracketing checkpoints
    let i = 0;
    while (i < checkpoints.length - 1 && checkpoints[i + 1].time <= elapsed) i++;
    const a = checkpoints[i];
    const b = checkpoints[Math.min(i + 1, checkpoints.length - 1)];
    const span = Math.max(0.001, b.time - a.time);
    const t = Math.min(1, Math.max(0, (elapsed - a.time) / span));
    for (const p of a.positions) {
      const bp = b.positions.find((x) => x.horseId === p.horseId);
      const d = bp ? p.distance + (bp.distance - p.distance) * t : p.distance;
      distances[p.horseId] = totalDist > 0 ? d / totalDist : 0;
    }
  }

  return (
    <div className="space-y-1.5 px-2 py-2">
      {sorted.map((e) => {
        const pct = Math.min(1, distances[e.horseId] ?? 0);
        return (
          <div key={e.id} className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-white/25 w-3 text-right tabular-nums">{e.gatePosition}</span>
            <div className="flex-1 h-3.5 bg-white/[0.025] rounded-full relative overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full rounded-full opacity-30"
                style={{ width: `${pct * 100}%`, backgroundColor: e.horse.color }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/70"
                style={{
                  left: `calc(${pct * 100}% - 5px)`,
                  backgroundColor: e.horse.color,
                  boxShadow: `0 0 8px ${e.horse.color}80`,
                  transition: "left 240ms linear",
                }}
              />
              {/* Finish line */}
              <div className="absolute top-0 right-0 h-full w-px bg-white/15" />
            </div>
            <span className="text-[10px] font-mono text-white/35 w-9 text-right tabular-nums">
              {e.currentOdds.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResultsList({ entries, winningHorseId }: { entries: Entry[]; winningHorseId: number | null }) {
  const sorted = [...entries]
    .filter((e) => e.finishPosition !== undefined)
    .sort((a, b) => (a.finishPosition ?? 99) - (b.finishPosition ?? 99));
  return (
    <div className="space-y-px">
      {sorted.slice(0, 8).map((e) => {
        const isWinner = e.horseId === winningHorseId;
        return (
          <div
            key={e.id}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md ${isWinner ? "bg-cyan/[0.04]" : ""}`}
          >
            <span className={`text-[10px] font-mono w-4 text-right tabular-nums ${isWinner ? "text-cyan" : "text-white/35"}`}>
              {e.finishPosition}
            </span>
            <div
              className="w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-mono font-bold text-white/95 shrink-0"
              style={{ backgroundColor: e.horse.color }}
            >
              {e.gatePosition}
            </div>
            <span className={`flex-1 text-[12px] truncate font-medium ${isWinner ? "text-white/95" : "text-white/55"}`}>
              {e.horse.name}
            </span>
            {isWinner && (
              <span className="font-mono text-[11px] text-cyan tabular-nums">
                {e.currentOdds.toFixed(2)}×
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#0B0B12]/60 backdrop-blur-md overflow-hidden min-h-[420px] flex items-center justify-center">
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/25 animate-pulse">
        loading the next race…
      </div>
    </div>
  );
}
