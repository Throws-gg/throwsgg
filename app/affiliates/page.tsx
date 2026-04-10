"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ======= STYLES =======

const FORM_INPUT = "w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 focus:bg-white/[0.05] transition-all";

// ======= CHANNEL OPTIONS =======

const CHANNELS = [
  { id: "telegram", label: "telegram", sub: "group admin / channel" },
  { id: "discord", label: "discord", sub: "server owner / mod / partner" },
  { id: "kick", label: "kick", sub: "streamer" },
  { id: "youtube", label: "youtube", sub: "own channel" },
  { id: "newsletter", label: "newsletter", sub: "substack / beehiiv" },
  { id: "x", label: "X / twitter", sub: "grey area, organic only", warning: true },
  { id: "other", label: "other", sub: "tell us below" },
] as const;

const CHAINS = ["solana", "base", "arbitrum", "ethereum"] as const;

// ======= MAIN PAGE =======

export default function AffiliatesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo-horse.png"
              alt="throws.gg"
              width={130}
              height={32}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <Link
            href="#apply"
            className="text-[11px] sm:text-xs font-bold uppercase tracking-wider px-3 sm:px-4 py-1.5 rounded-lg bg-violet text-white hover:bg-violet/90 transition-all"
          >
            apply →
          </Link>
        </div>
      </header>

      {/* ======= HERO ======= */}
      <Hero />

      {/* ======= HOW IT WORKS ======= */}
      <HowItWorks />

      {/* ======= WHAT YOU EARN ======= */}
      <WhatYouEarn />

      {/* ======= WHY DIFFERENT ======= */}
      <WhyDifferent />

      {/* ======= WHO THIS IS FOR ======= */}
      <WhoThisIsFor />

      {/* ======= CHANNEL CALLOUT ======= */}
      <ChannelCallout />

      {/* ======= APPLY FORM ======= */}
      <ApplyForm />

      {/* ======= FAQ ======= */}
      <FAQ />

      {/* ======= FOOTER ======= */}
      <footer className="border-t border-white/[0.04] py-10 text-center">
        <p className="text-[11px] text-white/30">
          throws.gg — they race. you bet. your followers profit. you get paid.
        </p>
      </footer>
    </div>
  );
}

