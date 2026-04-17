"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { HorseSprite } from "@/components/racing/HorseSprite";
import type { RaceEntry } from "@/lib/racing/constants";
import { cn } from "@/lib/utils";

interface PodiumResultsProps {
  entries: RaceEntry[];
  raceId: string;
  raceNumber: number;
}

type Placement = {
  entry: RaceEntry;
  rank: 1 | 2 | 3;
};

// ————————————————————————————————————————————
// Seeded RNG (Mulberry32) — stable per race id
// ————————————————————————————————————————————
function seedFromString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollFakePot(raceId: string): { amount: number; users: number } {
  const rng = mulberry32(seedFromString(raceId));
  const amount = 313.57 + rng() * (1688.71 - 313.57);
  const users = Math.floor(8 + rng() * (84 - 8 + 1));
  return { amount: Math.round(amount * 100) / 100, users };
}

// ————————————————————————————————————————————
// Main component
// ————————————————————————————————————————————
export function PodiumResults({ entries, raceId, raceNumber }: PodiumResultsProps) {
  const podium = useMemo<Placement[]>(() => {
    const sorted = [...entries].sort(
      (a, b) => (a.finishPosition || 99) - (b.finishPosition || 99)
    );
    const top3: Placement[] = [];
    if (sorted[0]) top3.push({ entry: sorted[0], rank: 1 });
    if (sorted[1]) top3.push({ entry: sorted[1], rank: 2 });
    if (sorted[2]) top3.push({ entry: sorted[2], rank: 3 });
    return top3;
  }, [entries]);

  const pot = useMemo(() => rollFakePot(raceId), [raceId]);

  const first = podium.find((p) => p.rank === 1);
  const second = podium.find((p) => p.rank === 2);
  const third = podium.find((p) => p.rank === 3);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.06]",
        "bg-gradient-to-b from-[#12101c] via-[#0d0c16] to-[#0a0910]"
      )}
    >
      {/* Ambient conic gold halo behind the winner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-20 h-[320px] opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 45% 60% at 50% 35%, rgba(245,158,11,0.18), rgba(245,158,11,0.04) 40%, transparent 70%)",
        }}
      />
      {/* Violet→magenta wash at base */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 100%, rgba(139,92,246,0.14), rgba(236,72,153,0.06) 50%, transparent 80%)",
        }}
      />
      {/* Grain overlay for texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />
      {/* Rising particles (gold embers) from the top position */}
      <Embers />

      {/* Header strip — "official result" */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <LaurelMark />
          <span
            className="text-[10px] tracking-[0.32em] text-gold/80 font-semibold uppercase"
            style={{ fontFamily: "'Cormorant Garamond', 'EB Garamond', 'Playfair Display', ui-serif, Georgia, serif" }}
          >
            Official Result
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/30 tabular-nums">
          R#{raceNumber.toString().padStart(4, "0")}
        </span>
      </div>

      {/* Podium stage */}
      <div className="relative z-10 px-4 pt-8 pb-6 xl:pt-10 xl:pb-8">
        <div className="mx-auto w-full max-w-[640px]">
          <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
            {/* 2nd — left, shorter */}
            <div className="pt-10 sm:pt-14">
              {second && <PodiumCard placement={second} />}
            </div>

            {/* 1st — center, elevated */}
            <div className="-mb-1">
              {first && <PodiumCard placement={first} />}
            </div>

            {/* 3rd — right, shortest */}
            <div className="pt-14 sm:pt-20">
              {third && <PodiumCard placement={third} />}
            </div>
          </div>

          {/* Marble plinth bar */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="relative mt-3 h-[3px] origin-center rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(245,158,11,0.35) 20%, rgba(245,158,11,0.9) 50%, rgba(245,158,11,0.35) 80%, transparent)",
            }}
          />
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
        </div>
      </div>

      {/* TOTAL WON THIS RACE pot banner */}
      <div className="relative z-10 border-t border-white/[0.04] px-4 py-4 xl:py-5">
        <PotBanner amount={pot.amount} users={pot.users} />
      </div>
    </section>
  );
}

