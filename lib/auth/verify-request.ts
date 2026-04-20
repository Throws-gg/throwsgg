import { NextRequest } from "next/server";
import { verifyAuthToken, isDevMode } from "./privy";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuthedUser {
  privyId: string;
  dbUserId: string;
  username: string;
}

/**
 * Verify the request and return the authenticated user.
 *
 * In production: verifies Privy JWT from Authorization header,
 * looks up the DB user by privy_id.
 *
 * In dev mode (no PRIVY_APP_SECRET): accepts userId from request body
 * as a fallback for testing.
 */
export async function verifyRequest(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<AuthedUser | null> {
  const supabase = createAdminClient();

  // Try Privy auth first
  if (!isDevMode()) {
    const authHeader = request.headers.get("authorization");
    const verified = await verifyAuthToken(authHeader);

    if (!verified) return null;

    // Look up DB user by privy_id
    const { data: user } = await supabase
      .from("users")
      .select("id, username, privy_id")
      .eq("privy_id", verified.userId)
      .single();

    if (!user) return null;

    return {
      privyId: verified.userId,
      dbUserId: user.id,
      username: user.username,
    };
  }

  // Dev mode fallback — trust userId from body.
  // Hard guard: never run this branch in production, even if isDevMode() is somehow true.
  if (process.env.NODE_ENV === "production") {
    throw new Error("verifyRequest: dev-mode branch reached in production");
  }

  const userId = body?.userId as string;
  if (!userId) return null;

  const { data: user } = await supabase
    .from("users")
    .select("id, username, privy_id")
    .eq("id", userId)
    .single();

  if (!user) return null;

  return {
    privyId: user.privy_id,
    dbUserId: user.id,
    username: user.username,
  };
}
