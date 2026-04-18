"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

// ============================================
// Admin · Affiliates — review applications, track performance
// ============================================

type AppStatus = "pending" | "approved" | "rejected" | "terminated" | "all";

interface Application {
  id: string;
  handle: string;
  xHandle: string | null;
  email: string;
  audienceSize: string;
  primaryChannels: string[];
  secondaryChannels: string | null;
  contentLink: string | null;
  notes: string | null;
  payoutWallet: string;
  payoutChain: string;
  status: "pending" | "approved" | "rejected" | "terminated";
  reviewNotes: string | null;
  linkedUserId: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface Affiliate {
  id: string;
  username: string;
  referralCode: string;
  tier: number;
  totalRefs: number;
  activatedRefs: number;
  clicks30d: number;
  ngr30d: number;
  pendingEarnings: number;
  lifetimeEarnings: number;
  createdAt: string;
}

const TIER_LABELS = ["rookie", "trainer", "owner"];
const TIER_COLORS = ["text-white/60", "text-violet", "text-gold"];

function fmtUSD(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================
// Main page
// ============================================

interface VanitySlug {
  id: string;
  slug: string;
  userId: string;
  username: string;
  referralCode: string;
  note: string | null;
  active: boolean;
  clickCount: number;
  createdAt: string;
}

export default function AdminAffiliatesPage() {
  const userId = useUserStore((s) => s.userId);
  const [tab, setTab] = useState<"applications" | "active" | "vanity">("applications");
  const [statusFilter, setStatusFilter] = useState<AppStatus>("pending");
  const [applications, setApplications] = useState<Application[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [vanitySlugs, setVanitySlugs] = useState<VanitySlug[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (userId) params.set("userId", userId);
      const [appRes, vanityRes] = await Promise.all([
        fetch(`/api/admin/affiliates/list?${params}`),
        fetch(`/api/admin/affiliates/vanity`),
      ]);
      if (appRes.ok) {
        const data = await appRes.json();
        setApplications(data.applications || []);
        setAffiliates(data.affiliates || []);
      }
      if (vanityRes.ok) {
        const vData = await vanityRes.json();
        setVanitySlugs(vData.slugs || []);
      }
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [statusFilter, userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const counts = {
    pending: applications.filter((a) => a.status === "pending").length,
    approved: affiliates.length,
  };

  return (
    <div className="space-y-6">
      {/* ======== Header ======== */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
            module · 01
          </p>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            affiliate <span className="text-violet">program</span>
          </h1>
          <p className="text-xs text-white/40 mt-1 font-mono">
            review applications · track partner performance · approve / reject / terminate
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex gap-3 shrink-0">
          <StatChip label="pending" value={applications.filter((a) => a.status === "pending").length} accent="gold" />
          <StatChip label="active" value={affiliates.length} accent="green" />
        </div>
      </div>

      {/* ======== Tabs ======== */}
      <div className="flex border-b border-white/[0.06]">
        <TabButton
          active={tab === "applications"}
          onClick={() => setTab("applications")}
          code="a"
          label="applications"
          count={counts.pending > 0 ? counts.pending : undefined}
        />
        <TabButton
          active={tab === "active"}
          onClick={() => setTab("active")}
          code="b"
          label="active affiliates"
          count={counts.approved > 0 ? counts.approved : undefined}
        />
        <TabButton
          active={tab === "vanity"}
          onClick={() => setTab("vanity")}
          code="c"
          label="custom links"
          count={vanitySlugs.length > 0 ? vanitySlugs.length : undefined}
        />
      </div>

      {/* ======== Applications Tab ======== */}
      {tab === "applications" && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-1 text-[10px] font-mono uppercase tracking-wider">
            {(["pending", "approved", "rejected", "terminated", "all"] as AppStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 border transition-all",
                  statusFilter === s
                    ? "border-violet/50 bg-violet/10 text-violet"
                    : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:border-white/15"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <Loading />
          ) : applications.length === 0 ? (
            <EmptyState message={`no applications match status "${statusFilter}"`} />
          ) : (
            <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <Th>handle</Th>
                    <Th>audience</Th>
                    <Th>channels</Th>
                    <Th>chain</Th>
                    <Th>applied</Th>
                    <Th>status</Th>
                    <Th className="text-right pr-4">action</Th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr
                      key={app.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      <Td>
                        <div className="font-bold text-white">{app.handle}</div>
                        {app.xHandle && (
                          <div className="text-[10px] text-white/35 font-mono">{app.xHandle}</div>
                        )}
                      </Td>
                      <Td className="text-white/70 font-mono">{app.audienceSize}</Td>
                      <Td>
                        <div className="flex gap-1 flex-wrap">
                          {app.primaryChannels.slice(0, 3).map((c) => (
                            <span
                              key={c}
                              className="text-[9px] uppercase tracking-wider font-bold bg-white/[0.04] text-white/60 px-1.5 py-0.5 rounded"
                            >
                              {c}
                            </span>
                          ))}
                          {app.primaryChannels.length > 3 && (
                            <span className="text-[9px] text-white/30">+{app.primaryChannels.length - 3}</span>
                          )}
                        </div>
                      </Td>
                      <Td className="text-[10px] font-mono text-white/50 uppercase">{app.payoutChain}</Td>
                      <Td className="text-[10px] font-mono text-white/35">{fmtDate(app.createdAt)}</Td>
                      <Td>
                        <StatusBadge status={app.status} />
                      </Td>
                      <Td className="text-right pr-4">
                        <button
                          onClick={() => setSelected(app)}
                          className="text-[10px] font-mono uppercase tracking-wider text-violet hover:text-white"
                        >
                          review →
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======== Active Affiliates Tab ======== */}
      {tab === "active" && (
        <div className="space-y-4">
          {loading ? (
            <Loading />
          ) : affiliates.length === 0 ? (
            <EmptyState message="no active affiliates yet" />
          ) : (
            <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <Th>user</Th>
                    <Th>code</Th>
                    <Th>tier</Th>
                    <Th className="text-right">clicks (30d)</Th>
                    <Th className="text-right">refs</Th>
                    <Th className="text-right">active</Th>
                    <Th className="text-right">ngr (30d)</Th>
                    <Th className="text-right">pending</Th>
                    <Th className="text-right pr-4">lifetime</Th>
                  </tr>
                </thead>
                <tbody>
                  {affiliates.map((aff) => {
                    const conversionRate =
                      aff.clicks30d > 0 ? (aff.totalRefs / aff.clicks30d) * 100 : 0;
                    return (
                      <tr
                        key={aff.id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <Td>
                          <div className="font-bold text-white">@{aff.username}</div>
                          <div className="text-[10px] text-white/35 font-mono">
                            joined {fmtDate(aff.createdAt)}
                          </div>
                        </Td>
                        <Td>
                          <code className="text-[10px] font-mono bg-white/[0.04] px-1.5 py-0.5 rounded text-violet/80">
                            {aff.referralCode}
                          </code>
                        </Td>
                        <Td>
                          <span className={cn("text-[10px] font-mono uppercase font-bold", TIER_COLORS[aff.tier - 1])}>
                            t{aff.tier} · {TIER_LABELS[aff.tier - 1]}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <div className="font-mono text-white/70 font-bold tabular-nums">
                            {aff.clicks30d}
                          </div>
                          {conversionRate > 0 && (
                            <div className="text-[9px] text-white/30 font-mono">
                              {conversionRate.toFixed(0)}% cvr
                            </div>
                          )}
                        </Td>
                        <Td className="text-right font-mono text-white/70 font-bold tabular-nums">
                          {aff.totalRefs}
                        </Td>
                        <Td className="text-right font-mono text-green/80 font-bold tabular-nums">
                          {aff.activatedRefs}
                        </Td>
                        <Td
                          className={cn(
                            "text-right font-mono font-bold tabular-nums",
                            aff.ngr30d >= 0 ? "text-green/80" : "text-red/80"
                          )}
                        >
                          {fmtUSD(aff.ngr30d)}
                        </Td>
                        <Td className="text-right font-mono text-gold/80 font-bold tabular-nums">
                          {fmtUSD(aff.pendingEarnings)}
                        </Td>
                        <Td className="text-right pr-4 font-mono text-white font-bold tabular-nums">
                          {fmtUSD(aff.lifetimeEarnings)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======== Vanity Links Tab ======== */}
      {tab === "vanity" && (
        <VanityLinksPanel
          slugs={vanitySlugs}
          onRefresh={fetchData}
        />
      )}

      {/* ======== Review Modal ======== */}
      <AnimatePresence>
        {selected && (
          <ReviewModal
            application={selected}
            userId={userId}
            onClose={() => setSelected(null)}
            onReviewed={() => {
              setSelected(null);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Components
// ============================================

function StatChip({ label, value, accent }: { label: string; value: number; accent: "violet" | "gold" | "green" }) {
  const colors = {
    violet: "text-violet bg-violet/[0.06] border-violet/20",
    gold: "text-gold bg-gold/[0.05] border-gold/20",
    green: "text-green bg-green/[0.05] border-green/20",
  };
  return (
    <div className={cn("flex items-center gap-2 border px-3 py-1.5 rounded", colors[accent])}>
      <span className="text-lg font-black font-mono tabular-nums leading-none">{value}</span>
      <span className="text-[9px] uppercase tracking-widest font-mono font-bold opacity-70">{label}</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  code,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  code: string;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative px-5 py-3 flex items-center gap-3",
        active ? "bg-white/[0.02]" : "hover:bg-white/[0.02]"
      )}
    >
      <span
        className={cn(
          "absolute bottom-0 left-0 right-0 h-0.5 transition-all",
          active ? "bg-violet" : "bg-transparent"
        )}
      />
      <span
        className={cn(
          "text-[10px] font-mono font-bold uppercase tabular-nums",
          active ? "text-violet" : "text-white/30"
        )}
      >
        {code}
      </span>
      <span
        className={cn(
          "text-xs uppercase tracking-wider font-bold",
          active ? "text-white" : "text-white/50"
        )}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          className={cn(
            "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
            active ? "bg-violet/20 text-violet" : "bg-white/[0.06] text-white/50"
          )}
        >
          {count}
        </span>
      )}
    </button>
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    pending: { color: "bg-gold/10 text-gold border-gold/25", label: "pending" },
    approved: { color: "bg-green/10 text-green border-green/25", label: "approved" },
    rejected: { color: "bg-red/10 text-red border-red/25", label: "rejected" },
    terminated: { color: "bg-white/[0.04] text-white/40 border-white/10", label: "terminated" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={cn("text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 border rounded", c.color)}>
      {c.label}
    </span>
  );
}

function Loading() {
  return (
    <div className="rounded border border-white/[0.06] bg-[#0a0a12] py-20 text-center">
      <div className="inline-flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 bg-violet rounded-full animate-pulse" />
        <span className="w-1.5 h-1.5 bg-violet/60 rounded-full animate-pulse" style={{ animationDelay: "0.1s" }} />
        <span className="w-1.5 h-1.5 bg-violet/30 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
      </div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30">loading</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-[#0a0a12] py-20 text-center">
      <p className="text-xs font-mono text-white/35">{message}</p>
    </div>
  );
}

// ============================================
// Review Modal
// ============================================

function ReviewModal({
  application,
  userId,
  onClose,
  onReviewed,
}: {
  application: Application;
  userId: string | null;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [reviewNotes, setReviewNotes] = useState(application.reviewNotes || "");
  const [linkedUserId, setLinkedUserId] = useState(application.linkedUserId || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "approve" | "reject" | "terminate") => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/affiliates/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          applicationId: application.id,
          action,
          reviewNotes: reviewNotes || null,
          linkedUserId: action === "approve" ? linkedUserId || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "failed");
      } else {
        onReviewed();
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
        className="relative z-10 w-full max-w-2xl rounded border border-white/10 bg-[#0a0a12] max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-white/[0.06] bg-[#0a0a12] flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
              review · application
            </p>
            <h2 className="text-xl font-black">{application.handle}</h2>
            <p className="text-[11px] text-white/40 font-mono">{application.email}</p>
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
          <Field label="handle">{application.handle}</Field>
          {application.xHandle && <Field label="x handle">{application.xHandle}</Field>}
          <Field label="email">{application.email}</Field>
          <Field label="audience size">{application.audienceSize}</Field>

          <Field label="primary channels">
            <div className="flex gap-1.5 flex-wrap mt-1">
              {application.primaryChannels.map((c) => (
                <span
                  key={c}
                  className="text-[10px] uppercase tracking-wider font-mono font-bold bg-white/[0.04] text-white/70 px-2 py-1 rounded"
                >
                  {c}
                </span>
              ))}
            </div>
          </Field>

          {application.secondaryChannels && (
            <Field label="secondary channels">{application.secondaryChannels}</Field>
          )}

          {application.contentLink && (
            <Field label="vibe check">
              <a
                href={application.contentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet hover:underline text-sm break-all"
              >
                {application.contentLink}
              </a>
            </Field>
          )}

          {application.notes && (
            <Field label="notes">
              <p className="text-white/70 text-sm whitespace-pre-wrap">{application.notes}</p>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="payout wallet">
              <code className="text-[10px] font-mono break-all text-white/70">
                {application.payoutWallet}
              </code>
            </Field>
            <Field label="chain">
              <span className="text-sm uppercase font-mono text-white/70">
                {application.payoutChain}
              </span>
            </Field>
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Review notes */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
              review notes (internal)
            </label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={2}
              placeholder="why approving / rejecting..."
              className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
            />
          </div>

          {/* Link to existing user (optional, for approve) */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
              link to user id (optional — for approve)
            </label>
            <input
              type="text"
              value={linkedUserId}
              onChange={(e) => setLinkedUserId(e.target.value)}
              placeholder="uuid of the user row that gets the affiliate code"
              className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
            />
            <p className="text-[10px] text-white/25 mt-1 font-mono">
              if the applicant has already signed up, paste their user id here. otherwise, leave blank — they'll be linked when they sign up.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red font-mono">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-white/[0.06] bg-[#0a0a12] flex gap-2 flex-wrap">
          {application.status === "pending" && (
            <>
              <button
                onClick={() => act("approve")}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-green/10 border border-green/30 text-green text-xs font-mono font-bold uppercase tracking-wider hover:bg-green/20 disabled:opacity-40 transition-all rounded"
              >
                approve
              </button>
              <button
                onClick={() => act("reject")}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-red/10 border border-red/30 text-red text-xs font-mono font-bold uppercase tracking-wider hover:bg-red/20 disabled:opacity-40 transition-all rounded"
              >
                reject
              </button>
            </>
          )}
          {application.status === "approved" && (
            <button
              onClick={() => act("terminate")}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-red/10 border border-red/30 text-red text-xs font-mono font-bold uppercase tracking-wider hover:bg-red/20 disabled:opacity-40 transition-all rounded"
            >
              terminate affiliate
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-white/[0.04] border border-white/10 text-white/60 text-xs font-mono font-bold uppercase tracking-wider hover:bg-white/[0.08] transition-all rounded"
          >
            close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/35 mb-1">{label}</div>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

// ============================================
// Vanity Links Panel
// ============================================

function VanityLinksPanel({
  slugs,
  onRefresh,
}: {
  slugs: VanitySlug[];
  onRefresh: () => void;
}) {
  const [newSlug, setNewSlug] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const cleanUsername = newUsername.trim().replace(/^@+/, "");

  const handleCreate = async () => {
    setError(null);
    setSuccess(null);
    if (!newSlug) {
      setError("Enter a slug (e.g. drake)");
      return;
    }
    if (newSlug.length < 3) {
      setError("Slug must be at least 3 characters");
      return;
    }
    if (!cleanUsername) {
      setError("Enter the affiliate's username");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/affiliates/vanity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug,
          username: cleanUsername,
          note: newNote || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create");
      } else {
        setSuccess(`Created: throws.gg/${data.vanitySlug.slug}`);
        setNewSlug("");
        setNewUsername("");
        setNewNote("");
        onRefresh();
      }
    } catch {
      setError("Network error");
    }
    setCreating(false);
  };

  const handleCopy = async (slug: string, id: string) => {
    try {
      await navigator.clipboard.writeText(`https://throws.gg/${slug}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // clipboard may be blocked — silently ignore
    }
  };

  const handleDeactivate = async (slugId: string) => {
    try {
      await fetch("/api/admin/affiliates/vanity", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugId }),
      });
      onRefresh();
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-4">
      {/* Create new vanity link */}
      <div className="rounded border border-white/[0.06] bg-[#0a0a12] p-5 space-y-4">
        <div>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
            create custom link
          </p>
          <p className="text-xs text-white/40">
            Create a vanity URL like <code className="text-violet/80">throws.gg/drake</code> that maps to a user&apos;s affiliate account.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1.5">
              slug
            </label>
            <div className="flex items-center gap-0">
              <span className="text-[10px] text-white/25 font-mono bg-white/[0.03] border border-r-0 border-white/[0.08] rounded-l px-2 py-2">
                throws.gg/
              </span>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="drake"
                className="flex-1 px-3 py-2 rounded-r bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1.5">
              username
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="degen_a1b2c3"
              className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet/50 font-mono"
            />
            {newUsername && cleanUsername !== newUsername && (
              <p className="text-[9px] text-white/30 font-mono mt-1">
                looking up: <span className="text-violet/80">{cleanUsername}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-[9px] font-mono uppercase tracking-wider text-white/40 mb-1.5">
              note (internal)
            </label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Drake partnership Q3"
              className="w-full px-3 py-2 rounded bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-violet/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded transition-all bg-violet/15 border border-violet/40 text-violet hover:bg-violet/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "creating..." : "create link"}
          </button>

          {error && <span className="text-xs text-red font-mono">{error}</span>}
          {success && <span className="text-xs text-green font-mono">{success}</span>}
        </div>
      </div>

      {/* Existing vanity links */}
      {slugs.length > 0 ? (
        <div className="rounded border border-white/[0.06] bg-[#0a0a12] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <Th>link</Th>
                <Th>user</Th>
                <Th>note</Th>
                <Th className="text-right">clicks</Th>
                <Th>status</Th>
                <Th className="text-right pr-4">action</Th>
              </tr>
            </thead>
            <tbody>
              {slugs.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <Td>
                    <code className="text-[11px] font-mono text-violet/90">
                      throws.gg/{s.slug}
                    </code>
                  </Td>
                  <Td>
                    <span className="text-white/70 font-bold">@{s.username}</span>
                    <span className="text-[10px] text-white/25 font-mono ml-1.5">
                      {s.referralCode}
                    </span>
                  </Td>
                  <Td className="text-[10px] text-white/40">{s.note || "—"}</Td>
                  <Td className="text-right font-mono text-white/60 font-bold tabular-nums">
                    {s.clickCount}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        "text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                        s.active
                          ? "bg-green/10 text-green border-green/25"
                          : "bg-white/[0.04] text-white/40 border-white/10"
                      )}
                    >
                      {s.active ? "active" : "inactive"}
                    </span>
                  </Td>
                  <Td className="text-right pr-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => handleCopy(s.slug, s.id)}
                        className="text-[10px] font-mono uppercase tracking-wider text-violet/70 hover:text-violet"
                      >
                        {copiedId === s.id ? "copied" : "copy"}
                      </button>
                      {s.active && (
                        <button
                          onClick={() => handleDeactivate(s.id)}
                          className="text-[10px] font-mono uppercase tracking-wider text-red/70 hover:text-red"
                        >
                          deactivate
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="no custom links created yet" />
      )}
    </div>
  );
}
