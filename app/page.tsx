"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { LiveWinsTicker } from "@/components/racing/LiveWinsTicker";
import { HeroRaceCard } from "@/components/racing/HeroRaceCard";
import { track } from "@/lib/analytics/posthog";

const IS_LIVE = process.env.NEXT_PUBLIC_IS_LIVE === "true";

// ============================================================
// Animated counter — counts up once when scrolled into view
// ============================================================

function AnimatedNumber({ value, duration = 1800, prefix = "", suffix = "" }: { value: number; duration?: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, value, duration]);

  return <span ref={ref} className="tabular-nums">{prefix}{display.toLocaleString()}{suffix}</span>;
}

// ============================================================
// Live status bar — race # · countdown · chat heads
// ============================================================

interface MiniRaceState {
  currentRace?: { raceNumber: number; bettingClosesAt: string; raceStartsAt: string };
  phase?: "betting" | "closed" | "racing" | "results";
  timeRemaining?: number;
}

const RACE_DURATION_SEC = 20;

function LiveStatusBar() {
  const [state, setState] = useState<MiniRaceState | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/race/state", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setState(d);
      } catch {}
    };
    load();
    const id = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  if (!state?.currentRace) return null;

  // Anchor on absolute deadlines so the timer can't tick up between polls.
  const race = state.currentRace;
  const phase = state.phase;
  const deadline =
    phase === "betting" ? new Date(race.bettingClosesAt).getTime() :
    phase === "racing" ? new Date(race.raceStartsAt).getTime() + RACE_DURATION_SEC * 1000 :
    new Date(race.raceStartsAt).getTime();
  const live = now > 0 ? Math.max(0, (deadline - now) / 1000) : (state.timeRemaining ?? 0);
  const phaseLabel =
    state.phase === "betting" ? "betting closes in" :
    state.phase === "closed" ? "gates loading" :
    state.phase === "racing" ? "racing" : "settling";
  const showCountdown = state.phase === "betting" || state.phase === "racing";
  const m = Math.floor(live / 60);
  const s = Math.floor(live) % 60;
  const t = state.phase === "racing" ? `${Math.ceil(live)}s` : `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <div className="border-b border-white/[0.04] bg-[#06060B]/70 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-9 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em]">
        <div className="flex items-center gap-3">
          <span className="text-white/30">Race #{state.currentRace.raceNumber.toLocaleString()}</span>
          <span className="text-white/15">·</span>
          <span className="text-white/45">{phaseLabel}{showCountdown && <span className="ml-1.5 text-white/70 tabular-nums">{t}</span>}</span>
        </div>
        <Link href="/verify" className="text-white/25 hover:text-cyan transition-colors hidden sm:inline">verify any race →</Link>
      </div>
    </div>
  );
}

// ============================================================
// Trust counter strip — populated from /api/stats/public
// ============================================================

interface PublicStats { totalWagered: number; racesSettled: number; biggestPayout30d: number }

function TrustStrip() {
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    fetch("/api/stats/public").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  // Pre-launch fallback — three confidence facts, no zero counters
  if (!IS_LIVE || !stats || stats.racesSettled < 50) {
    return (
      <section className="py-12 sm:py-16 px-4 border-y border-white/[0.04]">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.04] rounded-2xl overflow-hidden">
          {[
            { k: "Bankroll backing every race", v: "$10,000" },
            { k: "Max payout per horse, per race", v: "8% of bankroll" },
            { k: "Race fairness", v: "HMAC-SHA256" },
          ].map((f) => (
            <div key={f.k} className="bg-[#08080D] px-6 py-7 flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/30">{f.k}</span>
              <span className="font-display text-2xl sm:text-3xl text-white tracking-[-0.02em] font-semibold">{f.v}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 sm:py-16 px-4 border-y border-white/[0.04]">
      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.04] rounded-2xl overflow-hidden">
        <Stat label="Lifetime wagered" value={stats.totalWagered} prefix="$" />
        <Stat label="Races settled" value={stats.racesSettled} />
        <Stat label="Biggest payout, 30d" value={stats.biggestPayout30d} prefix="$" />
      </div>
    </section>
  );
}

function Stat({ label, value, prefix = "", suffix = "" }: { label: string; value: number; prefix?: string; suffix?: string }) {
  return (
    <div className="bg-[#08080D] px-6 py-7 flex flex-col gap-2">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/30">{label}</span>
      <span className="font-display text-3xl sm:text-4xl text-white tracking-[-0.02em] font-semibold">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
      </span>
    </div>
  );
}

// ============================================================
// Form guide rail — real horses from /api/horses
// ============================================================

interface FormHorse {
  id: number;
  name: string;
  slug: string;
  color: string;
  careerRaces: number;
  careerWins: number;
  winPct: number;
  itmPct: number;
  last5Results: number[];
}

function FormGuideRail() {
  const [horses, setHorses] = useState<FormHorse[]>([]);

  useEffect(() => {
    fetch("/api/horses").then((r) => r.json()).then((d) => setHorses(d.horses || [])).catch(() => {});
  }, []);

  if (!horses.length) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.05] bg-white/[0.01] h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {horses.slice(0, 8).map((h) => (
        <Link
          key={h.id}
          href={`/horse/${h.slug}`}
          className="group rounded-xl border border-white/[0.05] bg-white/[0.012] p-4 space-y-3 hover:border-white/[0.12] hover:bg-white/[0.025] transition-all"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-mono font-bold text-white/95 shrink-0"
              style={{ backgroundColor: h.color, boxShadow: `inset 0 -1px 2px rgba(0,0,0,0.3)` }}
            >
              {h.careerWins}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white/85 truncate">{h.name}</div>
              <div className="text-[9px] font-mono text-white/30 tabular-nums">
                {h.careerRaces} starts · {h.winPct.toFixed(0)}% win
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono text-white/25 uppercase tracking-wider mr-1">last 5</span>
            {h.last5Results.length === 0 ? (
              <span className="text-[9px] font-mono text-white/20">—</span>
            ) : (
              h.last5Results.slice(0, 5).map((pos, i) => (
                <span
                  key={i}
                  className={`text-[9px] font-mono w-4 h-4 rounded-sm flex items-center justify-center tabular-nums ${
                    pos === 1 ? "bg-cyan/20 text-cyan" :
                    pos <= 3 ? "bg-white/[0.06] text-white/70" :
                    "bg-white/[0.02] text-white/30"
                  }`}
                >
                  {pos}
                </span>
              ))
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ============================================================
// Recent results rail — pulled from /api/race/wins-feed
// ============================================================

interface RecentWin {
  id: string;
  horseName: string;
  horseSlug: string;
  lockedOdds: number;
  payout: number;
  raceNumber: number;
}

function RecentResultsRail() {
  const [wins, setWins] = useState<RecentWin[] | null>(null);

  useEffect(() => {
    fetch("/api/race/wins-feed?limit=5").then((r) => r.json()).then((d) => setWins(d.wins ?? [])).catch(() => setWins([]));
  }, []);

  if (wins === null) {
    return (
      <div className="space-y-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-white/[0.012] border border-white/[0.04] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (wins.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.012] px-6 py-10 text-center">
        <p className="text-[12px] text-white/40">First settled wins will land here once we&rsquo;re live. Until then, you can watch a race tick down up top.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.012] overflow-hidden divide-y divide-white/[0.04]">
      {wins.map((w) => (
        <div key={w.id} className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider tabular-nums">#{w.raceNumber.toLocaleString()}</span>
            <span className="text-sm text-white/85 truncate">{w.horseName}</span>
            <span className="text-[10px] font-mono text-white/30 tabular-nums hidden sm:inline">{w.lockedOdds.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="font-mono text-sm text-white/90 tabular-nums">${w.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <Link href={`/verify?race=${w.raceNumber}`} className="text-[10px] font-mono uppercase tracking-wider text-white/35 hover:text-cyan transition-colors">
              verify →
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main landing page
// ============================================================

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bonusSpots, setBonusSpots] = useState<{ spotsLeft: number; enabled: boolean; amount: number } | null>(null);

  useEffect(() => {
    if (!IS_LIVE) return;
    fetch("/api/bonus/status").then((r) => r.json()).then(setBonusSpots).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      track("waitlist_signup", { source: "landing", already_subscribed: !!data.alreadySubscribed });
    } catch {
      setError("Network error. Try again?");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {IS_LIVE && <LiveWinsTicker />}
      <LiveStatusBar />

      {/* ============================================
          HERO
          ============================================ */}
      <section className="relative px-4 pt-12 sm:pt-20 pb-20 sm:pb-28">
        {/* Hairline grid + radial — replaces the three blur orbs */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 60% 80% at 50% 30%, #000, transparent)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[640px] pointer-events-none opacity-60"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 30% 0%, rgba(139,92,246,0.10), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 10%, rgba(236,72,153,0.07), transparent 60%)",
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">

            {/* LEFT — copy stack (cols 1–6) */}
            <div className="lg:col-span-6 space-y-7 text-center lg:text-left">

              {/* Logo */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <Image src="/logo-horse.png" alt="throws.gg" width={280} height={70} className="h-9 sm:h-10 w-auto mx-auto lg:mx-0" priority />
              </motion.div>

              {/* Status chip */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="flex justify-center lg:justify-start"
              >
                {IS_LIVE && bonusSpots?.enabled && bonusSpots.spotsLeft > 0 ? (
                  <div className="inline-flex items-center gap-2 bg-gold/[0.07] border border-gold/25 rounded-full px-3 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-gold">
                      ${bonusSpots.amount} signup bonus · {bonusSpots.spotsLeft} spots left
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-full px-3 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/65">
                      {IS_LIVE ? "live now" : "engine running · gates open soon"}
                    </span>
                  </div>
                )}
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="font-display text-[44px] sm:text-[58px] lg:text-[72px] leading-[0.95] tracking-[-0.035em] text-white font-semibold"
              >
                A new race every<br />
                three minutes.<br />
                <span className="text-cyan">Provably fair.</span>
              </motion.h1>

              {/* Deck */}
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="text-[15px] text-white/55 max-w-[460px] mx-auto lg:mx-0 leading-relaxed"
              >
                Virtual horse racing on Solana. USDC in, USDC out.
                Sixteen horses, eight per race, fixed odds. Don&rsquo;t trust us — verify the seed.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                {IS_LIVE ? (
                  <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0">
                    <Link
                      href="/racing"
                      className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-[#08080D] font-semibold text-sm tracking-tight
                                 hover:bg-white/90 active:scale-[0.98] transition-all shadow-[0_8px_30px_-8px_rgba(255,255,255,0.4)]"
                    >
                      Watch the next race
                      <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </Link>
                    <Link
                      href="/verify"
                      className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-white/[0.1] text-white/70 text-sm
                                 hover:border-white/25 hover:text-white transition-colors"
                    >
                      Verify a race
                    </Link>
                  </div>
                ) : !submitted ? (
                  <form onSubmit={handleSubmit} className="max-w-md mx-auto lg:mx-0 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white text-sm
                                   placeholder:text-white/25 focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition-all"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-3.5 rounded-xl bg-white text-[#08080D] font-semibold text-sm
                                   hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        {submitting ? "…" : "Get the invite"}
                      </button>
                    </div>
                    {error ? (
                      <p className="text-[11px] text-red">{error}</p>
                    ) : (
                      <p className="text-[11px] text-white/30">First through the gates. Zero spam, ever.</p>
                    )}
                  </form>
                ) : (
                  <div className="max-w-md mx-auto lg:mx-0 rounded-xl border border-green/20 bg-green/[0.04] px-5 py-4 space-y-1">
                    <p className="text-green text-sm font-semibold">You&rsquo;re on the list.</p>
                    <p className="text-[12px] text-white/40">We&rsquo;ll write the moment the gates open.</p>
                  </div>
                )}

                {IS_LIVE && (
                  <p className="text-[11px] text-white/25 max-w-md mx-auto lg:mx-0">
                    Watch a full race in 3 minutes. No signup, no wallet, no email. Bet when you&rsquo;re ready.
                  </p>
                )}
              </motion.div>
            </div>

            {/* RIGHT — live race card (cols 7–12) */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-6 w-full max-w-[440px] mx-auto"
            >
              <HeroRaceCard />
            </motion.div>

          </div>
        </div>

        {/* Horizon shimmer at the hero base */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent overflow-hidden">
          <div
            className="absolute inset-y-0 w-1/3 animate-horizon-shimmer"
            style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.5), transparent)" }}
          />
        </div>
      </section>

      {/* ============================================
          TRUST STRIP
          ============================================ */}
      <TrustStrip />

      {/* ============================================
          HOW A RACE RUNS — timeline
          ============================================ */}
      <section className="py-20 sm:py-28 px-4">
        <div className="max-w-5xl mx-auto space-y-14">
          <div className="text-center max-w-xl mx-auto space-y-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">The cycle</span>
            <h2 className="font-display text-3xl sm:text-5xl text-white tracking-[-0.03em] font-semibold leading-[1.05]">
              How a race runs.
            </h2>
            <p className="text-[14px] text-white/55 leading-relaxed">
              Three minutes, end-to-end. Bet, watch, settle, repeat. 480× a day, 24/7.
            </p>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Spine */}
            <div className="hidden sm:block absolute top-[27px] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px">
              {[
                { phase: "betting", label: "Bet", duration: "90s", desc: "Read the form, lock your odds.", color: "#34D399" },
                { phase: "closed",  label: "Gates",   duration: "15s", desc: "Field loaded. Last call.", color: "#F59E0B" },
                { phase: "racing",  label: "Race",    duration: "20s", desc: "Eight horses. One finish line.", color: "#EC4899" },
                { phase: "settle",  label: "Settle",  duration: "15s", desc: "Winners paid. Seed revealed.", color: "#06B6D4" },
              ].map((p, i) => (
                <motion.div
                  key={p.phase}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  className="relative px-3 sm:px-5 py-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full border border-white/20 flex items-center justify-center bg-[#08080D]" style={{ borderColor: p.color }}>
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: p.color }} />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/40">{p.duration}</span>
                  </div>
                  <h3 className="font-display text-2xl text-white tracking-[-0.02em] mb-1.5 font-semibold">{p.label}</h3>
                  <p className="text-[12px] text-white/55 leading-snug">{p.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          THE FIELD — form-guide rail
          ============================================ */}
      <section className="py-20 sm:py-28 px-4 relative">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="space-y-2 max-w-xl">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">The roster</span>
              <h2 className="font-display text-3xl sm:text-5xl text-white tracking-[-0.03em] font-semibold leading-[1.05]">
                Sixteen horses. Eight per race.
              </h2>
              <p className="text-[14px] text-white/55 leading-relaxed">
                Real form. Real records. Learn them or get cooked.
              </p>
            </div>
            <Link href="/horses" className="text-[12px] font-mono uppercase tracking-[0.16em] text-white/45 hover:text-white transition-colors">
              full form guide →
            </Link>
          </div>

          <FormGuideRail />
        </div>
      </section>

      {/* ============================================
          RECENT RESULTS — verifiable rail
          ============================================ */}
      <section className="py-20 sm:py-24 px-4">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Recent payouts</span>
              <h2 className="font-display text-3xl sm:text-4xl text-white tracking-[-0.03em] font-semibold leading-[1.05]">
                Don&rsquo;t trust us. Verify the seed.
              </h2>
            </div>
            <Link href="/verify" className="text-[12px] font-mono uppercase tracking-[0.16em] text-white/45 hover:text-white transition-colors">
              how it works →
            </Link>
          </div>
          <RecentResultsRail />
        </div>
      </section>

      {/* ============================================
          WHY — 4 cards
          ============================================ */}
      <section className="py-20 sm:py-28 px-4 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center max-w-xl mx-auto space-y-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">What you get</span>
            <h2 className="font-display text-3xl sm:text-5xl text-white tracking-[-0.03em] font-semibold leading-[1.05]">
              Built different.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                title: "Provably fair",
                desc: "Seed committed before the race, revealed after. Recompute the outcome yourself. Trust nobody.",
                tag: "HMAC-SHA256",
              },
              {
                title: "Fixed odds",
                desc: "Odds lock the moment you click. No parimutuel rug, no last-second drift, no mystery payout.",
                tag: "no slippage",
              },
              {
                title: "Solana-native",
                desc: "USDC + SOL. Withdrawals in seconds, not days. We’re the house, but we’re not your bank.",
                tag: "solana",
              },
              {
                title: "Wallet-native",
                desc: "Connect a Solana wallet and you’re in. No accounts, no email required, no friction between you and the next race.",
                tag: "self-custody flow",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="relative rounded-xl border border-white/[0.06] bg-white/[0.012] p-6 sm:p-7 space-y-2.5 hover:border-white/[0.12] hover:bg-white/[0.02] transition-all"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl text-white tracking-[-0.02em] font-semibold">
                    {item.title}
                  </h3>
                  <span className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/40">{item.tag}</span>
                </div>
                <p className="text-[13px] text-white/55 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================
          FINAL CTA
          ============================================ */}
      <section className="py-24 sm:py-32 px-4 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139,92,246,0.5), transparent 60%)",
          }}
        />
        <div className="relative z-10 max-w-2xl mx-auto text-center space-y-8">
          <h2 className="font-display text-4xl sm:text-6xl text-white tracking-[-0.035em] font-semibold leading-[1.02]">
            {IS_LIVE ? (
              <>Next race in<br /><span className="text-cyan">under three minutes.</span></>
            ) : (
              <>Engine&rsquo;s running.<br /><span className="text-cyan">Gates open soon.</span></>
            )}
          </h2>

          <p className="text-[14px] text-white/55">
            {IS_LIVE
              ? "Watch one before you bet. No signup needed."
              : "Real engine. Real races. Just not open to the public yet."}
          </p>

          {IS_LIVE ? (
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto justify-center">
              <Link
                href="/racing"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-[#08080D] font-semibold text-sm
                           hover:bg-white/90 active:scale-[0.98] transition-all"
              >
                Watch the next race
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            </div>
          ) : !submitted ? (
            <form onSubmit={handleSubmit} className="max-w-md mx-auto flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white text-sm
                           placeholder:text-white/25 focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition-all"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3.5 rounded-xl bg-white text-[#08080D] font-semibold text-sm
                           hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {submitting ? "…" : "Get the invite"}
              </button>
            </form>
          ) : (
            <div className="max-w-md mx-auto rounded-xl border border-green/20 bg-green/[0.04] px-5 py-4">
              <p className="text-green text-sm font-semibold">You&rsquo;re in. See you at post time.</p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 pt-6">
            <a
              href="https://x.com/throwsgg"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-white/30 hover:text-white/70 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @throwsgg
            </a>
          </div>
        </div>
      </section>

      {/* ============================================
          FOOTER
          ============================================ */}
      <footer className="border-t border-white/[0.04] px-4 py-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6 text-[11px]">
            <FooterCol title="Race">
              <FooterLink href="/racing">Live racing</FooterLink>
              <FooterLink href="/horses">Form guide</FooterLink>
              <FooterLink href="/leaderboard">Leaderboard</FooterLink>
              <FooterLink href="/verify">Verify a race</FooterLink>
            </FooterCol>
            <FooterCol title="Account">
              <FooterLink href="/wallet">Wallet</FooterLink>
              <FooterLink href="/affiliates">Affiliates</FooterLink>
              <a
                href="https://x.com/throwsgg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/35 hover:text-white/85 transition-colors"
              >X / twitter</a>
            </FooterCol>
            <FooterCol title="Legal">
              <FooterLink href="/terms">Terms</FooterLink>
              <FooterLink href="/privacy">Privacy</FooterLink>
              <FooterLink href="/responsible-gambling">Responsible gambling</FooterLink>
            </FooterCol>
            <FooterCol title="Built">
              <span className="text-white/25">Solo, with care.</span>
              <span className="text-white/25 font-mono">v 1.0</span>
            </FooterCol>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.04]">
            <Image src="/logo-horse.png" alt="throws.gg" width={80} height={20} className="h-4 w-auto opacity-25" />
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/20">&copy; 2026 throws.gg</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-white/35 hover:text-white/85 transition-colors">
      {children}
    </Link>
  );
}
