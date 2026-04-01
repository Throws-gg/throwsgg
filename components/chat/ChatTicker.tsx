"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChatFeed } from "./ChatFeed";
import type { ChatMessage } from "@/stores/chatStore";

interface ChatTickerProps {
  messages: ChatMessage[];
  unreadCount: number;
  onSend: (message: string) => void;
  userId: string | null;
}

export function ChatTicker({
  messages,
  unreadCount,
  onSend,
  userId,
}: ChatTickerProps) {
  const [expanded, setExpanded] = useState(false);
  const lastMessages = messages.slice(-3);

  return (
    <>
      {/* Compact ticker — always visible */}
      <button
        onClick={() => setExpanded(true)}
        className="w-full bg-card/80 border border-border rounded-lg px-3 py-1.5 text-left overflow-hidden relative"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 overflow-hidden">
            {lastMessages.length === 0 ? (
              <span className="text-[10px] text-muted-foreground">
                chat is live — tap to open
              </span>
            ) : (
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={lastMessages[lastMessages.length - 1]?.id}
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -15, opacity: 0 }}
                  className="truncate"
                >
                  {lastMessages[lastMessages.length - 1]?.isSystem ? (
                    <span className="text-[10px] text-gold/80">
                      {lastMessages[lastMessages.length - 1].message}
                    </span>
                  ) : (
                    <span className="text-[10px]">
                      <span className="font-bold text-violet/80">
                        {lastMessages[lastMessages.length - 1]?.username}
                      </span>{" "}
                      <span className="text-foreground/60">
                        {lastMessages[lastMessages.length - 1]?.message}
                      </span>
                    </span>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span className="text-[9px] text-muted-foreground font-bold">
              CHAT
            </span>
            {unreadCount > 0 && (
              <span className="bg-violet text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded overlay */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[205] bg-black/60"
              onClick={() => setExpanded(false)}
            />

            {/* Chat panel */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-x-0 z-[210] bg-card border-t border-border rounded-t-2xl flex flex-col"
              style={{ top: "15vh", bottom: 0 }}
            >
              {/* Handle bar */}
              <div className="flex items-center justify-center py-2">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">chat</span>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                    <span className="text-[10px] text-muted-foreground">
                      live
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                >
                  close
                </button>
              </div>

              {/* Full chat feed */}
              <ChatFeed
                messages={messages}
                onSend={onSend}
                userId={userId}
                className="flex-1 min-h-0"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
