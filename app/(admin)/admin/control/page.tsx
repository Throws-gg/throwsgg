"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

interface Flags {
  races_paused?: { value: boolean; updatedAt: string };
  hot_wallet_balance?: { value: number; updatedAt: string };
  max_bet_override?: { value: number | null; updatedAt: string };
}

interface CurrentRace {
  id: string;
  race_number: number;
  status: string;
  betting_closes_at: string;
  settled_at: string | null;
}

export default function AdminControlPage() {
  const userId = useUserStore((s) => s.userId);
  const [flags, setFlags] = useState<Flags>({});
  const [currentRace, setCurrentRace] = useState<CurrentRace | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const url = userId ? `/api/admin/control?userId=${userId}` : "/api/admin/control";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setFlags(data.flags || {});
      setCurrentRace(data.currentRace || null);
    } catch (err) {
      console.error("fetch failed:", err);
    }
  }, [userId]);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 10_000);
    return () => clearInterval(id);
  }, [fetchState]);

  const act = async (action: string) => {
    if (!reason && action !== "force_tick") {
      setLastResult("reason required for pause/resume");
      return;
    }
    setSubmitting(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastResult(data.error || "failed");
      } else {
        setLastResult(`${action} ok`);
        setReason("");
        fetchState();
      }
    } catch {
      setLastResult("network error");
    }
    setSubmitting(false);
  };

  const racesPaused = flags.races_paused?.value === true;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
          module · 07
        </p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          engine <span className="text-red">control</span>
        </h1>
        <p className="text-xs text-white/40 mt-1 font-mono">
          pause races · force tick · incident response
        </p>
      </div>

      {/* Big status panel */}
      <div
        className={cn(
          "border p-6 rounded relative overflow-hidden",
          racesPaused ? "border-red/30 bg-red/[0.04]" : "border-green/20 bg-green/[0.03]"
        )}
      >
        <div
          className={cn(
            "absolute top-0 right-0 w-40 h-40 blur-3xl pointer-events-none",
            racesPaused ? "bg-red/[0.1]" : "bg-green/[0.08]"
          )}
        />

        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-2">
              engine state
            </p>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "w-3 h-3 rounded-full",
                  racesPaused ? "bg-red" : "bg-green animate-pulse"
                )}
              />
              <h2
                className={cn(
                  "text-4xl sm:text-5xl font-black tracking-tight",
                  racesPaused ? "text-red" : "text-green"
                )}
              >
                {racesPaused ? "paused" : "running"}
              </h2>
            </div>
            {currentRace && (
              <p className="text-[11px] font-mono text-white/40 mt-3">
                current race: #{currentRace.race_number} · {currentRace.status}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reason field */}
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
          reason for action (required for pause/resume · audit logged)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="why am I doing this..."
          className="w-full px-4 py-3 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
        />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ControlCard
          title="pause races"
          body="stops new races from being created. in-progress races settle normally. use for maintenance or incident response."
          buttonLabel={racesPaused ? "already paused" : "pause now"}
          variant="red"
          disabled={submitting || racesPaused}
          onClick={() => act("pause_races")}
        />
        <ControlCard
          title="resume races"
          body="re-enables race creation. next tick will spawn a new race if the current one has settled."
          buttonLabel={!racesPaused ? "already running" : "resume now"}
          variant="green"
          disabled={submitting || !racesPaused}
          onClick={() => act("resume_races")}
        />
        <ControlCard
          title="force tick"
          body="manually fires the race engine tick. use if a race is stuck or the cron job failed. safe to run repeatedly."
          buttonLabel="tick now"
          variant="violet"
          disabled={submitting}
          onClick={() => act("force_tick")}
        />
      </div>

      {lastResult && (
        <p
          className={cn(
            "text-xs font-mono",
            lastResult.includes("ok") ? "text-green" : "text-red"
          )}
        >
          {lastResult}
        </p>
      )}
    </div>
  );
}

function ControlCard({
  title,
  body,
  buttonLabel,
  variant,
  disabled,
  onClick,
}: {
  title: string;
  body: string;
  buttonLabel: string;
  variant: "red" | "green" | "violet";
  disabled: boolean;
  onClick: () => void;
}) {
  const colors = {
    red: {
      bg: "hover:bg-red/10",
      border: "hover:border-red/40",
      btn: "bg-red/10 border-red/30 text-red hover:bg-red/20",
    },
    green: {
      bg: "hover:bg-green/10",
      border: "hover:border-green/40",
      btn: "bg-green/10 border-green/30 text-green hover:bg-green/20",
    },
    violet: {
      bg: "hover:bg-violet/10",
      border: "hover:border-violet/40",
      btn: "bg-violet/10 border-violet/30 text-violet hover:bg-violet/20",
    },
  };
  return (
    <div
      className={cn(
        "border border-white/[0.06] bg-[#0a0a12] p-5 rounded transition-all",
        colors[variant].border
      )}
    >
      <h3 className="text-sm font-bold uppercase tracking-wider text-white mb-2">{title}</h3>
      <p className="text-xs text-white/50 leading-relaxed mb-4 font-mono">{body}</p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-2.5 border text-[10px] font-mono font-bold uppercase tracking-wider transition-all rounded disabled:opacity-30 disabled:cursor-not-allowed",
          colors[variant].btn
        )}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
