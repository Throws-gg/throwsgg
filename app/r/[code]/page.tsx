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
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">("checking");

  useEffect(() => {
    if (!code) {
      setStatus("invalid");
      return;
    }

    let cancelled = false;

    // Validate the code against the backend and log the click
    fetch("/api/affiliates/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.valid) {
          // Store the referral code in localStorage so it persists across login flow
          try {
            localStorage.setItem(REFERRAL_STORAGE_KEY, code);
            localStorage.setItem(
              `${REFERRAL_STORAGE_KEY}_expires`,
              String(Date.now() + 30 * 24 * 60 * 60 * 1000)
            );
          } catch {
            // localStorage not available — still proceed
          }
          setStatus("valid");
          // Short delay so users see the "you've been referred" message
          setTimeout(() => router.push("/"), 1800);
        } else {
          setStatus("invalid");
          // Send to landing page after showing the error briefly
          setTimeout(() => router.push("/"), 2500);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // If the API is down, still honour the code client-side and move on
        try {
          localStorage.setItem(REFERRAL_STORAGE_KEY, code);
          localStorage.setItem(
            `${REFERRAL_STORAGE_KEY}_expires`,
            String(Date.now() + 30 * 24 * 60 * 60 * 1000)
          );
        } catch {
          // localStorage not available
        }
        setStatus("valid");
        setTimeout(() => router.push("/"), 1800);
      });

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={`relative max-w-md w-full rounded-2xl border p-8 text-center overflow-hidden ${
          status === "invalid"
            ? "border-red/20 bg-gradient-to-br from-red/[0.06] to-red/[0.02]"
            : "border-violet/20 bg-gradient-to-br from-violet/[0.08] to-magenta/[0.04]"
        }`}
      >
        {/* Ambient glow */}
        <div
          className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] -mr-20 -mt-20 ${
            status === "invalid" ? "bg-red/10" : "bg-violet/15"
          }`}
        />
        <div
          className={`absolute bottom-0 left-0 w-48 h-48 rounded-full blur-[80px] -ml-16 -mb-16 ${
            status === "invalid" ? "bg-red/5" : "bg-magenta/10"
          }`}
        />

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
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 ${
              status === "invalid"
                ? "bg-red/10 border border-red/30"
                : "bg-green/10 border border-green/30"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                status === "invalid" ? "bg-red" : "bg-green"
              }`}
            />
            <span
              className={`text-[11px] font-bold tracking-wide uppercase ${
                status === "invalid" ? "text-red" : "text-green"
              }`}
            >
              {status === "invalid" ? "invalid code" : "invited"}
            </span>
          </motion.div>

          {/* Copy */}
          <div className="space-y-2">
            {status === "invalid" ? (
              <>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  that code doesn't exist.
                </h1>
                <p className="text-sm text-white/40">
                  no harm done. we'll drop you on the landing page anyway.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  you've been invited.
                </h1>
                <p className="text-sm text-white/40">
                  a friend wants you to join them at throws.gg
                </p>
              </>
            )}
          </div>

          {/* Referral code box */}
          {status !== "invalid" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl bg-black/30 border border-white/[0.08] px-5 py-4 backdrop-blur-sm"
            >
              <p className="text-[10px] text-white/25 uppercase tracking-widest font-medium mb-1">
                referral code
              </p>
              <p className="font-mono text-2xl font-black text-white tracking-[0.15em]">
                {code}
              </p>
            </motion.div>
          )}

          {/* Loading / redirect indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2 pt-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
            <p className="text-[11px] text-white/35">
              {status === "checking"
                ? "checking your code..."
                : status === "invalid"
                ? "taking you to the track anyway..."
                : "taking you to the track..."}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
