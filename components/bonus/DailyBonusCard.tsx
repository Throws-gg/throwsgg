"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { useUserStore } from "@/stores/userStore";
import { getVisitorId } from "@/lib/fingerprint/client";
import {
  DAILY_BONUS_MIN_DEPOSIT_USD,
  getDailyBonusTier,
  getNextDailyBonusTier,
  type DailyBonusTier,
} from "@/lib/bonus/daily";

interface StatusResponse {
  eligible: boolean;
  alreadyClaimedToday: boolean;
  amount: number;
  tier: DailyBonusTier;
  tierLabel: string;
  nextClaimAt: string | null;
  depositRequired: number;
  currentDeposits: number;
  totalWagered: number;
}

interface ClaimResponse {
  granted: boolean;
  reason?: string;
  amount?: number;
  tier?: DailyBonusTier;
  wageringAdded?: number;
  nextClaimAt?: string | null;
  user?: {
    balance: number;
    bonusBalance: number;
    wageringRemaining: number;
    bonusExpiresAt: string | null;
  } | null;
  depositRequired?: number;
  currentDeposits?: number;
}

function formatCountdown(nextClaimAt: string | null): string {
  if (!nextClaimAt) return "";
  const ms = new Date(nextClaimAt).getTime() - Date.now();
  if (ms <= 0) return "ready";
  const hours = Math.floor(ms / 3600_000);
  const minutes = Math.floor((ms % 3600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function DailyBonusCard({
  compact = false,
  onDepositClick,
}: {
  compact?: boolean;
  /**
   * Optional handler for the "Deposit" unlock button. When provided, the
   * button renders as a <button> and calls this instead of navigating. Used
   * on /wallet where the page already hosts the deposit panel — we switch
   * tabs + scroll instead of a no-op self-link. Omit on pages like /profile
   * where the button should navigate to /wallet.
   */
  onDepositClick?: () => void;
}) {
  const authedFetch = useAuthedFetch();
  const userId = useUserStore((s) => s.userId);
  const setBonusState = useUserStore((s) => s.setBonusState);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadStatus = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await authedFetch("/api/bonus/daily/status");
      if (!res.ok) return;
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
    } catch {
      // silent — card is non-critical
    } finally {
      setLoading(false);
    }
  }, [authedFetch, userId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Tick the countdown every 30s while claimed-for-today so the "Xh Ym" stays fresh.
  useEffect(() => {
    if (!status?.alreadyClaimedToday) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status?.alreadyClaimedToday]);

  const handleClaim = useCallback(async () => {
    if (!userId || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const visitorId = await getVisitorId();
      const res = await authedFetch("/api/bonus/daily/claim", {
        method: "POST",
        body: JSON.stringify({ fingerprint: visitorId }),
      });
      const data = (await res.json()) as ClaimResponse;

      if (!data.granted) {
        setError(reasonToMessage(data.reason));
        await loadStatus();
        return;
      }

      if (data.user) {
        setBonusState({
          cashBalance: data.user.balance,
          bonusBalance: data.user.bonusBalance,
          wageringRemaining: data.user.wageringRemaining,
        });
      }
      setJustClaimed(data.amount ?? 0);
      await loadStatus();
    } catch {
      setError("Couldn't claim right now. Try again.");
    } finally {
      setClaiming(false);
    }
  }, [authedFetch, claiming, loadStatus, setBonusState, userId]);

  const tierSpec = useMemo(() => {
    if (!status) return null;
    return getDailyBonusTier(status.totalWagered);
  }, [status]);

  const nextTier = useMemo(() => {
    if (!status) return null;
    return getNextDailyBonusTier(status.totalWagered);
  }, [status]);

  const countdown = useMemo(
    () => formatCountdown(status?.nextClaimAt ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status?.nextClaimAt, now],
  );

  if (!userId) return null;
  if (loading && !status) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 h-[112px] animate-pulse" />
    );
  }
  if (!status) return null;

  const needsDeposit = status.currentDeposits < status.depositRequired;

  return (
    <div className="rounded-xl border border-violet/20 bg-gradient-to-br from-violet/[0.08] via-violet/[0.04] to-transparent overflow-hidden">
      <div className={compact ? "p-3" : "p-4"}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet/90">
              Daily Bonus
            </span>
            {tierSpec && (
              <span className="text-[10px] font-mono text-white/40">
                · {tierSpec.label}
              </span>
            )}
          </div>
          {status.alreadyClaimedToday && countdown && (
            <span className="text-[10px] font-mono text-white/40">
              next in {countdown}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-white tabular-nums">
              ${status.amount.toFixed(2)}
            </div>
            <div className="text-[11px] text-white/45 mt-0.5">
              {status.alreadyClaimedToday
                ? "claimed today"
                : needsDeposit
                  ? `Deposit $${status.depositRequired} to unlock`
                  : "free every 24h · 1× wagering"}
            </div>
          </div>

          {status.alreadyClaimedToday ? (
            <button
              disabled
              className="px-4 py-2 rounded-lg bg-white/[0.03] text-white/30 text-sm font-semibold border border-white/5 cursor-not-allowed"
            >
              Claimed
            </button>
          ) : needsDeposit ? (
            onDepositClick ? (
              <button
                onClick={onDepositClick}
                className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/80 text-sm font-semibold border border-white/10 transition-colors"
              >
                Deposit
              </button>
            ) : (
              <a
                href="/wallet#deposit-panel"
                className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/80 text-sm font-semibold border border-white/10 transition-colors"
              >
                Deposit
              </a>
            )
          ) : (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet to-magenta text-white text-sm font-semibold shadow-[0_0_16px_rgba(139,92,246,0.35)] hover:shadow-[0_0_22px_rgba(139,92,246,0.5)] transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {claiming ? "Claiming…" : "Claim"}
            </button>
          )}
        </div>

        {nextTier && !compact && (
          <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-white/35">
            ${Math.max(0, nextTier.minWagered - status.totalWagered).toFixed(0)}{" "}
            more wagered → {nextTier.label} ($
            {nextTier.amountUsd.toFixed(2)}/day)
          </div>
        )}

        {error && (
          <div className="mt-2 text-[11px] text-red-400/80">{error}</div>
        )}
      </div>

      <AnimatePresence>
        {justClaimed !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onAnimationComplete={() =>
              setTimeout(() => setJustClaimed(null), 2400)
            }
            className="px-4 pb-3 text-[11px] text-violet/80 font-mono"
          >
            +${justClaimed.toFixed(2)} added to bonus balance.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function reasonToMessage(reason?: string): string {
  switch (reason) {
    case "already_claimed":
      return "Already claimed today. Back tomorrow.";
    case "deposit_required":
      return `Deposit $${DAILY_BONUS_MIN_DEPOSIT_USD} to unlock daily bonuses.`;
    case "duplicate_fingerprint":
    case "duplicate_ip":
      return "Another account on this device already claimed today.";
    case "banned":
      return "Account ineligible.";
    default:
      return "Couldn't claim right now. Try again.";
  }
}
