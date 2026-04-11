"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

// ============================================
// Admin · Users — search, view, ban/mute/adjust
// ============================================

type Filter = "all" | "banned" | "muted" | "admin" | "has_balance";

interface User {
  id: string;
  username: string;
  walletAddress: string | null;
  balance: number;
  bonusBalance: number;
  totalWagered: number;
  totalProfit: number;
  role: "player" | "admin";
  isBanned: boolean;
  isMuted: boolean;
  referralCode: string;
  referrerId: string | null;
  affiliateTier: number;
  referralLifetimeEarned: number;
  createdAt: string;
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

export default function AdminUsersPage() {
  const userId = useUserStore((s) => s.userId);
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<User | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, filter, limit: "100" });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/users/list?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [q, filter, userId]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(), 200);
    return () => clearTimeout(t);
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
          module · 04
        </p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          users <span className="text-violet">directory</span>
        </h1>
        <p className="text-xs text-white/40 mt-1 font-mono">
          search · ban · mute · adjust balance · audit trail
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search username · wallet · referral code..."
            className="w-full px-4 py-2.5 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
          />
        </div>
        <div className="flex gap-1 text-[10px] font-mono uppercase tracking-wider">
          {(["all", "banned", "muted", "admin", "has_balance"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-2.5 border transition-all rounded",
                filter === f
                  ? "border-violet/50 bg-violet/10 text-violet"
                  : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/15"
              )}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Loading />
      ) : users.length === 0 ? (
        <EmptyState message="no users match" />
      ) : (
        <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <Th>user</Th>
                <Th>wallet</Th>
                <Th className="text-right">balance</Th>
                <Th className="text-right">wagered</Th>
                <Th className="text-right">profit</Th>
                <Th>status</Th>
                <Th>joined</Th>
                <Th className="text-right pr-4">action</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">@{u.username}</span>
                      {u.role === "admin" && (
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider bg-violet/15 text-violet border border-violet/30 rounded px-1.5 py-0.5">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/35 font-mono">
                      {u.referralCode}
                    </div>
                  </Td>
                  <Td>
                    <code className="text-[10px] font-mono text-white/50">
                      {shortAddr(u.walletAddress)}
                    </code>
                  </Td>
                  <Td className="text-right">
                    <div className="font-mono text-white font-bold tabular-nums">
                      {fmtUSD(u.balance)}
                    </div>
                    {u.bonusBalance > 0 && (
                      <div className="text-[9px] text-gold/60 font-mono">
                        +{fmtUSD(u.bonusBalance)} bonus
                      </div>
                    )}
                  </Td>
                  <Td className="text-right font-mono text-white/60 tabular-nums">
                    {fmtUSD(u.totalWagered)}
                  </Td>
                  <Td
                    className={cn(
                      "text-right font-mono font-bold tabular-nums",
                      u.totalProfit >= 0 ? "text-green/80" : "text-red/80"
                    )}
                  >
                    {u.totalProfit >= 0 ? "+" : ""}
                    {fmtUSD(u.totalProfit)}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {u.isBanned && (
                        <span className="text-[9px] font-mono font-bold uppercase bg-red/10 text-red border border-red/25 rounded px-1.5 py-0.5">
                          banned
                        </span>
                      )}
                      {u.isMuted && (
                        <span className="text-[9px] font-mono font-bold uppercase bg-gold/10 text-gold border border-gold/25 rounded px-1.5 py-0.5">
                          muted
                        </span>
                      )}
                      {!u.isBanned && !u.isMuted && (
                        <span className="text-[9px] font-mono text-white/30">ok</span>
                      )}
                    </div>
                  </Td>
                  <Td className="text-[10px] font-mono text-white/35">{fmtDate(u.createdAt)}</Td>
                  <Td className="text-right pr-4">
                    <button
                      onClick={() => setSelected(u)}
                      className="text-[10px] font-mono uppercase tracking-wider text-violet hover:text-white"
                    >
                      manage →
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <UserModal
            user={selected}
            adminId={userId}
            onClose={() => setSelected(null)}
            onDone={() => {
              setSelected(null);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
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

// ============================================
// User Modal
// ============================================

function UserModal({
  user,
  adminId,
  onClose,
  onDone,
}: {
  user: User;
  adminId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doAction = async (action: string, amount?: number) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: adminId,
          targetUserId: user.id,
          action,
          amount,
          reason: reason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "failed");
      } else {
        onDone();
      }
    } catch {
      setError("network error");
    }
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", damping: 25 }}
        className="relative z-10 w-full max-w-lg rounded border border-white/10 bg-[#0a0a12] max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-white/[0.06] bg-[#0a0a12] flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
              manage user
            </p>
            <h2 className="text-xl font-black">@{user.username}</h2>
            <p className="text-[11px] text-white/40 font-mono mt-1">
              {user.referralCode} · tier {user.affiliateTier}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="balance" value={fmtUSD(user.balance)} />
            <Stat label="bonus balance" value={fmtUSD(user.bonusBalance)} />
            <Stat label="total wagered" value={fmtUSD(user.totalWagered)} />
            <Stat label="total profit" value={fmtUSD(user.totalProfit)} />
          </div>

          {user.walletAddress && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/35 mb-1">
                wallet
              </div>
              <code className="text-[10px] font-mono break-all text-white/70">
                {user.walletAddress}
              </code>
            </div>
          )}

          <div className="h-px bg-white/[0.06]" />

          {/* Reason */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
              reason (required for audit log)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="why am I doing this..."
              className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
            />
          </div>

          {/* Ban/mute actions */}
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn
              onClick={() => doAction(user.isBanned ? "unban" : "ban")}
              disabled={submitting || user.role === "admin"}
              variant={user.isBanned ? "green" : "red"}
              label={user.isBanned ? "unban user" : "ban user"}
            />
            <ActionBtn
              onClick={() => doAction(user.isMuted ? "unmute" : "mute")}
              disabled={submitting}
              variant={user.isMuted ? "green" : "gold"}
              label={user.isMuted ? "unmute chat" : "mute chat"}
            />
          </div>

          {/* Balance adjust */}
          <div className="rounded border border-white/[0.06] p-4 bg-white/[0.02]">
            <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
              balance adjustment
            </p>
            <p className="text-[10px] text-white/35 mb-3 font-mono">
              positive to credit, negative to debit. appears in user transaction history.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="±$0.00"
                className="flex-1 px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
              />
              <button
                onClick={() => {
                  const n = parseFloat(adjustAmount);
                  if (Number.isFinite(n) && n !== 0) {
                    doAction("adjust_balance", n);
                  }
                }}
                disabled={submitting || !reason || !adjustAmount}
                className="px-4 py-2 bg-violet/10 border border-violet/30 text-violet text-[10px] font-mono font-bold uppercase tracking-wider hover:bg-violet/20 disabled:opacity-30 transition-all rounded"
              >
                apply
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red font-mono">{error}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-1">
        {label}
      </div>
      <div className="text-lg font-mono font-black text-white tabular-nums">{value}</div>
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  variant,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: "red" | "gold" | "green";
  label: string;
}) {
  const colors = {
    red: "bg-red/10 border-red/30 text-red hover:bg-red/20",
    gold: "bg-gold/10 border-gold/30 text-gold hover:bg-gold/20",
    green: "bg-green/10 border-green/30 text-green hover:bg-green/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-4 py-2.5 border text-[10px] font-mono font-bold uppercase tracking-wider transition-all rounded disabled:opacity-30 disabled:cursor-not-allowed",
        colors[variant]
      )}
    >
      {label}
    </button>
  );
}
