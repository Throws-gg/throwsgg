"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

type TxType = "all" | "deposit" | "withdrawal" | "bet" | "payout" | "bonus";
type TxStatus = "all" | "pending" | "confirmed" | "failed";

interface Transaction {
  id: string;
  userId: string;
  username: string;
  type: string;
  amount: number;
  balanceAfter: number;
  currency: string;
  status: string;
  txHash: string | null;
  address: string | null;
  metadata: unknown;
  createdAt: string;
  confirmedAt: string | null;
}

function fmtUSD(v: number, showSign = false): string {
  const abs = Math.abs(v);
  const str = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(2)}`;
  if (showSign && v !== 0) return (v > 0 ? "+" : "-") + str;
  return str;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
}

function shortHash(h: string | null): string {
  if (!h) return "—";
  if (h.length < 16) return h;
  return `${h.slice(0, 8)}...${h.slice(-6)}`;
}

const TYPE_COLORS: Record<string, string> = {
  deposit: "text-green",
  withdrawal: "text-red",
  bet: "text-white/50",
  payout: "text-violet",
  push_refund: "text-white/40",
  bonus: "text-gold",
};

export default function AdminTransactionsPage() {
  const userId = useUserStore((s) => s.userId);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [totals, setTotals] = useState({ deposits: 0, withdrawals: 0 });
  const [type, setType] = useState<TxType>("all");
  const [status, setStatus] = useState<TxStatus>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ type, status, q, limit: "200" });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/transactions/list?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setTxs(data.transactions || []);
      setTotals(data.totals || { deposits: 0, withdrawals: 0 });
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [type, status, q, userId]);

  useEffect(() => {
    const t = setTimeout(fetchData, 200);
    return () => clearTimeout(t);
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
          module · 05
        </p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          transaction <span className="text-green">ledger</span>
        </h1>
        <p className="text-xs text-white/40 mt-1 font-mono">
          deposits · withdrawals · bets · payouts · bonus credits · manual adjustments
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-green/15 bg-green/[0.02] p-4 rounded">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
            deposits in view (confirmed)
          </p>
          <p className="text-3xl font-black font-mono tabular-nums text-green">
            {fmtUSD(totals.deposits)}
          </p>
        </div>
        <div className="border border-red/15 bg-red/[0.02] p-4 rounded">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30 mb-2">
            withdrawals in view (confirmed)
          </p>
          <p className="text-3xl font-black font-mono tabular-nums text-red">
            {fmtUSD(totals.withdrawals)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search by tx hash or address..."
            className="flex-1 min-w-[240px] px-4 py-2.5 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <FilterRow
            label="type"
            options={["all", "deposit", "withdrawal", "bet", "payout", "bonus"]}
            value={type}
            onChange={(v) => setType(v as TxType)}
          />
          <FilterRow
            label="status"
            options={["all", "confirmed", "pending", "failed"]}
            value={status}
            onChange={(v) => setStatus(v as TxStatus)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Loading />
      ) : txs.length === 0 ? (
        <EmptyState message="no transactions match" />
      ) : (
        <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <Th>time</Th>
                <Th>user</Th>
                <Th>type</Th>
                <Th className="text-right">amount</Th>
                <Th className="text-right">balance</Th>
                <Th>status</Th>
                <Th>hash / address</Th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <Td className="text-[10px] font-mono text-white/40 whitespace-nowrap">
                    {fmtTime(tx.createdAt)}
                  </Td>
                  <Td>
                    <div className="font-bold text-white">@{tx.username}</div>
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "text-[10px] font-mono font-bold uppercase",
                        TYPE_COLORS[tx.type] || "text-white/40"
                      )}
                    >
                      {tx.type}
                    </span>
                  </Td>
                  <Td
                    className={cn(
                      "text-right font-mono font-bold tabular-nums",
                      tx.amount > 0 ? "text-green/80" : tx.amount < 0 ? "text-red/80" : "text-white/60"
                    )}
                  >
                    {fmtUSD(tx.amount, true)}
                  </Td>
                  <Td className="text-right font-mono text-white/60 tabular-nums">
                    {fmtUSD(tx.balanceAfter)}
                  </Td>
                  <Td>
                    <StatusPill status={tx.status} />
                  </Td>
                  <Td>
                    <code className="text-[9px] font-mono text-white/40">
                      {shortHash(tx.txHash || tx.address)}
                    </code>
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

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 mr-1">
        {label}
      </span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2.5 py-1.5 border text-[10px] font-mono uppercase tracking-wider transition-all rounded",
            value === opt
              ? "border-violet/50 bg-violet/10 text-violet"
              : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/15"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-green/10 text-green border-green/25",
    pending: "bg-gold/10 text-gold border-gold/25",
    failed: "bg-red/10 text-red border-red/25",
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
