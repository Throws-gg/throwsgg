"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { HorseSprite } from "@/components/racing/HorseSprite";
import { getHorseIdentity } from "@/lib/racing/constants";
import { cn } from "@/lib/utils";

interface DistanceRecord {
  starts: number;
  wins: number;
  places?: number;
}
interface GroundRecord {
  starts: number;
  wins: number;
}
interface GateRecord {
  starts: number;
  wins: number;
}

interface HorseDetail {
  id: number;
  name: string;
  slug: string;
  color: string;
  speed: number;
  stamina: number;
  form: number;
  consistency: number;
  groundPreference: string;
  careerRaces: number;
  careerWins: number;
  careerPlaces: number;
  careerShows: number;
  winPct: number;
  itmPct: number;
  last5Results: number[];
  speedRating: number;
  avgFinish: number;
  daysSinceLastRace: number;
  distanceRecord: Record<string, DistanceRecord>;
  groundRecord: Record<string, GroundRecord>;
  gateRecord: Record<string, GateRecord>;
}

interface RecentRace {
  raceId: string;
  raceNumber: number;
  distance: number;
  ground: string;
  settledAt: string | null;
  gate: number;
  finish: number | null;
  openingOdds: number | null;
  closingOdds: number | null;
}

function finishColor(pos: number | null): string {
  if (pos === 1) return "bg-yellow-400/20 text-yellow-300 ring-yellow-400/40";
  if (pos === 2) return "bg-slate-300/15 text-slate-200 ring-slate-300/30";
  if (pos === 3) return "bg-orange-400/15 text-orange-300 ring-orange-400/30";
  return "bg-white/[0.03] text-white/40 ring-white/10";
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function HorseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [horse, setHorse] = useState<HorseDetail | null>(null);
  const [recent, setRecent] = useState<RecentRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const identity = getHorseIdentity(slug);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/horses/${slug}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          horse: HorseDetail;
          recentRaces: RecentRace[];
        };
        if (cancelled) return;
        setHorse(data.horse);
        setRecent(data.recentRaces);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white/60 text-sm">Horse not found.</p>
          <Link
            href="/horses"
            className="text-violet/90 hover:text-violet text-xs underline"
          >
            ← back to form guide
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !horse) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-background">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] h-48 animate-pulse" />
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] h-32 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Back link */}
        <Link
          href="/horses"
          className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70"
        >
          ← form guide
        </Link>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#14141f] to-[#0e0e16] p-6"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-violet/5 rounded-full blur-3xl -mr-10 -mt-10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan/5 rounded-full blur-3xl -ml-8 -mb-8" />
          <div className="relative flex items-center gap-5">
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-3">
              <HorseSprite slug={horse.slug} size={96} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">
                {horse.name}
              </h1>
              {identity.tagline && (
                <p className="text-sm text-white/50 mt-1">{identity.tagline}</p>
              )}
              <div className="flex items-center gap-3 mt-3 text-[11px]">
                <span className="px-2 py-1 rounded-md bg-violet/15 text-violet/90 font-mono">
                  Rating {horse.speedRating}
                </span>
                <span className="text-white/40">
                  Prefers <span className="text-white/70 capitalize">{horse.groundPreference}</span>
                </span>
                {horse.daysSinceLastRace > 0 && (
                  <span className="text-white/40">
                    Last out <span className="text-white/70">{horse.daysSinceLastRace}d ago</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Career stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BigStat label="Starts" value={horse.careerRaces.toString()} />
          <BigStat
            label="Win %"
            value={`${horse.winPct.toFixed(0)}%`}
            sub={`${horse.careerWins}W`}
            tone="violet"
          />
          <BigStat
            label="ITM %"
            value={`${horse.itmPct.toFixed(0)}%`}
            sub={`${horse.careerWins + horse.careerPlaces + horse.careerShows} placings`}
            tone="cyan"
          />
          <BigStat
            label="Avg Finish"
            value={horse.avgFinish.toFixed(2)}
          />
        </div>

        {/* Stat bars */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Profile
          </h2>
          <StatBar label="Speed" value={horse.speed} />
          <StatBar label="Stamina" value={horse.stamina} />
          <StatBar label="Form" value={horse.form} />
          <StatBar label="Consistency" value={horse.consistency} />
        </div>

        {/* Last 5 results pills */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
            Recent Form
          </h2>
          <div className="flex items-center gap-2">
            {horse.last5Results.length > 0 ? (
              horse.last5Results.slice(0, 5).map((pos, idx) => (
                <span
                  key={idx}
                  className={cn(
                    "w-9 h-9 rounded-lg text-sm font-bold flex items-center justify-center ring-1",
                    finishColor(pos),
                  )}
                >
                  {pos}
                </span>
              ))
            ) : (
              <span className="text-xs text-white/30">No completed races yet.</span>
            )}
          </div>
          <p className="text-[11px] text-white/35">
            Most recent finish on the left. Lower is better — 1 = win, 8 = last.
          </p>
        </div>

        {/* Distance / Ground / Gate breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RecordTable
            title="By Distance"
            data={Object.entries(horse.distanceRecord)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([k, v]) => ({
                label: `${k}m`,
                starts: v.starts,
                wins: v.wins,
              }))}
          />
          <RecordTable
            title="By Ground"
            data={Object.entries(horse.groundRecord).map(([k, v]) => ({
              label: k,
              starts: v.starts,
              wins: v.wins,
            }))}
            capitalize
          />
          <RecordTable
            title="By Gate"
            data={Object.entries(horse.gateRecord)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([k, v]) => ({
                label: `Gate ${k}`,
                starts: v.starts,
                wins: v.wins,
              }))}
          />
        </div>

        {/* Recent race history */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">
              Last {recent.length || 0} Races
            </h2>
            {recent.length === 0 && (
              <span className="text-[10px] text-white/30">no settled races</span>
            )}
          </div>
          {recent.length > 0 && (
            <div className="divide-y divide-white/[0.04]">
              {recent.map((r) => (
                <div
                  key={r.raceId}
                  className="px-5 py-3 flex items-center gap-3 text-[11px]"
                >
                  <span
                    className={cn(
                      "w-7 h-7 shrink-0 rounded-md font-bold text-xs flex items-center justify-center ring-1",
                      finishColor(r.finish),
                    )}
                  >
                    {r.finish ?? "—"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white/80 font-mono">
                      Race #{r.raceNumber}
                    </div>
                    <div className="text-white/35 text-[10px] mt-0.5">
                      {r.distance}m · <span className="capitalize">{r.ground}</span> · gate {r.gate}
                    </div>
                  </div>
                  <div className="text-right">
                    {r.openingOdds !== null && (
                      <div className="text-white/60 font-mono tabular-nums">
                        {r.openingOdds.toFixed(2)}×
                      </div>
                    )}
                    <div className="text-white/30 text-[10px]">
                      {formatRelativeDate(r.settledAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA back to racing */}
        <div className="pt-2 text-center">
          <Link
            href="/racing"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet to-magenta text-white text-sm font-semibold shadow-[0_0_20px_rgba(139,92,246,0.35)] hover:shadow-[0_0_28px_rgba(139,92,246,0.5)] transition-shadow"
          >
            Back to live racing →
          </Link>
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "violet" | "cyan";
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#12121a] p-4">
      <div className="text-[9px] uppercase tracking-widest text-white/35">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-bold font-mono tabular-nums mt-1",
          tone === "violet" && "text-violet/90",
          tone === "cyan" && "text-cyan/90",
          !tone && "text-white",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-white/35 mt-1 font-mono">{sub}</div>
      )}
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-white/60">{label}</span>
        <span className="text-white/80 font-mono tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet to-magenta"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RecordTable({
  title,
  data,
  capitalize,
}: {
  title: string;
  data: { label: string; starts: number; wins: number }[];
  capitalize?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">
        {title}
      </h3>
      {data.length === 0 ? (
        <p className="text-[11px] text-white/25">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {data.map((row) => {
            const winPct =
              row.starts > 0 ? Math.round((row.wins / row.starts) * 100) : 0;
            return (
              <div
                key={row.label}
                className="flex items-center justify-between text-[11px]"
              >
                <span
                  className={cn("text-white/60", capitalize && "capitalize")}
                >
                  {row.label}
                </span>
                <span className="text-white/80 font-mono tabular-nums">
                  {row.wins}/{row.starts}{" "}
                  <span className="text-white/30">({winPct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
