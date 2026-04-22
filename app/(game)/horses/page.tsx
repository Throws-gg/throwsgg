"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { HorseSprite } from "@/components/racing/HorseSprite";
import { getHorseIdentity } from "@/lib/racing/constants";
import { cn } from "@/lib/utils";

interface Horse {
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
}

type SortKey = "speed_rating" | "win_pct" | "itm_pct" | "form" | "name";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "speed_rating", label: "Speed Rating" },
  { key: "win_pct", label: "Win %" },
  { key: "itm_pct", label: "ITM %" },
  { key: "form", label: "Form" },
  { key: "name", label: "Name (A–Z)" },
];

function finishColor(pos: number): string {
  if (pos === 1) return "bg-yellow-400/20 text-yellow-300 ring-yellow-400/40";
  if (pos === 2) return "bg-slate-300/15 text-slate-200 ring-slate-300/30";
  if (pos === 3) return "bg-orange-400/15 text-orange-300 ring-orange-400/30";
  return "bg-white/[0.03] text-white/40 ring-white/10";
}

export default function HorsesPage() {
  const [horses, setHorses] = useState<Horse[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("speed_rating");
  const [groundFilter, setGroundFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/horses");
        if (!res.ok) return;
        const data = (await res.json()) as { horses: Horse[] };
        if (!cancelled) setHorses(data.horses);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const f =
      groundFilter === "all"
        ? horses
        : horses.filter((h) => h.groundPreference === groundFilter);
    const sorted = [...f].sort((a, b) => {
      switch (sort) {
        case "speed_rating":
          return b.speedRating - a.speedRating;
        case "win_pct":
          return b.winPct - a.winPct;
        case "itm_pct":
          return b.itmPct - a.itmPct;
        case "form":
          return b.form - a.form;
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [horses, sort, groundFilter]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Form Guide</h1>
          <p className="text-xs text-white/40 mt-1">
            16 persistent horses. Career stats, recent form, and tier
            distribution. Tap a horse to see full history.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                  sort === opt.key
                    ? "bg-white/[0.08] text-white"
                    : "text-white/40 hover:text-white/60",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
            {(["all", "firm", "good", "soft", "heavy"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroundFilter(g)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all",
                  groundFilter === g
                    ? "bg-white/[0.08] text-white"
                    : "text-white/40 hover:text-white/60",
                )}
              >
                {g === "all" ? "All ground" : g}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/[0.04] bg-white/[0.02] h-40 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((h, i) => (
              <HorseCard key={h.slug} horse={h} delay={i * 0.02} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-white/40 text-sm">
            No horses match this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function HorseCard({ horse, delay }: { horse: Horse; delay: number }) {
  const identity = getHorseIdentity(horse.slug);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
    >
      <Link
        href={`/horse/${horse.slug}`}
        className="block rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#14141f] to-[#0e0e16] p-4 hover:border-violet/30 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-4">
          {/* Sprite */}
          <div className="shrink-0 rounded-xl bg-white/[0.02] border border-white/[0.04] p-2">
            <HorseSprite slug={horse.slug} size={64} />
          </div>

          {/* Right side */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">
                  {horse.name}
                </h3>
                {identity.tagline && (
                  <p className="text-[11px] text-white/40 truncate mt-0.5">
                    {identity.tagline}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-violet/90 tabular-nums">
                  {horse.speedRating}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-white/30">
                  rating
                </div>
              </div>
            </div>

            {/* Last 5 results */}
            <div className="flex items-center gap-1 mt-3">
              <span className="text-[9px] uppercase tracking-wider text-white/30 mr-1">
                last 5
              </span>
              {horse.last5Results.length > 0 ? (
                horse.last5Results.slice(0, 5).map((pos, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      "w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ring-1",
                      finishColor(pos),
                    )}
                  >
                    {pos}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-white/25">no races yet</span>
              )}
            </div>

            {/* Stat row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04] text-[10px]">
              <Stat label="W%" value={`${horse.winPct.toFixed(0)}%`} />
              <Stat label="ITM%" value={`${horse.itmPct.toFixed(0)}%`} />
              <Stat label="Races" value={horse.careerRaces.toString()} />
              <Stat label="Form" value={horse.form.toString()} />
              <Stat
                label="Ground"
                value={horse.groundPreference}
                className="capitalize"
              />
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="text-center">
      <div className={cn("text-white/80 font-mono tabular-nums", className)}>
        {value}
      </div>
      <div className="text-white/30 uppercase tracking-wider text-[9px] mt-0.5">
        {label}
      </div>
    </div>
  );
}
