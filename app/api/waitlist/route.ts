import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/waitlist
 * Collects an email for the pre-launch waitlist. Public endpoint —
 * no auth required, light validation + dedupe via unique constraint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const source = typeof body.source === "string" ? body.source.slice(0, 64) : "landing";

    // Basic email validation — not exhaustive, just sanity
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) || rawEmail.length > 320) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("waitlist").insert({
      email: rawEmail,
      source,
      referer: request.headers.get("referer")?.slice(0, 512) || null,
      user_agent: request.headers.get("user-agent")?.slice(0, 512) || null,
    });

    if (error) {
      // Duplicate email — treat as success so users don't feel rejected
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, alreadySubscribed: true });
      }
      console.error("Waitlist insert error:", error);
      return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Waitlist error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
