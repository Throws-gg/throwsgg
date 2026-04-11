import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/auth/verify-admin";

/**
 * GET /api/admin/transactions/list
 *
 * Query params:
 *   - type: 'all' | 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'bonus'
 *   - status: 'all' | 'pending' | 'confirmed' | 'failed'
 *   - q: search by username or tx_hash
 *   - limit: default 100 max 500
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const devUserId = searchParams.get("userId");

  const admin = await verifyAdmin(request, devUserId ? { userId: devUserId } : undefined);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = searchParams.get("type") || "all";
  const status = searchParams.get("status") || "all";
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const supabase = createAdminClient();

  let query = supabase
    .from("transactions")
    .select(
      "id, user_id, type, amount, balance_after, currency, status, tx_hash, address, metadata, created_at, confirmed_at, users:user_id ( username )"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type !== "all") query = query.eq("type", type);
  if (status !== "all") query = query.eq("status", status);
  if (q) {
    // Search by tx_hash only (username search would require a join + filter which supabase doesn't do cleanly)
    query = query.or(`tx_hash.ilike.%${q}%,address.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/transactions/list] error:", error);
    return NextResponse.json({ error: "failed to load transactions" }, { status: 500 });
  }

  interface Row {
    id: string;
    user_id: string;
    type: string;
    amount: string | number;
    balance_after: string | number;
    currency: string;
    status: string;
    tx_hash: string | null;
    address: string | null;
    metadata: unknown;
    created_at: string;
    confirmed_at: string | null;
    users: { username: string } | null;
  }

  const transactions = ((data as unknown as Row[]) || []).map((t) => ({
    id: t.id,
    userId: t.user_id,
    username: t.users?.username || "unknown",
    type: t.type,
    amount: parseFloat(String(t.amount)),
    balanceAfter: parseFloat(String(t.balance_after)),
    currency: t.currency,
    status: t.status,
    txHash: t.tx_hash,
    address: t.address,
    metadata: t.metadata,
    createdAt: t.created_at,
    confirmedAt: t.confirmed_at,
  }));

  // Aggregate totals for stat bar (scoped to returned window)
  const totals = transactions.reduce(
    (acc, tx) => {
      if (tx.status !== "confirmed") return acc;
      if (tx.type === "deposit") acc.deposits += tx.amount;
      if (tx.type === "withdrawal") acc.withdrawals += Math.abs(tx.amount);
      return acc;
    },
    { deposits: 0, withdrawals: 0 }
  );

  return NextResponse.json({ transactions, totals });
}
