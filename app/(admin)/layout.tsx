"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ============================================
// Admin Layout — "Control Room" aesthetic
//
// Dark operational dashboard. Sharp corners on data surfaces.
// Monospace typography for numbers. Status LEDs for live data.
//
// Auth: handled entirely by middleware.ts — if you can see this layout,
// you're already authenticated via the password session cookie.
// The /admin/login page renders without the chrome.
// ============================================

const NAV_ITEMS = [
  { href: "/admin/dashboard",    label: "overview",     code: "00", desc: "system state" },
  { href: "/admin/affiliates",   label: "affiliates",   code: "01", desc: "partner program" },
  { href: "/admin/big-wins",     label: "big wins",     code: "02", desc: "payout watch" },
  { href: "/admin/users",        label: "users",        code: "04", desc: "search · ban · adjust" },
  { href: "/admin/transactions", label: "transactions", code: "05", desc: "full ledger" },
  { href: "/admin/races",        label: "races",        code: "06", desc: "history · outliers" },
  { href: "/admin/control",      label: "control",      code: "07", desc: "engine + pause" },
  { href: "/admin/chat",         label: "chat mod",     code: "08", desc: "moderate messages" },
  { href: "/admin/payouts",      label: "payouts",      code: "09", desc: "weekly affiliate queue" },
  { href: "/admin/banner",       label: "assets",       code: "03", desc: "banner + socials" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Login page renders standalone — no admin chrome
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-[#05050a] text-white">
      {/* ======== HEADER ======== */}
      <header className="relative border-b border-white/[0.06] bg-[#0a0a12] overflow-hidden">
        {/* Diagonal gradient strip */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            background: "repeating-linear-gradient(135deg, transparent 0 8px, #8B5CF6 8px 9px)",
          }}
        />
        {/* Violet glow top-right */}
        <div className="absolute top-0 right-0 w-96 h-24 bg-violet/[0.08] blur-3xl pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/logo-horse.png"
                alt="throws.gg"
                width={120}
                height={30}
                className="h-7 w-auto"
                priority
              />
            </Link>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-green/80 font-bold">
                admin · control room
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono">
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded border border-white/10 hover:border-red/40 hover:bg-red/[0.05] hover:text-red transition-all uppercase tracking-wider text-white/50"
            >
              logout
            </button>
            <Link
              href="/"
              className="px-3 py-1.5 rounded border border-white/10 hover:border-white/25 hover:bg-white/[0.03] transition-all uppercase tracking-wider text-white/50 hover:text-white"
            >
              exit →
            </Link>
          </div>
        </div>
      </header>

      {/* ======== NAV STRIP ======== */}
      <nav className="border-b border-white/[0.06] bg-[#08080f]">
        <div className="max-w-[1400px] mx-auto px-6 flex overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 px-4 sm:px-5 py-3 shrink-0 border-r border-white/[0.04]",
                  "transition-all",
                  active ? "bg-violet/[0.06]" : "hover:bg-white/[0.02]"
                )}
              >
                {/* Active indicator — top border */}
                <span
                  className={cn(
                    "absolute top-0 left-0 right-0 h-0.5 transition-all",
                    active ? "bg-violet" : "bg-transparent"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-mono font-bold tabular-nums",
                    active ? "text-violet" : "text-white/25 group-hover:text-white/40"
                  )}
                >
                  {item.code}
                </span>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "text-xs font-bold uppercase tracking-wider leading-tight",
                      active ? "text-white" : "text-white/50 group-hover:text-white/80"
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-[9px] font-mono text-white/25 leading-tight">
                    {item.desc}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ======== CONTENT ======== */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* ======== FOOTER ======== */}
      <footer className="mt-16 border-t border-white/[0.04] py-4 text-center">
        <p className="text-[10px] font-mono text-white/25 uppercase tracking-widest">
          throws.gg control room · classified
        </p>
      </footer>
    </div>
  );
}
