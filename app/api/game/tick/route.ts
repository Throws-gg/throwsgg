import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/game/engine";

/**
 * POST /api/game/tick
 * Advances the game state machine. Called by:
 * - Vercel Cron (every minute)
 * - Client-side polling (every second)
 * - pg_cron or external timer
 *
 * Protected by a shared secret to prevent abuse.
 */
export async function POST(request: NextRequest) {
  // Simple auth — check for cron secret or service key
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow if: valid cron secret, or service role key, or no secret configured (dev mode)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await tick();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Game tick error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tick failed" },
      { status: 500 }
    );
  }
}

// Also allow GET for easy testing in dev
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Use POST" }, { status: 405 });
  }

  try {
    const result = await tick();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Game tick error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tick failed" },
      { status: 500 }
    );
  }
}
