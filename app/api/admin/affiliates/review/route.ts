import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * POST /api/admin/affiliates/review
 *
 * Approve, reject, or terminate an affiliate application.
 *
 * Body: {
 *   applicationId: string,
 *   action: "approve" | "reject" | "terminate",
 *   reviewNotes?: string,
 *   linkedUserId?: string  // required for approve — the user row that gets the affiliate code
 * }
 *
 * Note: the existing tier system auto-generates a referral_code for every
 * user on signup, so "approve" just marks the application approved and
 * optionally links it to an existing user account. If the applicant hasn't
 * signed up yet, they'll need to sign up first and then you manually link
 * their email → application.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const admin = await verifyAdmin(request, body);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const action = typeof body.action === "string" ? body.action : "";
  const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes : null;
  const linkedUserId = typeof body.linkedUserId === "string" ? body.linkedUserId : null;

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId required" }, { status: 400 });
  }
  if (!["approve", "reject", "terminate"].includes(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check the application exists
  const { data: app, error: appError } = await supabase
    .from("affiliate_applications")
    .select("id, email, handle, status")
    .eq("id", applicationId)
    .single();

  if (appError || !app) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

  let newStatus: string;
  let newLinkedUserId: string | null = null;

  if (action === "approve") {
    newStatus = "approved";
    newLinkedUserId = linkedUserId;

    // If a linked user was provided, sanity-check it exists
    if (linkedUserId) {
      const { data: linkedUser } = await supabase
        .from("users")
        .select("id, referral_code")
        .eq("id", linkedUserId)
        .single();
      if (!linkedUser) {
        return NextResponse.json({ error: "linked user not found" }, { status: 400 });
      }
    }
  } else if (action === "reject") {
    newStatus = "rejected";
  } else {
    // terminate — used for already-approved affiliates that need to be kicked
    newStatus = "terminated";
  }

  const { error: updateError } = await supabase
    .from("affiliate_applications")
    .update({
      status: newStatus,
      review_notes: reviewNotes,
      reviewed_at: new Date().toISOString(),
      linked_user_id: newLinkedUserId || undefined,
    })
    .eq("id", applicationId);

  if (updateError) {
    console.error("[admin/affiliates/review] update error:", updateError);
    return NextResponse.json({ error: "failed to update application" }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: newStatus });
}