// ======= HERO =======

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet/10 rounded-full blur-[120px] -mr-40 -mt-40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-magenta/[0.07] rounded-full blur-[100px] -ml-40 -mb-40 pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 py-20 sm:py-28 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 bg-violet/10 border border-violet/30 rounded-full px-4 py-1.5 mb-6"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-violet animate-pulse" />
          <span className="text-[11px] text-violet font-bold tracking-wider uppercase">
            affiliate program — now open
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05] mb-5"
        >
          they race.<br />
          you bet.<br />
          <span className="bg-gradient-to-r from-violet to-magenta bg-clip-text text-transparent">
            your followers profit.
          </span><br />
          you get paid.
        </motion.h1>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-10"
        >
          throws.gg pays up to <span className="text-white font-bold">45% lifetime rev share</span> on every degen you send our way. weekly payouts in usdc. no caps. no games. no expiry.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            href="#apply"
            className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet text-white font-bold text-sm uppercase tracking-wider hover:bg-violet/90 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)]"
          >
            apply to partner
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </Link>
          <Link
            href="#how-it-works"
            className="text-xs text-white/50 hover:text-white/80 uppercase tracking-wider font-bold"
          >
            see how it works
          </Link>
        </motion.div>

        {/* Stat bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-center"
        >
          <div>
            <div className="text-2xl sm:text-3xl font-black text-gold">45%</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold">top tier</div>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div>
            <div className="text-2xl sm:text-3xl font-black text-white">weekly</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold">payouts</div>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div>
            <div className="text-2xl sm:text-3xl font-black text-green">lifetime</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold">attribution</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ======= HOW IT WORKS =======

function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "apply in 60 seconds",
      body: "drop your handle, audience, and a usdc wallet. we review same-day.",
    },
    {
      num: "02",
      title: "get your link",
      body: "throws.gg/r/[yourcode]. share it anywhere your people hang out.",
    },
    {
      num: "03",
      title: "get paid every monday",
      body: "we calculate sunday night, send usdc monday morning. rinse and repeat forever.",
    },
  ];

  return (
    <section id="how-it-works" className="border-t border-white/[0.04] py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-3">
            how it works
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            3 steps. no pdf kits.<br />no onboarding calls.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#0f0f18] p-6 relative overflow-hidden"
            >
              <div className="absolute top-4 right-5 text-6xl font-black text-white/[0.04]">
                {s.num}
              </div>
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-violet/15 border border-violet/30 flex items-center justify-center mb-4">
                  <span className="text-xs font-black text-violet">{s.num}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ======= WHAT YOU EARN =======

function WhatYouEarn() {
  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gold/[0.02] to-transparent pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-[11px] text-gold/60 uppercase tracking-widest font-bold mb-3">
            what you earn
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            up to <span className="text-gold">45%</span> of net house revenue.<br />
            lifetime. forever.
          </h2>
          <p className="text-base text-white/50 max-w-2xl mx-auto mt-6">
            when your refs lose, we win. when we win, you get a cut. forever. not just their first deposit, not just their first week — <span className="text-white">forever.</span>
          </p>
        </div>

        {/* Tier table */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0f0f18] overflow-hidden mb-10">
          <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
            <div className="p-6 text-center">
              <div className="text-[10px] text-white/35 uppercase tracking-widest font-bold mb-2">tier 1 · rookie</div>
              <div className="text-4xl sm:text-5xl font-black text-white mb-1">35%</div>
              <div className="text-[11px] text-white/40">$0 – $25k NGR</div>
            </div>
            <div className="p-6 text-center bg-violet/[0.04]">
              <div className="text-[10px] text-violet/80 uppercase tracking-widest font-bold mb-2">tier 2 · trainer</div>
              <div className="text-4xl sm:text-5xl font-black text-violet mb-1">40%</div>
              <div className="text-[11px] text-white/40">$25k – $100k NGR</div>
            </div>
            <div className="p-6 text-center bg-gold/[0.05]">
              <div className="text-[10px] text-gold/80 uppercase tracking-widest font-bold mb-2">tier 3 · owner</div>
              <div className="text-4xl sm:text-5xl font-black text-gold mb-1">45%</div>
              <div className="text-[11px] text-white/40">$100k+ NGR</div>
            </div>
          </div>
        </div>

        {/* Quick math */}
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#14141f] to-[#0f0f18] p-6 sm:p-8 max-w-2xl mx-auto">
          <p className="text-[10px] text-white/35 uppercase tracking-widest font-bold mb-4">
            quick math
          </p>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-white/50">you send</span>
              <span className="text-white font-bold">20 active refs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">avg ngr per ref / mo</span>
              <span className="text-white font-bold">~$100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">monthly pool</span>
              <span className="text-white font-bold">$2,000</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-white/[0.06]">
              <span className="text-white/50">your cut @ 40%</span>
              <span className="text-gold font-bold text-lg">$800 / mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50">12 months</span>
              <span className="text-gold font-bold text-lg">$9,600</span>
            </div>
          </div>
          <p className="text-[11px] text-white/35 mt-4 italic text-center">
            no caps. no diminishing rate. no expiry.
          </p>
        </div>
      </div>
    </section>
  );
}

// ======= WHY DIFFERENT =======

