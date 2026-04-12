import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/affiliates/vanity
 * List all vanity slugs.
 *
 * POST /api/admin/affiliates/vanity
 * Create a new vanity slug.
 * Body: { slug: string, username: string, note?: string, userId?: string (admin) }
 *
 * DELETE /api/admin/affiliates/vanity
 * Deactivate a vanity slug.
 * Body: { slugId: string, userId?: string (admin) }
 */

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  // Basic admin check (userId required, must be admin)
  const adminId = searchParams.get("userId");
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: admin } = await supabase
    .from("users")
    .select("role")
    .eq("id", adminId)
    .single();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

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
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { slug: rawSlug, username: targetUsername, note, userId: adminId } = body;

    if (!adminId || !rawSlug || !targetUsername) {
      return NextResponse.json({ error: "slug, username, and userId required" }, { status: 400 });
    }

    // Admin check
    const { data: admin } = await supabase
      .from("users")
      .select("role")
      .eq("id", adminId)
      .single();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Validate slug format
    const slug = rawSlug.toLowerCase().trim().replace(/\s+/g, "-");
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

    // Look up the target user
    const { data: targetUser } = await supabase
      .from("users")
      .select("id")
      .eq("username", targetUsername)
      .single();
    if (!targetUser) {
      return NextResponse.json({ error: `User "${targetUsername}" not found` }, { status: 404 });
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

    // Create the vanity slug
    const { data: created, error } = await supabase
      .from("vanity_slugs")
      .insert({
        slug,
        user_id: targetUser.id,
        created_by: adminId,
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
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { slugId, userId: adminId } = body;

    if (!adminId || !slugId) {
      return NextResponse.json({ error: "slugId and userId required" }, { status: 400 });
    }

    // Admin check
    const { data: admin } = await supabase
      .from("users")
      .select("role")
      .eq("id", adminId)
      .single();
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("vanity_slugs")
      .update({ active: false })
      .eq("id", slugId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Vanity slug delete error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
