import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET    /api/admin/affiliates/vanity       — list all vanity slugs
 * POST   /api/admin/affiliates/vanity       — create a new vanity slug
 *         Body: { slug, username, note? }
 * DELETE /api/admin/affiliates/vanity       — deactivate a slug
 *         Body: { slugId }
 *
 * Auth: admin password cookie (see verifyAdmin + middleware).
 */

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: slugs } = await supabase
    .from("vanity_slugs")
    .select("*, users!vanity_slugs_user_id_fkey(username, referral_code)")
    .order("created_at", { ascending: false });

  return NextResponse.json({
    slugs: (slugs || []).map((s) => ({
      id: s.id,
      slug: s.slug,
      userId: s.user_id,
      username: (s.users as unknown as { username: string })?.username || "unknown",
      referralCode: (s.users as unknown as { referral_code: string })?.referral_code || "",
      note: s.note,
      active: s.active,
      clickCount: s.click_count,
      createdAt: s.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  try {
    const { slug: rawSlug, username: targetUsername, note } = body;

    if (!rawSlug || !targetUsername) {
      return NextResponse.json({ error: "slug and username required" }, { status: 400 });
    }

    // Validate slug format
    const slug = String(rawSlug).toLowerCase().trim().replace(/\s+/g, "-");
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug must be 3-32 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens" },
        { status: 400 }
      );
    }

    // Reserved words check
    const reserved = ["admin", "api", "racing", "r", "login", "profile", "wallet", "history", "referrals", "settings", "verify", "arena", "affiliates"];
    if (reserved.includes(slug)) {
      return NextResponse.json({ error: `"${slug}" is reserved` }, { status: 400 });
    }

    // Look up the target user — tolerant of @prefix, whitespace, casing.
    const normalisedUsername = String(targetUsername).trim().replace(/^@+/, "");
    if (!normalisedUsername) {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }
    const { data: targetUser } = await supabase
      .from("users")
      .select("id, username")
      .ilike("username", normalisedUsername)
      .maybeSingle();
    if (!targetUser) {
      return NextResponse.json({ error: `User "${normalisedUsername}" not found` }, { status: 404 });
    }

    // Check slug isn't already taken
    const { data: existing } = await supabase
      .from("vanity_slugs")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: `Slug "${slug}" is already taken` }, { status: 409 });
    }

    const { data: created, error } = await supabase
      .from("vanity_slugs")
      .insert({
        slug,
        user_id: targetUser.id,
        created_by: null,
        note: note || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create vanity slug:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      vanitySlug: {
        id: created.id,
        slug: created.slug,
        userId: created.user_id,
        link: `throws.gg/${created.slug}`,
      },
    });
  } catch (err) {
    console.error("Vanity slug error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  try {
    const { slugId } = body;
    if (!slugId) {
      return NextResponse.json({ error: "slugId required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("vanity_slugs")
      .update({ active: false })
      .eq("id", slugId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Vanity slug delete error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
