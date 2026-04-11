import { NextRequest } from "next/server";
import { verifyRequest } from "./verify-request";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuthedAdmin {
  privyId: string;
  dbUserId: string;
  username: string;
  role: "admin";
}

/**
 * Verify the request and require admin role.
 *
 * Returns the authed admin user, or null if the user is not an admin
 * (or not authed at all). API routes should respond with 401/403 on null.
 */
export async function verifyAdmin(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<AuthedAdmin | null> {
  const authed = await verifyRequest(request, body);
  if (!authed) return null;

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authed.dbUserId)
    .single();

  if (!user || user.role !== "admin") return null;

  return {
    privyId: authed.privyId,
    dbUserId: authed.dbUserId,
    username: authed.username,
    role: "admin",
  };
}
