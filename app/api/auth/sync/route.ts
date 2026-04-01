import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, isDevMode } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/sync
 * Called after Privy login. Creates the DB user if it doesn't exist,
 * or returns the existing user. This is the bridge between Privy auth
 * and our user table.
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  // In dev mode, this route isn't used (dev toolbar creates users directly)
  if (isDevMode()) {
    return NextResponse.json(
      { error: "Use /api/dev/user in dev mode" },
      { status: 400 }
    );
  }

  // Verify Privy token
  const authHeader = request.headers.get("authorization");
  const verified = await verifyAuthToken(authHeader);

  if (!verified) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const privyId = verified.userId;

  try {
    // Check if user exists
    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("privy_id", privyId)
      .single();

    if (existing) {
      return NextResponse.json({
        user: {
          id: existing.id,
          username: existing.username,
          balance: parseFloat(existing.balance),
          totalWagered: parseFloat(existing.total_wagered),
          totalProfit: parseFloat(existing.total_profit),
        },
      });
    }

    // Create new user
    // Generate a random username like "degen_a1b2c3"
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const username = `degen_${randomSuffix}`;

    const { data: newUser, error } = await supabase
      .from("users")
      .insert({
        privy_id: privyId,
        username,
        balance: 0,
        role: "player",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create user:", error);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: newUser.id,
        username: newUser.username,
        balance: parseFloat(newUser.balance),
        totalWagered: parseFloat(newUser.total_wagered),
        totalProfit: parseFloat(newUser.total_profit),
      },
      isNew: true,
    });
  } catch (error) {
    console.error("Auth sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
