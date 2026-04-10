"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";

const REFERRAL_STORAGE_KEY = "throws_referral_code";

export default function ReferralLandingPage() {
  const router = useRouter();
  const params = useParams();
  const code = typeof params?.code === "string" ? params.code.toUpperCase() : "";
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!code) return;

    // Store the referral code in localStorage so it persists across login flow
    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, code);
      // Also set an expiry (30 days)
      localStorage.setItem(
        `${REFERRAL_STORAGE_KEY}_expires`,
        String(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );
    } catch {
      // localStorage not available — still proceed
    }

    // Short delay so users see the "you've been referred" message
    setRedirecting(true);
    const timeout = setTimeout(() => {
      router.push("/");
    }, 1800);

    return () => clearTimeout(timeout);
  }, [code, router]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative max-w-md w-full rounded-2xl border border-violet/20 bg-gradient-to-br from-violet/[0.08] to-magenta/[0.04] p-8 text-center overflow-hidden"
      >
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet/15 rounded-full blur-[100px] -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-magenta/10 rounded-full blur-[80px] -ml-16 -mb-16" />

        <div className="relative space-y-5">
          {/* Logo */}
          <div className="flex justify-center">
            <Image
              src="/logo-horse.png"
              alt="throws.gg"
              width={140}
              height={36}
              className="h-9 w-auto"
              priority
            />
          </div>

          {/* Badge */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", damping: 12 }}
            className="inline-flex items-center gap-2 bg-green/10 border border-green/30 rounded-full px-4 py-1.5"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span className="text-[11px] text-green font-bold tracking-wide uppercase">
              Invited
            </span>
          </motion.div>

          {/* Copy */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              You've been invited.
            </h1>
            <p className="text-sm text-white/40">
              A friend wants you to join them at throws.gg
            </p>
          </div>

          {/* Referral code box */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-black/30 border border-white/[0.08] px-5 py-4 backdrop-blur-sm"
          >
            <p className="text-[10px] text-white/25 uppercase tracking-widest font-medium mb-1">
              Referral Code
            </p>
            <p className="font-mono text-2xl font-black text-white tracking-[0.15em]">
              {code}
            </p>
          </motion.div>

          {/* Loading indicator */}
          {redirecting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-2 pt-2"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
              <p className="text-[11px] text-white/35">Taking you to the track...</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
