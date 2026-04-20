import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";

// Simple rate limit: track last message time per user
const lastMessageTime = new Map<string, number>();
const RATE_LIMIT_MS = 2000; // 1 message per 2 seconds

// Basic profanity word list
const BLOCKED_WORDS: string[] = [
  // Add words as needed — keeping minimal for now
];

function containsProfanity(message: string): boolean {
  const lower = message.toLowerCase();
  return BLOCKED_WORDS.some((word) => lower.includes(word));
}

/**
 * POST /api/chat/send
 * Send a chat message.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const authed = await verifyRequest(request, body);
    if (!authed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authed.dbUserId;
    const username = authed.username;
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message required" },
        { status: 400 }
      );
    }

    // Trim and validate length
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }
    if (trimmed.length > 500) {
      return NextResponse.json(
        { error: "Message too long (max 500 chars)" },
        { status: 400 }
      );
    }

    // Rate limit
    const lastTime = lastMessageTime.get(userId) || 0;
    if (Date.now() - lastTime < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: "Slow down — 1 message per 2 seconds" },
        { status: 429 }
      );
    }

    // Check user not banned
    const { data: user } = await supabase
      .from("users")
      .select("is_banned")
      .eq("id", userId)
      .single();

    if (user?.is_banned) {
      return NextResponse.json(
        { error: "You are banned from chat" },
        { status: 403 }
      );
    }

    // Profanity filter
    if (containsProfanity(trimmed)) {
      return NextResponse.json(
        { error: "Message contains inappropriate content" },
        { status: 400 }
      );
    }

    // Insert message
    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({
        user_id: userId,
        username,
        message: trimmed,
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Update rate limit
    lastMessageTime.set(userId, Date.now());

    return NextResponse.json({ message: msg });
  } catch (error) {
    console.error("Chat send error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
