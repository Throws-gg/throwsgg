"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

interface Period {
  id: string;
  affiliateId: string;
  username: string;
  referralCode: string;
  lifetimeEarned: number;
  periodStart: string;
  periodEnd: string;
  ngrGenerated: number;
  grossCommission: number;
  carryoverApplied: number;
  netCommission: number;
  status: string;
  heldUntil: string | null;
  paidAt: string | null;
  payoutWallet: string | null;
  payoutChain: string | null;
}

interface Summary {
  claimable: number;
  held: number;
  paid: number;
}

function fmtUSD(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortAddr(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

export default function AdminPayoutsPage() {
  const userId = useUserStore((s) => s.userId);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [summary, setSummary] = useState<Summary>({ claimable: 0, held: 0, paid: 0 });
  const [status, setStatus] = useState("claimable");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status, limit: "200" });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/payouts/list?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setPeriods(data.periods || []);
      setSummary(data.summary || { claimable: 0, held: 0, paid: 0 });
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [status, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markPaid = async (periodId: string) => {
    const txHash = prompt("paste the on-chain tx hash:");
    if (!txHash) return;
    const reason = prompt("reason / notes (optional):") || "";
    try {
      const res = await fetch("/api/admin/payouts/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, periodId, txHash, reason }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "failed");
      }
    } catch {
      alert("network error");
    }
  };

  const exportCSV = () => {
    if (periods.length === 0) return;
    const rows = [
      ["username", "referral_code", "period", "ngr", "commission", "wallet", "chain", "status"],
      ...periods.map((p) => [
        p.username,
        p.referralCode,
        `${p.periodStart}..${p.periodEnd}`,
        p.ngrGenerated.toFixed(2),
        p.netCommission.toFixed(2),
        p.payoutWallet || "",
        p.payoutChain || "",
        p.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `affiliate-payouts-${status}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
            module · 09
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            payout <span className="text-gold">queue</span>
          </h1>
          <p className="text-xs text-white/40 mt-1 font-mono">
            weekly affiliate commissions · mark paid with tx hash · export csv for batch send
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={periods.length === 0}
          className="px-4 py-2 bg-violet/10 border border-violet/30 text-violet text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-violet/20 disabled:opacity-30 transition-all rounded"
        >
          export csv ↓
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SumTile label="claimable now" value={fmtUSD(summary.claimable)} accent="gold" glow />
        <SumTile label="held (in 7d window)" value={fmtUSD(summary.held)} accent="violet" />
        <SumTile label="paid (lifetime shown)" value={fmtUSD(summary.paid)} accent="green" />
      </div>

      {/* Status filter */}
      <div className="flex gap-1 text-[10px] font-mono uppercase tracking-wider">
        {["claimable", "held", "paid", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "px-3 py-1.5 border transition-all rounded",
              status === s
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/15"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <Loading />
      ) : periods.length === 0 ? (
        <EmptyState message={`no ${status} payouts`} />
      ) : (
        <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-x-auto">
          <table className="w-full text-xs min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <Th>affiliate</Th>
                <Th>period</Th>
                <Th className="text-right">ngr</Th>
                <Th className="text-right">commission</Th>
                <Th>wallet</Th>
                <Th>chain</Th>
                <Th>status</Th>
                <Th className="text-right pr-4">action</Th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <Td>
                    <div className="font-bold text-white">@{p.username}</div>
                    <div className="text-[10px] font-mono text-white/35">{p.referralCode}</div>
                  </Td>
                  <Td className="text-[10px] font-mono text-white/50 whitespace-nowrap">
                    {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                  </Td>
                  <Td className="text-right font-mono text-white/60 tabular-nums">
                    {fmtUSD(p.ngrGenerated)}
                  </Td>
                  <Td className="text-right font-mono text-gold font-bold tabular-nums">
                    {fmtUSD(p.netCommission)}
                  </Td>
                  <Td>
                    {p.payoutWallet ? (
                      <code
                        className="text-[10px] font-mono text-white/60"
                        title={p.payoutWallet}
                      >
                        {shortAddr(p.payoutWallet)}
                      </code>
                    ) : (
                      <span className="text-[10px] text-red/60 font-mono">no wallet</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-[9px] font-mono uppercase text-white/50">
                      {p.payoutChain || "—"}
                    </span>
                  </Td>
                  <Td>
                    <StatusPill status={p.status} />
                  </Td>
                  <Td className="text-right pr-4">
                    {p.status === "claimable" && p.payoutWallet && (
                      <button
                        onClick={() => markPaid(p.id)}
                        className="text-[10px] font-mono uppercase tracking-wider text-green hover:text-white px-2 py-1 rounded border border-green/20 hover:bg-green/10"
                      >
                        mark paid
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SumTile({
  label,
  value,
  accent,
  glow,
}: {
  label: string;
  value: string;
  accent: "gold" | "violet" | "green";
  glow?: boolean;
}) {
  const colors = {
    gold: "text-gold",
    violet: "text-violet",
    green: "text-green",
  };
  const glowBg = {
    gold: "bg-gold/[0.08]",
    violet: "bg-violet/[0.08]",
    green: "bg-green/[0.06]",
  };
  return (
    <div className="relative border border-white/[0.06] bg-[#0a0a12] p-5 overflow-hidden">
      {glow && (
        <div
          className={cn("absolute top-0 right-0 w-28 h-28 blur-3xl pointer-events-none", glowBg[accent])}
        />
      )}
      <p className="relative text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
        {label}
      </p>
      <p className={cn("relative text-3xl font-black font-mono tabular-nums leading-none", colors[accent])}>
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    claimable: "bg-gold/10 text-gold border-gold/25",
    held: "bg-violet/10 text-violet border-violet/25",
    paid: "bg-green/10 text-green border-green/25",
    open: "bg-white/[0.04] text-white/40 border-white/10",
    voided: "bg-red/10 text-red border-red/25",
  };
  return (
    <span
      className={cn(
        "text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 border rounded",
        map[status] || "bg-white/[0.04] text-white/40 border-white/10"
      )}
    >
      {status}
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-left px-4 py-2.5 text-[9px] font-mono uppercase tracking-wider font-bold text-white/35",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}

function Loading() {
  return (
    <div className="rounded border border-white/[0.06] bg-[#0a0a12] py-16 text-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">loading</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-[#0a0a12] py-16 text-center">
      <p className="text-xs font-mono text-white/35">{message}</p>
    </div>
  );
}
