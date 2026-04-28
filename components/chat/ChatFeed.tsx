"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/stores/chatStore";

interface ChatFeedProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  userId: string | null;
  className?: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Weekly top-3 ROI tipsters get a flame badge next to their handle in chat.
// Fetched once on mount + refreshed every 60s. Cheap (cached at edge) and
// low-stakes — if it fails the chat renders without flames.
const TOP_TIPSTERS_REFRESH_MS = 60_000;

export function ChatFeed({ messages, onSend, userId, className }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [topTipsters, setTopTipsters] = useState<Map<string, number>>(new Map());
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());

  // Pull weekly top-3 usernames + active streaks for chat-handle badges.
  // Two parallel polls; both fail-quiet.
  useEffect(() => {
    let cancelled = false;
    const loadTipsters = async () => {
      try {
        const res = await fetch("/api/leaderboard?window=week&limit=3");
        if (!res.ok) return;
        const data = (await res.json()) as { entries?: { username: string }[] };
        if (cancelled) return;
        const m = new Map<string, number>();
        (data.entries ?? []).forEach((e, i) => m.set(e.username, i + 1));
        setTopTipsters(m);
      } catch {
        // silent
      }
    };
    const loadStreaks = async () => {
      try {
        const res = await fetch("/api/streak/top?limit=50");
        if (!res.ok) return;
        const data = (await res.json()) as {
          streaks?: { username: string; current: number }[];
        };
        if (cancelled) return;
        const m = new Map<string, number>();
        (data.streaks ?? []).forEach((s) => m.set(s.username, s.current));
        setStreaks(m);
      } catch {
        // silent
      }
    };
    loadTipsters();
    loadStreaks();
    const t = setInterval(() => {
      loadTipsters();
      loadStreaks();
    }, TOP_TIPSTERS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, autoScroll]);

  // Detect if user scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !userId) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0"
      >
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            gm degens. chat is live.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="group">
            {msg.isSystem ? (
              <div className="text-[11px] text-gold/70 bg-gold/5 rounded px-2 py-1 border-l-2 border-gold/20">
                {msg.message}
              </div>
            ) : (
              <div className="text-[12px] leading-relaxed">
                {(() => {
                  const rank = topTipsters.get(msg.username);
                  const flame = rank === 1 ? "🔥" : rank === 2 ? "⚡" : rank === 3 ? "✨" : null;
                  const streak = streaks.get(msg.username) ?? 0;
                  return (
                    <span className="font-bold text-violet/90 mr-1">
                      {flame ? (
                        <span
                          className="mr-0.5 text-[11px]"
                          title={`Weekly top tipster · #${rank}`}
                        >
                          {flame}
                        </span>
                      ) : streak >= 3 ? (
                        <span
                          className="mr-0.5 text-[10px] text-orange-400/85 font-mono"
                          title={`${streak}-day bet streak`}
                        >
                          🔥{streak}
                        </span>
                      ) : null}
                      {msg.username}
                    </span>
                  );
                })()}
                <span className="text-foreground/80">{msg.message}</span>
                <span className="text-muted-foreground/40 text-[9px] ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Scroll to bottom button */}
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
            className="sticky bottom-0 mx-auto block text-[10px] text-cyan bg-cyan/10 px-3 py-1 rounded-full border border-cyan/30"
          >
            ↓ new messages
          </button>
        )}
      </div>

      {/* Input — always pinned at bottom with safe area */}
      <div className="shrink-0 p-2 pb-14 border-t border-border bg-card">
        {userId ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="type something degen..."
              maxLength={500}
              className="flex-1 bg-secondary rounded-lg px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-violet min-w-0"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 px-3 py-1.5 bg-violet/20 text-violet rounded-lg text-xs font-bold hover:bg-violet/30 disabled:opacity-30 transition-all"
            >
              send
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground text-center py-1">
            login to chat
          </p>
        )}
      </div>
    </div>
  );
}
