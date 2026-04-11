import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/users/list
 *
 * Search + list users. Query params:
 *   - q: string — searches username, wallet_address, referral_code
 *   - filter: 'all' | 'banned' | 'muted' | 'admin' | 'has_balance'
 *   - limit: default 50 max 200
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = (searchParams.get("q") || "").trim();
  const filter = searchParams.get("filter") || "all";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  const supabase = createAdminClient();

  let query = supabase
    .from("users")
    .select(
      "id, username, wallet_address, balance, bonus_balance, total_wagered, total_profit, role, is_banned, is_muted, referral_code, referrer_id, affiliate_tier, referral_lifetime_earned, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    // Search across username, wallet, referral_code
    query = query.or(
      `username.ilike.%${q}%,wallet_address.ilike.%${q}%,referral_code.ilike.%${q}%`
    );
  }

  if (filter === "banned") query = query.eq("is_banned", true);
  if (filter === "muted") query = query.eq("is_muted", true);
  if (filter === "admin") query = query.eq("role", "admin");
  if (filter === "has_balance") query = query.gt("balance", 0);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/users/list] error:", error);
    return NextResponse.json({ error: "failed to load users" }, { status: 500 });
  }

  const users = (data || []).map((u) => ({
    id: u.id,
    username: u.username,
    walletAddress: u.wallet_address,
    balance: parseFloat(u.balance || 0),
    bonusBalance: parseFloat(u.bonus_balance || 0),
    totalWagered: parseFloat(u.total_wagered || 0),
    totalProfit: parseFloat(u.total_profit || 0),
    role: u.role,
    isBanned: u.is_banned,
    isMuted: u.is_muted,
    referralCode: u.referral_code,
    referrerId: u.referrer_id,
    affiliateTier: u.affiliate_tier || 1,
    referralLifetimeEarned: parseFloat(u.referral_lifetime_earned || 0),
    createdAt: u.created_at,
  }));

  return NextResponse.json({ users });
}
