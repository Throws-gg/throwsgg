import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/affiliates/apply
 *
 * Public endpoint. Anyone can submit an affiliate application from
 * /affiliates. Founder reviews manually and approves or rejects via
 * the admin panel (or directly in the DB for now).
 *
 * Enforces basic validation:
 * - Required fields present
 * - All three attestations must be true
 * - Email + wallet look vaguely right
 * - One pending application per email (no spam)
 */

interface ApplyBody {
  handle?: string;
  xHandle?: string;
  email?: string;
  audienceSize?: string;
  primaryChannels?: string[];
  secondaryChannels?: string;
  contentLink?: string;
  notes?: string;
  payoutWallet?: string;
  payoutChain?: string;
  attestJurisdiction?: boolean;
  attestXPolicy?: boolean;
  attestTerms?: boolean;
}

const VALID_CHAINS = ["solana", "base", "arbitrum", "ethereum"] as const;
const VALID_CHANNELS = [
  "telegram",
  "discord",
  "kick",
  "youtube",
  "newsletter",
  "x",
  "other",
];

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isWallet(v: string): boolean {
  // Very permissive — we just want to reject obvious garbage.
  // Real validation happens at payout time.
  return v.length >= 20 && v.length <= 128 && /^[a-zA-Z0-9]+$/.test(v);
}

export async function POST(request: NextRequest) {
  try {
    const body: ApplyBody = await request.json().catch(() => ({}));

    // Required fields
    const handle = (body.handle || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const audienceSize = (body.audienceSize || "").trim();
    const payoutWallet = (body.payoutWallet || "").trim();
    const payoutChain = (body.payoutChain || "solana").trim().toLowerCase();
    const primaryChannels = Array.isArray(body.primaryChannels) ? body.primaryChannels : [];

    if (!handle || handle.length < 2 || handle.length > 64) {
      return NextResponse.json({ error: "handle required" }, { status: 400 });
    }
    if (!email || !isEmail(email)) {
      return NextResponse.json({ error: "valid email required" }, { status: 400 });
    }
    if (!audienceSize) {
      return NextResponse.json({ error: "audience size required" }, { status: 400 });
    }
    if (!payoutWallet || !isWallet(payoutWallet)) {
      return NextResponse.json({ error: "valid usdc wallet required" }, { status: 400 });
    }
    if (!VALID_CHAINS.includes(payoutChain as typeof VALID_CHAINS[number])) {
      return NextResponse.json({ error: "invalid payout chain" }, { status: 400 });
    }
    if (primaryChannels.length === 0) {
      return NextResponse.json({ error: "pick at least one primary channel" }, { status: 400 });
    }
    // Filter out any unknown channel tags
    const cleanChannels = primaryChannels
      .map((c) => String(c).toLowerCase().trim())
      .filter((c) => VALID_CHANNELS.includes(c));
    if (cleanChannels.length === 0) {
      return NextResponse.json({ error: "invalid channel selection" }, { status: 400 });
    }

    // Attestations — all three must be true
    if (!body.attestJurisdiction || !body.attestXPolicy || !body.attestTerms) {
      return NextResponse.json({ error: "all confirmations required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Reject duplicate pending applications from the same email
    const { data: existing } = await supabase
      .from("affiliate_applications")
      .select("id, status")
      .eq("email", email)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existing) {
      const msg =
        existing.status === "approved"
          ? "already approved — check your email"
          : "already applied — we'll get back to you soon";
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    const { data: row, error } = await supabase
      .from("affiliate_applications")
      .insert({
        handle,
        x_handle: (body.xHandle || "").trim() || null,
        email,
        audience_size: audienceSize,
        primary_channels: cleanChannels,
        secondary_channels: (body.secondaryChannels || "").trim() || null,
        content_link: (body.contentLink || "").trim() || null,
        notes: (body.notes || "").trim() || null,
        payout_wallet: payoutWallet,
        payout_chain: payoutChain,
        attest_jurisdiction: true,
        attest_x_policy: true,
        attest_terms: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[affiliates/apply] insert failed:", error);
      return NextResponse.json({ error: "could not submit — try again" }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: row.id });
  } catch (err) {
    console.error("[affiliates/apply] fatal:", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
