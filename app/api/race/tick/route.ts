import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/racing/engine";

async function handle(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !isDev) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await tick();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Race tick error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tick failed" },
      { status: 500 }
    );
  }
}

export const POST = handle;
export const GET = handle;
