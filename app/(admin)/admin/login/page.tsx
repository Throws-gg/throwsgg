"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Focus the input on mount
  useEffect(() => {
    document.getElementById("admin-pw")?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "incorrect password");
        setPassword("");
      } else {
        router.push("/admin/dashboard");
      }
    } catch {
      setError("network error");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#05050a] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-violet/[0.06] rounded-full blur-[120px] pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          background: "repeating-linear-gradient(135deg, transparent 0 12px, #8B5CF6 12px 13px)",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center mb-10">
          <Image
            src="/logo-horse.png"
            alt="throws.gg"
            width={140}
            height={36}
            className="h-8 w-auto"
            priority
          />
        </Link>

        {/* Card */}
        <div className="relative border border-white/[0.08] bg-[#0a0a12] rounded p-7 overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-violet/[0.08] blur-3xl pointer-events-none" />

          <div className="relative">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-violet/10 border border-violet/30 rounded px-3 py-1 mb-5">
              <div className="w-1.5 h-1.5 rounded-full bg-violet animate-pulse" />
              <span className="text-[10px] text-violet font-bold tracking-[0.2em] uppercase font-mono">
                control room
              </span>
            </div>

            <h1 className="text-2xl font-black tracking-tight mb-1 text-white">
              password required
            </h1>
            <p className="text-[11px] text-white/40 font-mono mb-6">
              enter the admin key to access the control room
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                  admin password
                </label>
                <input
                  id="admin-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet/50 font-mono tracking-wider"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded border border-red/20 bg-red/[0.03] px-3 py-2">
                  <span className="text-red text-xs font-mono">⚠</span>
                  <span className="text-xs text-red font-mono">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !password}
                className="w-full px-4 py-3 bg-violet text-white text-xs font-bold uppercase tracking-wider hover:bg-violet/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded"
              >
                {submitting ? "checking..." : "enter →"}
              </button>
            </form>

            <p className="text-[10px] text-white/25 mt-6 font-mono text-center">
              unauthorized access logged
            </p>
          </div>
        </div>

        {/* Back link */}
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-[11px] text-white/30 hover:text-white/60 font-mono uppercase tracking-wider"
          >
            ← back to site
          </Link>
        </div>
      </div>
    </div>
  );
}
