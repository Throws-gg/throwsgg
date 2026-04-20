import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/racing/engine";
import { verifyCron } from "@/lib/cron/verify";

async function handle(request: NextRequest) {
  if (!verifyCron(request)) {
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
