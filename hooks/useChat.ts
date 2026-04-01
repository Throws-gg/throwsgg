"use client";

import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useChatStore, type ChatMessage } from "@/stores/chatStore";

/**
 * Hook that manages chat state via:
 * 1. Load last 50 messages on mount
 * 2. Supabase Realtime subscription on chat_messages table
 */
export function useChat() {
  const store = useChatStore();

  // Load recent messages
  const loadMessages = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        const messages: ChatMessage[] = data.reverse().map((m) => ({
          id: m.id,
          userId: m.user_id,
          username: m.username,
          message: m.message,
          isSystem: m.is_system,
          createdAt: m.created_at,
        }));
        store.setMessages(messages);
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(
    async (userId: string, username: string, message: string) => {
      try {
        const res = await fetch("/api/chat/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, username, message }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { error: data.error };
        }
        return { success: true };
      } catch {
        return { error: "Failed to send" };
      }
    },
    []
  );

  useEffect(() => {
    loadMessages();

    // Subscribe to new messages via Realtime
    const channel = supabase
      .channel("chat-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const m = payload.new as Record<string, unknown>;
          if (!m || !m.id) return;

          const message: ChatMessage = {
            id: m.id as string,
            userId: (m.user_id as string) || null,
            username: m.username as string,
            message: m.message as string,
            isSystem: m.is_system as boolean,
            createdAt: m.created_at as string,
          };

          store.addMessage(message);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return {
    messages: store.messages,
    unreadCount: store.unreadCount,
    isOpen: store.isOpen,
    setIsOpen: store.setIsOpen,
    sendMessage,
    reload: loadMessages,
  };
}
