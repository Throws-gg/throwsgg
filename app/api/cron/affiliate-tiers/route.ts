import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/affiliate-tiers
 *
 * Nightly job that recomputes every affiliate's tier based on their
 * rolling 30-day NGR. Authorised via Vercel Cron secret.
 *
 * Tiers:
 *   Tier 1 (Rookie)  : $0       – $25k    → 35% of NGR
 *   Tier 2 (Trainer) : $25k     – $100k   → 40% of NGR
 *   Tier 3 (Owner)   : $100k+             → 45% of NGR
 */
export async function GET(request: NextRequest) {
  // Vercel Cron sets this header; also allow manual trigger via env secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase.rpc("recalc_affiliate_tiers");

    if (error) {
      console.error("Tier recalc failed:", error);
      return NextResponse.json(
        { error: "Tier recalc failed", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      affiliatesProcessed: data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Tier recalc error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
