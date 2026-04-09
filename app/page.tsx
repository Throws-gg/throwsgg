"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import Image from "next/image";
import { LiveWinsTicker } from "@/components/game/LiveWinsTicker";

// ======= ANIMATED COUNTER =======

function AnimatedNumber({ value, duration = 2000 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, value, duration]);

  return <span ref={ref}>{display.toLocaleString()}</span>;
}

// ======= LIVE ODDS TICKER =======

const TICKER_HORSES = [
  { name: "Thunder Edge", odds: 3.16, color: "#8B5CF6", change: -0.12 },
  { name: "Moon Shot", odds: 8.40, color: "#FBBF24", change: +0.35 },
  { name: "Iron Phantom", odds: 4.20, color: "#64748B", change: -0.08 },
  { name: "Rug Pull", odds: 12.80, color: "#EC4899", change: +1.20 },
  { name: "Dead Cat", odds: 22.00, color: "#06B6D4", change: +3.50 },
  { name: "Paper Hands", odds: 6.50, color: "#F59E0B", change: -0.30 },
  { name: "Night Fury", odds: 5.80, color: "#EF4444", change: +0.15 },
  { name: "Crown Jewel", odds: 3.90, color: "#22C55E", change: -0.22 },
];

function OddsTicker() {
  return (
    <div className="relative overflow-hidden w-full">
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 bg-gradient-to-l from-background to-transparent" />
      <div className="flex gap-4 sm:gap-6 animate-[scroll_25s_linear_infinite]">
        {[...TICKER_HORSES, ...TICKER_HORSES].map((h, i) => (
          <div key={i} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ backgroundColor: h.color }} />
            <span className="text-[10px] sm:text-[11px] text-white/40 font-medium whitespace-nowrap">{h.name}</span>
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-white/60">{h.odds.toFixed(2)}</span>
            <span className={`text-[9px] sm:text-[10px] font-mono font-bold ${h.change > 0 ? "text-green/60" : "text-red/50"}`}>
              {h.change > 0 ? "+" : ""}{h.change.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======= SIMULATED LIVE RACE =======

function LiveRacePreview() {
  const [positions, setPositions] = useState([0.1, 0.08, 0.12, 0.06, 0.09, 0.07, 0.11, 0.05]);
  const [winner, setWinner] = useState<number | null>(null);

  const horses = [
    { gate: 1, name: "Moon Shot", color: "#FBBF24", odds: "3.16" },
    { gate: 2, name: "Thunder Edge", color: "#8B5CF6", odds: "4.20" },
    { gate: 3, name: "Rug Pull", color: "#EC4899", odds: "6.50" },
    { gate: 4, name: "Dead Cat", color: "#64748B", odds: "12.80" },
    { gate: 5, name: "Iron Phantom", color: "#06B6D4", odds: "5.80" },
    { gate: 6, name: "Paper Hands", color: "#F59E0B", odds: "8.40" },
    { gate: 7, name: "Night Fury", color: "#EF4444", odds: "3.90" },
    { gate: 8, name: "Crown Jewel", color: "#22C55E", odds: "22.00" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setPositions(prev => {
        const next = prev.map((p) => {
          const speed = 0.003 + Math.random() * 0.008;
          return Math.min(p + speed, 1);
        });
        // Check for winner
        const finisher = next.findIndex(p => p >= 1);
        if (finisher !== -1 && winner === null) {
          setWinner(finisher);
          // Reset after 3 seconds
          setTimeout(() => {
            setWinner(null);
            setPositions([0.1, 0.08, 0.12, 0.06, 0.09, 0.07, 0.11, 0.05]);
          }, 3000);
        }
        return next;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [winner]);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
          <span className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Race #1,247</span>
        </div>
        <span className="text-[10px] text-white/25">1600m &middot; Good</span>
      </div>

      {/* Race lanes */}
      <div className="px-4 py-3 space-y-1.5">
        {horses.map((h, i) => (
          <div key={h.gate} className="flex items-center gap-2.5">
            <span className="text-[9px] font-mono text-white/20 w-3 text-right">{h.gate}</span>
            <div className="flex-1 h-4 bg-white/[0.02] rounded-full relative overflow-hidden">
              <motion.div
                className="absolute top-0 left-0 h-full rounded-full"
                style={{ backgroundColor: h.color, opacity: winner === i ? 1 : 0.7 }}
                animate={{ width: `${positions[i] * 100}%` }}
                transition={{ duration: 0.05, ease: "linear" }}
              />
              {/* Horse dot */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white/80"
                style={{ backgroundColor: h.color, boxShadow: `0 0 8px ${h.color}60` }}
                animate={{ left: `calc(${positions[i] * 100}% - 6px)` }}
                transition={{ duration: 0.05, ease: "linear" }}
              />
            </div>
            <span className="text-[10px] font-mono text-white/30 w-8 text-right">{h.odds}</span>
          </div>
        ))}
      </div>

      {/* Winner announcement */}
      {winner !== null && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 py-2.5 border-t border-green/10 bg-green/[0.03]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                style={{ backgroundColor: horses[winner].color }}>
                {horses[winner].gate}
              </div>
              <span className="text-xs font-bold text-green">{horses[winner].name} WINS</span>
            </div>
            <span className="text-xs font-mono text-green/60">{horses[winner].odds}x</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ======= MAIN PAGE =======

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);

    // TODO: Connect to email list (Loops, Resend, or Supabase table)
    await new Promise(r => setTimeout(r, 800));

    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <LiveWinsTicker />

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[100vh] flex flex-col items-center justify-center px-4 py-12 sm:py-20">
        {/* Ambient glow */}
        <div className="absolute top-[10%] left-[15%] w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-violet/8 rounded-full blur-[150px] sm:blur-[200px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[250px] sm:w-[500px] h-[250px] sm:h-[500px] bg-magenta/6 rounded-full blur-[120px] sm:blur-[180px]" />
        <div className="absolute top-[40%] right-[30%] w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] bg-cyan/4 rounded-full blur-[100px] sm:blur-[150px]" />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto w-full">
          <div className="flex flex-col lg:flex-row items-center gap-8 sm:gap-12 lg:gap-16">

            {/* Left — copy */}
            <div className="flex-1 text-center lg:text-left space-y-6">
              {/* Logo */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Image
                  src="/logo-horse.png"
                  alt="throws.gg"
                  width={280}
                  height={70}
                  className="h-10 sm:h-12 w-auto mx-auto lg:mx-0"
                  priority
                />
              </motion.div>

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="flex justify-center lg:justify-start"
              >
                <div className="inline-flex items-center gap-2 bg-green/[0.06] border border-green/20 rounded-full px-3.5 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                  <span className="text-[10px] text-green/80 font-semibold tracking-wide uppercase">Launching Soon</span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="space-y-2"
              >
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95]">
                  <span className="text-white">They race.</span>
                  <br />
                  <span className="text-white">You bet.</span>
                  <br />
                  <span className="bg-gradient-to-r from-violet via-magenta to-cyan bg-clip-text text-transparent">
                    You profit.
                  </span>
                </h1>
              </motion.div>

              {/* Subline */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-sm sm:text-base text-white/30 max-w-md mx-auto lg:mx-0 leading-relaxed"
              >
                16 AI horses with unique stats, form, and personalities.
                New race every 3 minutes. Fixed odds. Provably fair. Crypto-native.
              </motion.p>

              {/* CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                {!submitted ? (
                  <form onSubmit={handleSubmit} className="max-w-sm mx-auto lg:mx-0 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        required
                        className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                                   placeholder:text-white/20 focus:outline-none focus:border-violet/40 focus:ring-1 focus:ring-violet/20
                                   transition-all"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-violet to-magenta text-white font-bold text-sm
                                   hover:opacity-90 active:scale-[0.98] transition-all
                                   shadow-[0_4px_25px_rgba(139,92,246,0.3),0_0_60px_rgba(139,92,246,0.1)]
                                   disabled:opacity-50"
                      >
                        {submitting ? "..." : "Get early access"}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/15">
                      Be first through the gates. No spam.
                    </p>
                  </form>
                ) : (
                  <div className="max-w-sm mx-auto lg:mx-0 rounded-xl border border-green/20 bg-green/[0.04] px-6 py-4 space-y-1">
                    <p className="text-green text-sm font-bold">You&apos;re on the list</p>
                    <p className="text-[11px] text-white/30">We&apos;ll notify you when the gates open.</p>
                  </div>
                )}
              </motion.div>
            </div>

            {/* Right — live race preview */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="w-full max-w-[340px] sm:max-w-sm lg:max-w-[380px] shrink-0 mx-auto lg:mx-0"
            >
              <LiveRacePreview />
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="w-5 h-8 rounded-full border border-white/10 flex items-start justify-center p-1"
          >
            <div className="w-1 h-2 rounded-full bg-white/20" />
          </motion.div>
        </motion.div>
      </section>

      {/* ===== ODDS TICKER ===== */}
      <div className="border-y border-white/[0.04] py-3 bg-white/[0.01]">
        <OddsTicker />
      </div>

      {/* ===== STATS BAR ===== */}
      <section className="py-10 sm:py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
            {[
              { value: 16, label: "AI Horses", suffix: "" },
              { value: 480, label: "Races / Day", suffix: "" },
              { value: 3, label: "Min per Race", suffix: "" },
              { value: 0, label: "KYC Required", suffix: "" },
            ].map((stat) => (
              <div key={stat.label} className="text-center space-y-1">
                <div className="text-3xl sm:text-4xl font-black text-white/90 tabular-nums">
                  <AnimatedNumber value={stat.value} />{stat.suffix}
                </div>
                <div className="text-[11px] text-white/25 uppercase tracking-wider font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-20 px-4 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-violet/4 rounded-full blur-[150px]" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Dead simple.
            </h2>
            <p className="text-sm text-white/25 max-w-md mx-auto">
              No accounts. No downloads. No waiting. Connect wallet, pick a horse, get paid.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Study the form",
                desc: "16 horses with real stats, career records, and evolving form. Every race changes the meta.",
                accent: "#8B5CF6",
              },
              {
                step: "02",
                title: "Place your bet",
                desc: "Fixed odds locked at bet time. You see exactly what you'll win before the gates open.",
                accent: "#EC4899",
              },
              {
                step: "03",
                title: "Watch & collect",
                desc: "Live 2D race in 20 seconds. Winners paid instantly. All outcomes provably fair.",
                accent: "#06B6D4",
              },
            ].map((item) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 space-y-3 group hover:border-white/[0.1] transition-colors"
              >
                <div className="text-xs font-mono font-bold" style={{ color: item.accent }}>
                  {item.step}
                </div>
                <h3 className="text-lg font-bold text-white/90">{item.title}</h3>
                <p className="text-[13px] text-white/30 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== MEET THE HORSES ===== */}
      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute bottom-0 right-[20%] w-[500px] h-[500px] bg-magenta/4 rounded-full blur-[180px]" />

        <div className="relative z-10 max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Meet the field.
            </h2>
            <p className="text-sm text-white/25 max-w-md mx-auto">
              Every horse has a personality, a track record, and an opinion about the ground. Learn them or lose money.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { name: "Thunder Edge", tagline: "Pure voltage", color: "#8B5CF6", speed: 88, stamina: 72 },
              { name: "Moon Shot", tagline: "100x or bust", color: "#FBBF24", speed: 62, stamina: 85 },
              { name: "Rug Pull", tagline: "Trust issues", color: "#EC4899", speed: 78, stamina: 55 },
              { name: "Dead Cat", tagline: "Still here", color: "#64748B", speed: 70, stamina: 90 },
              { name: "Night Fury", tagline: "All gas", color: "#EF4444", speed: 95, stamina: 45 },
              { name: "Paper Hands", tagline: "Safe play", color: "#F59E0B", speed: 65, stamina: 75 },
              { name: "Iron Phantom", tagline: "Invisible threat", color: "#06B6D4", speed: 82, stamina: 68 },
              { name: "Crown Jewel", tagline: "Born for it", color: "#22C55E", speed: 75, stamina: 80 },
            ].map((h) => (
              <motion.div
                key={h.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 space-y-2.5 group hover:border-white/[0.1] transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: h.color, boxShadow: `0 0 12px ${h.color}30` }} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white/80 truncate">{h.name}</div>
                    <div className="text-[9px] text-white/25 italic">{h.tagline}</div>
                  </div>
                </div>
                {/* Mini stat bars */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-white/30 w-5">SPD</span>
                    <div className="flex-1 bg-white/[0.04] rounded-full h-1">
                      <div className="h-full rounded-full bg-cyan/60" style={{ width: `${h.speed}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-white/30 w-5">STA</span>
                    <div className="flex-1 bg-white/[0.04] rounded-full h-1">
                      <div className="h-full rounded-full bg-green/60" style={{ width: `${h.stamina}%` }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF / WHY ===== */}
      <section className="py-20 px-4 border-t border-white/[0.03]">
        <div className="max-w-3xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Built different.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                title: "Provably fair",
                desc: "Every race uses HMAC-SHA256 with server/client seeds. Verify any result, anytime. We can't cheat even if we wanted to.",
                icon: "shield",
              },
              {
                title: "Fixed odds",
                desc: "No parimutuel. Your odds lock at bet time. What you see is what you get. No last-second rug.",
                icon: "lock",
              },
              {
                title: "Crypto-native",
                desc: "USDC, SOL, ETH. Deposit in seconds, withdraw in seconds. No bank. No wait. No permission.",
                icon: "zap",
              },
              {
                title: "No KYC",
                desc: "Connect wallet. Bet. That's it. We don't need your passport to let you pick a horse.",
                icon: "user",
              },
              {
                title: "Evolving meta",
                desc: "Horse form changes after every race. Stats shift. Favourites fall. Longshots emerge. The meta is never solved.",
                icon: "trending",
              },
              {
                title: "480 races a day",
                desc: "New race every 3 minutes. 24/7. No off-season. No waiting. Always a race about to start.",
                icon: "clock",
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-5 space-y-2"
              >
                <h3 className="text-sm font-bold text-white/80">{item.title}</h3>
                <p className="text-[12px] text-white/25 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-24 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-violet/[0.03] to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet/6 rounded-full blur-[200px]" />

        <div className="relative z-10 max-w-lg mx-auto text-center space-y-8">
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-[1.05]">
            The gates open soon.
            <br />
            <span className="bg-gradient-to-r from-violet via-magenta to-cyan bg-clip-text text-transparent">
              Don&apos;t miss post time.
            </span>
          </h2>

          <p className="text-sm text-white/25">
            Early access gets you first dibs on the starting line.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm
                             placeholder:text-white/20 focus:outline-none focus:border-violet/40 focus:ring-1 focus:ring-violet/20
                             transition-all"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-violet to-magenta text-white font-bold text-sm
                             hover:opacity-90 active:scale-[0.98] transition-all
                             shadow-[0_4px_25px_rgba(139,92,246,0.3),0_0_60px_rgba(139,92,246,0.1)]
                             disabled:opacity-50"
                >
                  {submitting ? "..." : "Get early access"}
                </button>
              </div>
            </form>
          ) : (
            <div className="max-w-sm mx-auto rounded-xl border border-green/20 bg-green/[0.04] px-6 py-4">
              <p className="text-green text-sm font-bold">You&apos;re locked in.</p>
            </div>
          )}

          {/* X / Twitter link */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <a
              href="https://x.com/throwsgg"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[11px] text-white/25 hover:text-white/50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @throwsgg
            </a>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-white/[0.03] px-4 py-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Image src="/logo-horse.png" alt="throws.gg" width={80} height={20} className="h-4 w-auto opacity-15" />
          <span className="text-[10px] text-white/10">&copy; 2026 throws.gg</span>
        </div>
      </footer>
    </div>
  );
}