// ————————————————————————————————————————————
// Podium card — one per placement
// ————————————————————————————————————————————
function PodiumCard({ placement }: { placement: Placement }) {
  const { entry, rank } = placement;
  const isFirst = rank === 1;
  const isSecond = rank === 2;

  // Sprite size (mobile / desktop)
  const sizeMobile = isFirst ? 96 : 68;
  const sizeDesktop = isFirst ? 120 : 84;

  const ringColor = isFirst ? "#F59E0B" : isSecond ? "#D7DEE8" : "#CD7F32";
  const ringGlow = isFirst
    ? "0 0 0 1px rgba(245,158,11,0.55), 0 0 40px rgba(245,158,11,0.35), inset 0 0 20px rgba(245,158,11,0.12)"
    : isSecond
    ? "0 0 0 1px rgba(215,222,232,0.45), 0 0 24px rgba(215,222,232,0.18)"
    : "0 0 0 1px rgba(205,127,50,0.45), 0 0 24px rgba(205,127,50,0.22)";

  const delay = isFirst ? 0.25 : isSecond ? 0.1 : 0.05;

  return (
    <motion.div
      initial={{ y: 24, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 22,
        delay,
      }}
      className="relative flex flex-col items-center"
    >
      {/* Crown / laurel above 1st */}
      {isFirst && (
        <motion.div
          initial={{ y: 6, opacity: 0, rotate: -4 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ delay: delay + 0.2, duration: 0.5, ease: "easeOut" }}
          className="mb-1.5"
        >
          <Crown />
        </motion.div>
      )}

      {/* Roman placement numeral */}
      <div
        className={cn(
          "mb-2 leading-none tracking-tight",
          isFirst ? "text-[32px] sm:text-[40px]" : "text-[20px] sm:text-[24px]"
        )}
        style={{
          fontFamily:
            "'Cormorant Garamond', 'EB Garamond', 'Playfair Display', ui-serif, Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          color: ringColor,
          textShadow: isFirst
            ? "0 0 24px rgba(245,158,11,0.45), 0 0 2px rgba(245,158,11,0.8)"
            : isSecond
            ? "0 0 18px rgba(215,222,232,0.25)"
            : "0 0 18px rgba(205,127,50,0.3)",
        }}
      >
        {rank === 1 ? "I" : rank === 2 ? "II" : "III"}
      </div>

      {/* Sprite disc with metallic ring */}
      <div className="relative">
        {/* Conic shimmer ring (only 1st) */}
        {isFirst && (
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 14, ease: "linear" }}
            className="absolute -inset-2 rounded-full opacity-70"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(245,158,11,0) 0deg, rgba(245,158,11,0.55) 60deg, rgba(255,220,130,0.9) 110deg, rgba(245,158,11,0.55) 160deg, rgba(245,158,11,0) 220deg, rgba(245,158,11,0) 360deg)",
              filter: "blur(6px)",
            }}
          />
        )}

        <div
          className="relative rounded-full p-1"
          style={{
            background: isFirst
              ? "linear-gradient(135deg, #F59E0B, #FCD34D 40%, #F59E0B 60%, #92400E)"
              : isSecond
              ? "linear-gradient(135deg, #E5E7EB, #F8FAFC 40%, #CBD5E1 60%, #64748B)"
              : "linear-gradient(135deg, #B45309, #D97706 40%, #92400E 60%, #451A03)",
            boxShadow: ringGlow,
          }}
        >
          <div
            className="rounded-full bg-[#0b0a12] flex items-center justify-center"
            style={{
              padding: isFirst ? 8 : 6,
            }}
          >
            {/* Mobile */}
            <div className="sm:hidden">
              <HorseSprite slug={entry.horse.slug} size={sizeMobile} />
            </div>
            {/* Desktop */}
            <div className="hidden sm:block">
              <HorseSprite slug={entry.horse.slug} size={sizeDesktop} />
            </div>
          </div>
        </div>

        {/* Gate number chip pinned to ring */}
        <div
          className={cn(
            "absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-1/2",
            "px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tabular-nums",
            "bg-[#0b0a12] border shadow-lg"
          )}
          style={{
            color: entry.horse.color,
            borderColor: `${entry.horse.color}55`,
          }}
        >
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: entry.horse.color,
                boxShadow: `0 0 8px ${entry.horse.color}`,
              }}
            />
            Gate {entry.gatePosition}
          </span>
        </div>
      </div>

      {/* Name */}
      <div
        className={cn(
          "mt-5 text-center",
          isFirst ? "max-w-[180px]" : "max-w-[140px]"
        )}
      >
        <h3
          className={cn(
            "leading-tight truncate",
            isFirst
              ? "text-[15px] sm:text-lg font-bold text-white"
              : "text-xs sm:text-sm font-semibold text-white/80"
          )}
          style={{
            letterSpacing: isFirst ? "-0.01em" : "0",
          }}
          title={entry.horse.name}
        >
          {entry.horse.name}
        </h3>

        {/* Odds row */}
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1.5 font-mono tabular-nums",
            isFirst ? "text-[11px]" : "text-[10px]"
          )}
        >
          <span className="text-white/30 uppercase tracking-[0.14em] text-[9px]">
            {isFirst ? "Paid" : "Odds"}
          </span>
          <span
            className={cn(
              "font-bold",
              isFirst ? "text-gold" : "text-white/55"
            )}
          >
            {entry.currentOdds.toFixed(2)}×
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ————————————————————————————————————————————
// Pot banner: "$AMOUNT won by N users"
// ————————————————————————————————————————————
function PotBanner({ amount, users }: { amount: number; users: number }) {
  const [whole, cents] = amount.toFixed(2).split(".");
  const wholeWithCommas = Number(whole).toLocaleString("en-US");

  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-xl",
        "border border-gold/20",
        "bg-gradient-to-r from-gold/[0.04] via-gold/[0.08] to-gold/[0.04]"
      )}
    >
      {/* Sheen sweep — one pass on reveal, no loop */}
      <motion.div
        aria-hidden
        initial={{ x: "-120%" }}
        animate={{ x: "220%" }}
        transition={{
          duration: 1.6,
          ease: "easeInOut",
          delay: 0.9,
        }}
        className="pointer-events-none absolute inset-y-0 w-1/3"
        style={{
          background:
            "linear-gradient(100deg, transparent, rgba(255,220,130,0.22) 40%, rgba(255,220,130,0.4) 50%, rgba(255,220,130,0.22) 60%, transparent)",
          mixBlendMode: "screen",
        }}
      />

      <div className="relative px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-4">
        {/* Left: label */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            aria-hidden
            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg border border-gold/30 bg-gold/[0.06]"
          >
            <CoinStack />
          </div>
          <div className="min-w-0">
            <p
              className="text-[9px] sm:text-[10px] tracking-[0.32em] text-gold/70 font-bold uppercase leading-none"
              style={{
                fontFamily:
                  "'Cormorant Garamond', 'EB Garamond', ui-serif, Georgia, serif",
                letterSpacing: "0.34em",
              }}
            >
              Total Won This Race
            </p>
            <p className="mt-1.5 text-[10px] text-white/40">
              across{" "}
              <span className="font-bold font-mono tabular-nums text-white/70">
                {users}
              </span>{" "}
              winning {users === 1 ? "ticket" : "tickets"}
            </p>
          </div>
        </div>

        {/* Right: the big number */}
        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-0.5 leading-none">
            <span className="text-gold/60 text-base sm:text-lg font-mono font-bold">$</span>
            <motion.span
              key={amount}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.55 }}
              className="font-mono tabular-nums font-black text-transparent bg-clip-text text-3xl sm:text-[34px]"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, #FDE68A 0%, #F59E0B 50%, #B45309 100%)",
                textShadow: "0 0 30px rgba(245,158,11,0.25)",
              }}
            >
              {wholeWithCommas}
            </motion.span>
            <span className="text-gold/60 text-base sm:text-lg font-mono font-bold tabular-nums">
              .{cents}
            </span>
          </div>
          <p className="text-[9px] uppercase tracking-[0.24em] text-white/30 mt-1 font-semibold">
            USDC
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ————————————————————————————————————————————
// Decorative SVG marks
// ————————————————————————————————————————————
function LaurelMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="text-gold/70"
      aria-hidden
    >
      <path
        d="M12 3 L13.2 8.4 L18.6 9.6 L14.4 13.2 L15.6 18.6 L12 15.6 L8.4 18.6 L9.6 13.2 L5.4 9.6 L10.8 8.4 Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function Crown() {
  return (
    <svg
      width="40"
      height="22"
      viewBox="0 0 40 22"
      fill="none"
      aria-hidden
      className="drop-shadow-[0_0_12px_rgba(245,158,11,0.55)]"
    >
      <defs>
        <linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>
      </defs>
      <path
        d="M4 18 L6 6 L13 12 L20 3 L27 12 L34 6 L36 18 Z"
        fill="url(#crownGrad)"
        stroke="#FCD34D"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <rect x="4" y="18" width="32" height="2.4" rx="0.8" fill="#F59E0B" />
      <circle cx="13" cy="12" r="1.4" fill="#0b0a12" />
      <circle cx="20" cy="4.5" r="1.5" fill="#0b0a12" />
      <circle cx="27" cy="12" r="1.4" fill="#0b0a12" />
    </svg>
  );
}

