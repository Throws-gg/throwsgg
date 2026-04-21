import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRequest } from "@/lib/auth/verify-request";
import {
  ALL_CATEGORIES,
  DEFAULT_PREFERENCES,
  EmailCategory,
  isTransactional,
} from "@/lib/email/categories";

/**
 * GET — return the user's current per-category preferences merged with
 * DEFAULT_PREFERENCES, plus the global unsubscribe state and their email.
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const authed = await verifyRequest(request);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("users")
    .select("email, email_preferences, email_unsubscribed_at")
    .eq("id", authed.dbUserId)
    .single();

  if (!data) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const stored = (data.email_preferences ?? {}) as Record<string, boolean>;
  const merged: Record<EmailCategory, boolean> = { ...DEFAULT_PREFERENCES };
  for (const cat of ALL_CATEGORIES) {
    if (cat in stored) merged[cat] = stored[cat] === true;
  }

  return NextResponse.json({
    email: data.email ?? null,
    unsubscribedAt: data.email_unsubscribed_at ?? null,
    preferences: merged,
  });
}

/**
 * POST — update preferences. Body accepts either:
 *   { preferences: { lifecycle: false, retention: true, ... } }  — partial merge
 *   { unsubscribeAll: true }   — flip email_unsubscribed_at now (transactional still sends)
 *   { unsubscribeAll: false }  — clear email_unsubscribed_at
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  let body: {
    preferences?: Partial<Record<EmailCategory, boolean>>;
    unsubscribeAll?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok
  }

  const authed = await verifyRequest(request, body as Record<string, unknown>);
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates: Record<string, unknown> = {};

  if (typeof body.unsubscribeAll === "boolean") {
    updates.email_unsubscribed_at = body.unsubscribeAll
      ? new Date().toISOString()
      : null;
  }

  if (body.preferences && typeof body.preferences === "object") {
    const { data: existing } = await supabase
      .from("users")
      .select("email_preferences")
      .eq("id", authed.dbUserId)
      .single();

    const current = (existing?.email_preferences ?? {}) as Record<string, boolean>;
    const next = { ...current };

    for (const cat of ALL_CATEGORIES) {
      if (cat in body.preferences) {
        // transactional can't be disabled — regulatory requirement
        if (isTransactional(cat)) continue;
        next[cat] = body.preferences[cat] === true;
      }
    }

    updates.email_preferences = next;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", authed.dbUserId);

  if (error) {
    console.error("Email preferences update failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
