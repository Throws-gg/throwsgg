"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

interface Race {
  id: string;
  raceNumber: number;
  status: string;
  distance: number;
  ground: string;
  volume: number;
  payouts: number;
  profit: number;
  edge: number;
  betCount: number;
  winnerId: number | null;
  winnerName: string | null;
  winnerColor: string | null;
  createdAt: string;
  settledAt: string | null;
  isLoss: boolean;
  isBigLoss: boolean;
  isBigWin: boolean;
}

interface Summary {
  count: number;
  volume: number;
  profit: number;
  avgEdge: number;
}

function fmtUSD(v: number): string {
  const abs = Math.abs(v);
  const str = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(2)}`;
  return v < 0 ? "-" + str : str;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminRacesPage() {
  const userId = useUserStore((s) => s.userId);
  const [races, setRaces] = useState<Race[]>([]);
  const [summary, setSummary] = useState<Summary>({ count: 0, volume: 0, profit: 0, avgEdge: 0 });
  const [status, setStatus] = useState("settled");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status, limit: "100" });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/races/list?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setRaces(data.races || []);
      setSummary(data.summary || { count: 0, volume: 0, profit: 0, avgEdge: 0 });
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [status, userId]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
          module · 06
        </p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          race <span className="text-cyan-400">history</span>
        </h1>
        <p className="text-xs text-white/40 mt-1 font-mono">
          settled races · volume / profit / edge · outlier detection
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile label="races shown" value={String(summary.count)} />
        <SummaryTile label="total volume" value={fmtUSD(summary.volume)} accent="violet" />
        <SummaryTile
          label="total profit"
          value={fmtUSD(summary.profit)}
          accent={summary.profit >= 0 ? "green" : "red"}
          glow
        />
        <SummaryTile
          label="avg edge"
          value={`${summary.avgEdge.toFixed(2)}%`}
          accent={summary.avgEdge >= 3 ? "green" : "gold"}
        />
      </div>

      {/* Status filter */}
      <div className="flex gap-1 text-[10px] font-mono uppercase tracking-wider">
        {["settled", "racing", "betting", "closed", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "px-3 py-1.5 border transition-all rounded",
              status === s
                ? "border-violet/50 bg-violet/10 text-violet"
                : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/15"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <Loading />
      ) : races.length === 0 ? (
        <EmptyState message="no races match" />
      ) : (
        <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <Th>race #</Th>
                <Th>time</Th>
                <Th>distance</Th>
                <Th>ground</Th>
                <Th>winner</Th>
                <Th className="text-right">bets</Th>
                <Th className="text-right">volume</Th>
                <Th className="text-right">payouts</Th>
                <Th className="text-right">profit</Th>
                <Th className="text-right pr-4">edge</Th>
              </tr>
            </thead>
            <tbody>
              {races.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors",
                    r.isBigLoss && "bg-red/[0.03]",
                    r.isBigWin && "bg-green/[0.03]"
                  )}
                >
                  <Td>
                    <span className="font-mono font-bold text-white">
                      #{r.raceNumber.toLocaleString()}
                    </span>
                    {r.isBigLoss && (
                      <span className="ml-2 text-[8px] font-mono font-bold uppercase text-red">
                        outlier
                      </span>
                    )}
                    {r.isBigWin && (
                      <span className="ml-2 text-[8px] font-mono font-bold uppercase text-green">
                        heater
                      </span>
                    )}
                  </Td>
                  <Td className="text-[10px] font-mono text-white/40 whitespace-nowrap">
                    {r.settledAt ? fmtTime(r.settledAt) : fmtTime(r.createdAt)}
                  </Td>
                  <Td className="font-mono text-white/70">{r.distance}m</Td>
                  <Td className="font-mono text-white/70 capitalize">{r.ground}</Td>
                  <Td>
                    {r.winnerName ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: r.winnerColor || "#666" }}
                        />
                        <span className="text-white/80 font-bold">{r.winnerName}</span>
                      </div>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </Td>
                  <Td className="text-right font-mono text-white/60 tabular-nums">
                    {r.betCount}
                  </Td>
                  <Td className="text-right font-mono text-white font-bold tabular-nums">
                    {fmtUSD(r.volume)}
                  </Td>
                  <Td className="text-right font-mono text-white/50 tabular-nums">
                    {fmtUSD(r.payouts)}
                  </Td>
                  <Td
                    className={cn(
                      "text-right font-mono font-bold tabular-nums",
                      r.profit > 0 ? "text-green/80" : r.profit < 0 ? "text-red/80" : "text-white/40"
                    )}
                  >
                    {r.profit >= 0 ? "+" : ""}
                    {fmtUSD(r.profit)}
                  </Td>
                  <Td
                    className={cn(
                      "text-right pr-4 font-mono tabular-nums",
                      r.edge >= 3 ? "text-green/60" : r.edge > 0 ? "text-gold/60" : "text-red/60"
                    )}
                  >
                    {r.edge.toFixed(1)}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent = "white",
  glow,
}: {
  label: string;
  value: string;
  accent?: "white" | "violet" | "green" | "red" | "gold";
  glow?: boolean;
}) {
  const colors = {
    white: "text-white",
    violet: "text-violet",
    green: "text-green",
    red: "text-red",
    gold: "text-gold",
  };
  return (
    <div className="relative border border-white/[0.06] bg-[#0a0a12] p-4 overflow-hidden">
      {glow && (
        <div
          className={cn(
            "absolute top-0 right-0 w-20 h-20 blur-2xl pointer-events-none",
            accent === "green" && "bg-green/[0.08]",
            accent === "red" && "bg-red/[0.08]"
          )}
        />
      )}
      <p className="relative text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
        {label}
      </p>
      <p className={cn("relative text-2xl font-black font-mono tabular-nums leading-none", colors[accent])}>
        {value}
      </p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-left px-4 py-2.5 text-[9px] font-mono uppercase tracking-wider font-bold text-white/35",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}

function Loading() {
  return (
    <div className="rounded border border-white/[0.06] bg-[#0a0a12] py-16 text-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">loading</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-[#0a0a12] py-16 text-center">
      <p className="text-xs font-mono text-white/35">{message}</p>
    </div>
  );
}