function CoinStack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="7" rx="7" ry="2.5" fill="#F59E0B" opacity="0.9" />
      <path
        d="M5 7 V11 C5 12.38 8.13 13.5 12 13.5 C15.87 13.5 19 12.38 19 11 V7"
        fill="#B45309"
      />
      <ellipse cx="12" cy="11" rx="7" ry="2.5" fill="#F59E0B" />
      <path
        d="M5 11 V15 C5 16.38 8.13 17.5 12 17.5 C15.87 17.5 19 16.38 19 15 V11"
        fill="#92400E"
      />
      <ellipse cx="12" cy="15" rx="7" ry="2.5" fill="#FCD34D" />
    </svg>
  );
}

// ————————————————————————————————————————————
// Rising gold embers (lightweight CSS-only particles)
// ————————————————————————————————————————————
function Embers() {
  // A single burst of upward-drifting embers, timed to the reveal moment.
  // No looping, no horizontal wiggle — one lift, one fade, done.
  const particles = [
    { left: "22%", delay: 0.2, dur: 2.2, size: 2 },
    { left: "34%", delay: 0.4, dur: 2.4, size: 3 },
    { left: "47%", delay: 0.1, dur: 2.0, size: 2 },
    { left: "52%", delay: 0.55, dur: 2.6, size: 4 },
    { left: "61%", delay: 0.3, dur: 2.3, size: 2 },
    { left: "72%", delay: 0.5, dur: 2.5, size: 3 },
    { left: "81%", delay: 0.15, dur: 2.1, size: 2 },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          initial={{ y: "110%", opacity: 0 }}
          animate={{
            y: "-20%",
            opacity: [0, 0.9, 0.4, 0],
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            ease: "easeOut",
          }}
          className="absolute rounded-full"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background:
              "radial-gradient(circle, rgba(255,220,130,0.9) 0%, rgba(245,158,11,0.4) 50%, rgba(245,158,11,0) 100%)",
            filter: "blur(0.5px)",
          }}
        />
      ))}
    </div>
  );
}
