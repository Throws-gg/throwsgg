"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  userId: string | null;
  username: string;
  message: string;
  isSystem: boolean;
  isDeleted: boolean;
  isBanned: boolean;
  isMuted: boolean;
  createdAt: string;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminChatPage() {
  const userId = useUserStore((s) => s.userId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showDeleted, setShowDeleted] = useState(true);
  const [includeSystem, setIncludeSystem] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        show_deleted: String(showDeleted),
        system: String(includeSystem),
        limit: "200",
      });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/chat/list?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error("fetch failed:", err);
    }
    setLoading(false);
  }, [showDeleted, includeSystem, userId]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleAction = async (messageId: string, action: "delete" | "undelete") => {
    const reason = prompt("reason (audit log):");
    if (!reason) return;
    try {
      const res = await fetch("/api/admin/chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, messageId, action, reason }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("action failed:", err);
    }
  };

  const handleUserAction = async (targetUserId: string, action: "ban" | "mute") => {
    const reason = prompt(`${action} reason (audit log):`);
    if (!reason) return;
    try {
      const res = await fetch("/api/admin/users/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, targetUserId, action, reason }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("action failed:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.25em] mb-1">
          module · 08
        </p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          chat <span className="text-cyan-400">moderation</span>
        </h1>
        <p className="text-xs text-white/40 mt-1 font-mono">
          live feed · delete messages · mute or ban users from chat
        </p>
      </div>

      {/* Filter toggles */}
      <div className="flex gap-2 flex-wrap">
        <Toggle
          label="show deleted"
          active={showDeleted}
          onClick={() => setShowDeleted((v) => !v)}
        />
        <Toggle
          label="include system"
          active={includeSystem}
          onClick={() => setIncludeSystem((v) => !v)}
        />
      </div>

      {/* Messages */}
      {loading ? (
        <Loading />
      ) : messages.length === 0 ? (
        <EmptyState message="no messages in view" />
      ) : (
        <div className="rounded border border-white/[0.06] bg-[#0a0a12] divide-y divide-white/[0.04]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "px-4 py-3 hover:bg-white/[0.02] transition-colors group",
                m.isDeleted && "opacity-40"
              )}
            >
              <div className="flex items-start gap-3">
                {/* User cell */}
                <div className="shrink-0 w-32">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "font-bold text-xs",
                        m.isSystem ? "text-violet" : "text-white"
                      )}
                    >
                      @{m.username}
                    </span>
                    {m.isBanned && (
                      <span className="text-[8px] font-mono font-bold uppercase bg-red/10 text-red border border-red/25 rounded px-1 py-0.5">
                        banned
                      </span>
                    )}
                    {m.isMuted && (
                      <span className="text-[8px] font-mono font-bold uppercase bg-gold/10 text-gold border border-gold/25 rounded px-1 py-0.5">
                        muted
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-white/30 font-mono">{fmtTime(m.createdAt)}</div>
                </div>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm break-words",
                      m.isDeleted ? "line-through text-white/40" : "text-white/80"
                    )}
                  >
                    {m.message}
                  </p>
                  {m.isDeleted && (
                    <p className="text-[9px] font-mono text-red/60 mt-1 uppercase tracking-wider">
                      deleted
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {m.isDeleted ? (
                    <button
                      onClick={() => handleAction(m.id, "undelete")}
                      className="text-[9px] font-mono uppercase tracking-wider text-green hover:text-white px-2 py-1 rounded border border-green/20 hover:bg-green/10"
                    >
                      restore
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(m.id, "delete")}
                      className="text-[9px] font-mono uppercase tracking-wider text-red hover:text-white px-2 py-1 rounded border border-red/20 hover:bg-red/10"
                    >
                      delete
                    </button>
                  )}
                  {m.userId && !m.isSystem && (
                    <>
                      <button
                        onClick={() => handleUserAction(m.userId!, "mute")}
                        className="text-[9px] font-mono uppercase tracking-wider text-gold hover:text-white px-2 py-1 rounded border border-gold/20 hover:bg-gold/10"
                      >
                        mute user
                      </button>
                      <button
                        onClick={() => handleUserAction(m.userId!, "ban")}
                        className="text-[9px] font-mono uppercase tracking-wider text-red hover:text-white px-2 py-1 rounded border border-red/20 hover:bg-red/10"
                      >
                        ban user
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 border text-[10px] font-mono uppercase tracking-wider rounded transition-all",
        active
          ? "border-violet/50 bg-violet/10 text-violet"
          : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70"
      )}
    >
      {active ? "●" : "○"} {label}
    </button>
  );
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