function WhyDifferent() {
  const items = [
    {
      title: "lifetime, not 30 days",
      body: "most programs cut you off after 30/60/90 days. we don't. once a degen is yours, they're yours forever.",
    },
    {
      title: "weekly, not monthly",
      body: "every monday. in usdc. on the chain you pick (sol, base, arb, eth). $50 minimum, rolls if you don't hit.",
    },
    {
      title: "no asterisks",
      body: "not an intro rate that drops after month one. not 'up to' with hidden caps. flat tier rate on NGR, period.",
    },
    {
      title: "you never owe us",
      body: "if your whales beat us for the week, that deficit clears after 90 days no matter what. you never go negative.",
    },
    {
      title: "provably fair",
      body: "we publish HMAC-SHA256 seeds for every race. you're not sending people to a rug — you're sending them to math they can verify.",
    },
    {
      title: "solo dev, real person",
      body: "you're dealing with the founder directly. not a support ticket queue. dm → reply → done.",
    },
  ];

  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-3">
            why throws.gg is different
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            built different.<br />for real this time.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#0f0f18] p-6"
            >
              <h3 className="text-base font-bold mb-2 text-white">{item.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ======= WHO THIS IS FOR =======

function WhoThisIsFor() {
  const roles = [
    "telegram group admins",
    "discord mods on crypto servers",
    "kick streamers in the gambling category",
    "youtubers doing crypto casino reviews",
    "CT accounts with 2k+ followers (organic only)",
    "meme page operators with multi-channel reach",
    "newsletter writers covering crypto / betting",
    "anyone with a real audience that would bet $10 on a 3-minute race",
  ];

  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-3">
            who this is for
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            if you have a real audience,<br />we want to pay you.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {roles.map((role, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-violet shrink-0" />
              <span className="text-sm text-white/70">{role}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-red/[0.15] bg-red/[0.03] px-5 py-4">
          <p className="text-xs text-white/50 leading-relaxed">
            <span className="text-red font-bold">not for:</span> bot farms, comment-spam rings, "i have a list of 50k emails" cold sellers. we will find out and we will kick you out.
          </p>
        </div>
      </div>
    </section>
  );
}

// ======= CHANNEL CALLOUT =======

function ChannelCallout() {
  const primary = [
    { name: "telegram", note: "degen-native, no policy issue, highest CTR" },
    { name: "discord", note: "crypto casino review servers, partner roles" },
    { name: "kick", note: "stream overlays + chat drops, zero restrictions" },
    { name: "youtube (own channel)", note: "no paid-promo rules on your own channel" },
    { name: "personal newsletter", note: "nobody can yank your email list" },
  ];

  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-3">
            best places to promote
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            where to post.<br />where to be careful.
          </h2>
        </div>

        {/* X policy warning */}
        <div className="rounded-2xl border border-gold/20 bg-gold/[0.03] p-5 sm:p-6 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-black text-gold">!</span>
            </div>
            <div>
              <p className="text-sm font-bold text-gold mb-2">heads up on X (twitter)</p>
              <p className="text-xs text-white/60 leading-relaxed">
                in feb 2026, X banned all "paid partnerships" for gambling — that includes affiliate links. enforcement is patchy, but posts can get nuked and accounts can get actioned. <span className="text-white">we still pay you for every ref that clicks before a takedown</span> — we just can't protect your X account from X itself.
              </p>
            </div>
          </div>
        </div>

        {/* Primary channels */}
        <div className="rounded-2xl border border-green/15 bg-green/[0.02] p-5 sm:p-6">
          <p className="text-[11px] text-green uppercase tracking-widest font-bold mb-4">
            primary channels — go here first
          </p>
          <div className="space-y-2">
            {primary.map((p) => (
              <div key={p.name} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green shrink-0 mt-2" />
                <div>
                  <span className="text-sm font-bold text-white">{p.name}</span>
                  <span className="text-sm text-white/50"> — {p.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          post on TG/Discord/Kick/YT for primary distribution. treat X as bonus reach.
        </p>
      </div>
    </section>
  );
}

// ======= APPLY FORM =======

function ApplyForm() {
  const [form, setForm] = useState({
    handle: "",
    xHandle: "",
    email: "",
    audienceSize: "",
    primaryChannels: [] as string[],
    secondaryChannels: "",
    contentLink: "",
    notes: "",
    payoutWallet: "",
    payoutChain: "solana" as typeof CHAINS[number],
    attestJurisdiction: false,
    attestXPolicy: false,
    attestTerms: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const toggleChannel = (id: string) => {
    setForm((f) => ({
      ...f,
      primaryChannels: f.primaryChannels.includes(id)
        ? f.primaryChannels.filter((c) => c !== id)
        : [...f.primaryChannels, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/affiliates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, message: data.error || "something broke. try again." });
      } else {
        setResult({ success: true, message: "submitted. we review within 24h. check your email." });
      }
    } catch {
      setResult({ success: false, message: "network error. try again." });
    }

    setSubmitting(false);
  };

  const canSubmit =
    form.handle.trim() &&
    form.email.trim() &&
    form.audienceSize.trim() &&
    form.payoutWallet.trim() &&
    form.primaryChannels.length > 0 &&
    form.attestJurisdiction &&
    form.attestXPolicy &&
    form.attestTerms &&
    !submitting;

  return (
    <section id="apply" className="border-t border-white/[0.04] py-20 sm:py-24">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-3">
            apply to partner
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            60 seconds. same-day review.
          </h2>
        </div>

        {result?.success ? (
          <div className="rounded-2xl border border-green/30 bg-green/[0.05] p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green/15 border border-green/40 flex items-center justify-center mx-auto mb-4">
              <span className="text-green font-black text-xl">✓</span>
            </div>
            <h3 className="text-xl font-bold mb-2">you're in the queue.</h3>
            <p className="text-sm text-white/60">{result.message}</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/[0.08] bg-[#0f0f18] p-6 sm:p-8 space-y-5"
          >
            {/* Handle */}
            <FormField label="handle / username *" hint="your main identity wherever you post">
              <input
                type="text"
                required
                maxLength={64}
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                placeholder="@moondegen"
                className={FORM_INPUT}
              />
            </FormField>

            {/* X handle (optional) */}
            <FormField label="X handle" hint="optional — only if you actually post there">
              <input
                type="text"
                maxLength={64}
                value={form.xHandle}
                onChange={(e) => setForm({ ...form, xHandle: e.target.value })}
                placeholder="@moondegen"
                className={FORM_INPUT}
              />
            </FormField>

            {/* Email */}
            <FormField label="email *" hint="for the terms + weekly earnings dm">
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className={FORM_INPUT}
              />
            </FormField>

            {/* Audience size */}
            <FormField label="audience size *" hint="follower count, sub count, group size — be honest, we check">
              <input
                type="text"
                required
                value={form.audienceSize}
                onChange={(e) => setForm({ ...form, audienceSize: e.target.value })}
                placeholder="~5k, 12,000, etc."
                className={FORM_INPUT}
              />
            </FormField>

            {/* Primary channels */}
            <div>
              <label className="block text-[11px] text-white/50 uppercase tracking-wider font-bold mb-2">
                primary channels *
              </label>
              <p className="text-[11px] text-white/35 mb-3">check all that apply, in order of where most of your traffic will come from</p>
              <div className="space-y-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChannel(c.id)}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                      form.primaryChannels.includes(c.id)
                        ? "border-violet/50 bg-violet/[0.08]"
                        : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center",
                        form.primaryChannels.includes(c.id)
                          ? "border-violet bg-violet"
                          : "border-white/20"
                      )}
                    >
                      {form.primaryChannels.includes(c.id) && (
                        <span className="text-white text-[10px] font-black">✓</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">{c.label}</div>
                      <div
                        className={cn(
                          "text-[11px]",
                          "warning" in c && c.warning ? "text-gold/80" : "text-white/40"
                        )}
                      >
                        {c.sub}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Secondary channels */}
            <FormField label="secondary channels" hint="we weight multi-channel applicants heavier">
              <input
                type="text"
                value={form.secondaryChannels}
                onChange={(e) => setForm({ ...form, secondaryChannels: e.target.value })}
                placeholder="if primary goes down, where else can you post?"
                className={FORM_INPUT}
              />
            </FormField>

            {/* Content link */}
            <FormField label="vibe check link" hint="drop your strongest recent post / video / clip">
              <input
                type="url"
                value={form.contentLink}
                onChange={(e) => setForm({ ...form, contentLink: e.target.value })}
                placeholder="https://..."
                className={FORM_INPUT}
              />
            </FormField>

            {/* Wallet */}
            <FormField label="usdc payout wallet *" hint="the address we send your earnings to">
              <input
                type="text"
                required
                value={form.payoutWallet}
                onChange={(e) => setForm({ ...form, payoutWallet: e.target.value })}
                placeholder="wallet address"
                className={cn(FORM_INPUT, "font-mono text-xs")}
              />
            </FormField>

            {/* Chain */}
            <FormField label="payout chain *" hint="pick one based on gas">
              <div className="grid grid-cols-4 gap-2">
                {CHAINS.map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    onClick={() => setForm({ ...form, payoutChain: chain })}
                    className={cn(
                      "py-2.5 rounded-lg text-xs font-bold border transition-all",
                      form.payoutChain === chain
                        ? "border-violet bg-violet/15 text-white"
                        : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:text-white/80"
                    )}
                  >
                    {chain}
                  </button>
                ))}
              </div>
            </FormField>

            {/* Notes */}
            <FormField label="anything else?" hint="optional, 500 chars">
              <textarea
                maxLength={500}
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="context, previous affiliate experience, audience specifics..."
                className={cn(FORM_INPUT, "resize-none")}
              />
            </FormField>

            {/* Attestations */}
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <AttestRow
                checked={form.attestJurisdiction}
                onChange={(v) => setForm({ ...form, attestJurisdiction: v })}
                label="i am not in a restricted jurisdiction (US, UK, AU, FR, NL, full list in terms)"
              />
              <AttestRow
                checked={form.attestXPolicy}
                onChange={(v) => setForm({ ...form, attestXPolicy: v })}
                label="i understand X has a gambling policy that may action my posts and account, and throws.gg cannot protect me from that"
              />
              <AttestRow
                checked={form.attestTerms}
                onChange={(v) => setForm({ ...form, attestTerms: v })}
                label="i have read the affiliate terms and agree"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all",
                canSubmit
                  ? "bg-gradient-to-r from-violet to-magenta text-white shadow-[0_4px_30px_rgba(139,92,246,0.3)] hover:shadow-[0_4px_40px_rgba(139,92,246,0.4)] active:scale-[0.99]"
                  : "bg-white/[0.04] text-white/30 cursor-not-allowed"
              )}
            >
              {submitting ? "sending..." : "send it →"}
            </button>

            {result && !result.success && (
              <p className="text-xs text-red text-center">{result.message}</p>
            )}

            <p className="text-[11px] text-white/35 text-center">
              we review within 24h. multi-channel creators get fast-tracked.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-white/50 uppercase tracking-wider font-bold mb-1">
        {label}
      </label>
      {hint && <p className="text-[11px] text-white/35 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function AttestRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 text-left group"
    >
      <div
        className={cn(
          "w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-colors",
          checked ? "border-violet bg-violet" : "border-white/20 group-hover:border-white/40"
        )}
      >
        {checked && <span className="text-white text-[10px] font-black">✓</span>}
      </div>
      <span className="text-xs text-white/60 leading-relaxed">{label}</span>
    </button>
  );
}

// ======= FAQ =======

const FAQS = [
  {
    q: "how much can i actually earn?",
    a: "depends entirely on your audience. a creator with ~2k engaged followers and 20 active refs should clear $500-1500/mo once ramped. bigger accounts much more. no caps.",
  },
  {
    q: "when do i get paid?",
    a: "every monday, for the previous mon-sun week. in usdc. on whatever chain you picked at signup. $50 minimum payout, rolls over if you don't hit it.",
  },
  {
    q: "what counts toward my commission?",
    a: "net house revenue from your referred users — their losing bets, minus their winning payouts, minus any free bets they used. your tier % of that number is yours.",
  },
  {
    q: "what if my ref wins big and i owe nothing?",
    a: "you don't owe us anything. ever. if your refs have a winning week, your balance for that week is negative and it offsets your earnings over the next 90 days. after 90 days the deficit clears. you never go into personal debt.",
  },
  {
    q: "how long does attribution last?",
    a: "cookie is 30 days. if your ref clicks your link and signs up within 30 days, they're permanently attributed to you. after signup there's no expiry — you earn on that ref for their entire lifetime.",
  },
  {
    q: "can i refer myself?",
    a: "no. self-referrals earn zero commission and will get your account terminated. we check.",
  },
  {
    q: "can i run paid ads to my affiliate link?",
    a: "on kick, discord, and telegram — yes. no google ads, meta ads, tiktok ads (they'd reject you anyway). no X Ads — that requires preauth + a gambling licence we don't have yet. organic posts on X are different — see the channel callout above.",
  },
  {
    q: "do you have a dashboard?",
    a: "not at launch. we dm you a weekly report with your full numbers every monday. dashboard is on the post-launch roadmap.",
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="border-t border-white/[0.04] py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-[11px] text-white/40 uppercase tracking-widest font-bold mb-3">
            faq
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">questions.</h2>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <button
              key={i}
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all text-left overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <span className="text-sm font-bold text-white">{faq.q}</span>
                <span
                  className={cn(
                    "text-white/40 text-lg transition-transform shrink-0 ml-3",
                    open === i && "rotate-45"
                  )}
                >
                  +
                </span>
              </div>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-5 pb-4 text-sm text-white/55 leading-relaxed"
                >
                  {faq.a}
                </motion.div>
              )}
            </button>
          ))}
        </div>

        {/* Final CTA */}
        <div className="mt-12 text-center">
          <Link
            href="#apply"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet text-white font-bold text-sm uppercase tracking-wider hover:bg-violet/90 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)]"
          >
            apply to partner
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
