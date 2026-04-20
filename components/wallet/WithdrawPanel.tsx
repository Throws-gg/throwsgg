"use client";

import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useUserStore } from "@/stores/userStore";
import { LIMITS, WITHDRAWAL_FEES } from "@/lib/game/constants";
import { cn } from "@/lib/utils";

type WithdrawStatus = "idle" | "confirming" | "sending" | "success" | "error";

interface WithdrawalResult {
  status: "completed" | "pending";
  transactionId: string;
  txHash?: string;
  amount: number;
  fee: number;
  newBalance: number;
  message?: string;
}

export function WithdrawPanel() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { balance, setBalance } = useUserStore();

  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [useOwnWallet, setUseOwnWallet] = useState(false);
  const [status, setStatus] = useState<WithdrawStatus>("idle");
  const [result, setResult] = useState<WithdrawalResult | null>(null);
  const [error, setError] = useState("");

  const solanaWallet =
    wallets.find(
      (w) =>
        (w as unknown as { walletClientType?: string }).walletClientType ===
          "privy" || w.standardWallet?.name === "Privy"
    ) || wallets[0];
  const privyAddress = solanaWallet?.address || "";

  const fee = WITHDRAWAL_FEES.USDC;
  const numAmount = parseFloat(amount) || 0;
  const receiveAmount = Math.max(0, numAmount - fee);
  const maxWithdraw = Math.max(0, balance - fee);
  const effectiveAddress = useOwnWallet ? privyAddress : address.trim();
  const isValid =
    numAmount >= LIMITS.MIN_WITHDRAWAL &&
    numAmount + fee <= balance &&
    effectiveAddress.length >= 32;

  const setQuickAmount = useCallback(
    (pct: number) => {
      const val = Math.floor(maxWithdraw * pct * 100) / 100;
      if (val >= LIMITS.MIN_WITHDRAWAL) {
        setAmount(val.toFixed(2));
      }
    },
    [maxWithdraw]
  );

  const handleWithdraw = useCallback(async () => {
    if (!isValid) return;

    setStatus("confirming");
    setError("");
  }, [isValid]);

  const handleConfirm = useCallback(async () => {
    setStatus("sending");
    setError("");

    try {
      const token = await getAccessToken();
      const dest = effectiveAddress;

      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: numAmount,
          destinationAddress: dest,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Withdrawal failed");
        setStatus("error");
        return;
      }

      setResult(data as WithdrawalResult);
      setBalance(data.newBalance);
      setStatus("success");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }, [
    getAccessToken,
    effectiveAddress,
    numAmount,
    setBalance,
  ]);

  const handleReset = useCallback(() => {
    setAmount("");
    setAddress("");
    setStatus("idle");
    setResult(null);
    setError("");
  }, []);

  if (!ready || !authenticated) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-8 text-center">
        <p className="text-white/40 text-sm">Sign in to withdraw</p>
      </div>
    );
  }

  // Success state
  if (status === "success" && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-green/20 bg-gradient-to-b from-green/[0.06] to-[#11111a] p-6 space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-green/15 flex items-center justify-center">
              <CheckIcon className="w-6 h-6 text-green" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-white font-semibold">
              {result.status === "completed"
                ? "Withdrawal Sent"
                : "Withdrawal Queued"}
            </h3>
            <p className="text-white/35 text-xs">
              {result.status === "completed"
                ? "USDC has been sent to your wallet"
                : result.message || "Being reviewed — usually within 1 hour"}
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Amount</span>
              <span className="text-white font-medium">
                ${result.amount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Fee</span>
              <span className="text-white/60">${result.fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/[0.04] pt-2 flex justify-between text-sm">
              <span className="text-white/40">Received</span>
              <span className="text-green font-semibold">
                ${(result.amount - result.fee).toFixed(2)} USDC
              </span>
            </div>
          </div>

          {result.txHash && (
            <a
              href={`https://solscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-cyan hover:text-cyan/80 transition-colors"
            >
              View on Solscan →
            </a>
          )}

          <button
            onClick={handleReset}
            className="w-full py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-semibold hover:bg-white/[0.06] active:scale-[0.99] transition-all"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Confirmation state
  if (status === "confirming") {
    const dest = effectiveAddress;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#11111a] p-6 space-y-5">
          <div className="text-center space-y-1">
            <h3 className="text-white font-semibold">Confirm Withdrawal</h3>
            <p className="text-white/35 text-xs">
              Please review the details below
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Withdraw</span>
              <span className="text-white font-medium">
                ${numAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/40">Network fee</span>
              <span className="text-white/60">${fee.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/[0.04] pt-2 flex justify-between text-sm">
              <span className="text-white/40">You receive</span>
              <span className="text-green font-semibold">
                ${receiveAmount.toFixed(2)} USDC
              </span>
            </div>
            <div className="border-t border-white/[0.04] pt-2">
              <p className="text-white/30 text-[10px] mb-1">To address</p>
              <p className="font-mono text-[11px] text-white/50 break-all">
                {dest}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStatus("idle")}
              className="flex-1 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 text-sm font-semibold hover:bg-white/[0.06] active:scale-[0.99] transition-all"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet to-magenta text-white font-bold text-sm hover:opacity-90 active:scale-[0.99] transition-all shadow-[0_4px_20px_rgba(139,92,246,0.25)]"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sending state
  if (status === "sending") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#11111a] p-6">
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-10 h-10 border-2 border-violet/40 border-t-violet rounded-full animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-white font-semibold text-sm">
                Processing withdrawal...
              </p>
              <p className="text-white/30 text-xs">
                Sending USDC on Solana. This takes a few seconds.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state (with retry)
  if (status === "error") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6 space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <XIcon className="w-5 h-5 text-red-500" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-white font-semibold">Withdrawal Failed</h3>
            <p className="text-red-400/80 text-xs">{error}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 text-sm font-semibold hover:bg-white/[0.06] active:scale-[0.99] transition-all"
            >
              Start Over
            </button>
            <button
              onClick={() => setStatus("confirming")}
              className="flex-1 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-semibold hover:bg-white/[0.06] active:scale-[0.99] transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default: input state
  return (
    <div className="space-y-4">
      {/* Amount input */}
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#11111a] p-6 space-y-5">
        <div className="text-center space-y-2">
          <h3 className="text-white font-semibold">Withdraw USDC</h3>
          <div className="flex items-center justify-center gap-3 text-[11px] flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green/10 border border-green/20 text-green">
              <span className="w-1 h-1 rounded-full bg-green animate-pulse" />
              usually under 5 minutes
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet/10 border border-violet/20 text-violet">
              no KYC under $2,000
            </span>
          </div>
        </div>

        {/* Amount field */}
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-lg font-semibold">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full py-3.5 pl-8 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-lg font-semibold placeholder:text-white/15 focus:outline-none focus:border-violet/40 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Quick amount buttons */}
          <div className="flex gap-2">
            {[0.25, 0.5, 1].map((pct) => (
              <button
                key={pct}
                onClick={() => setQuickAmount(pct)}
                disabled={maxWithdraw < LIMITS.MIN_WITHDRAWAL}
                className="flex-1 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/50 text-xs font-medium hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
              >
                {pct === 1 ? "Max" : `${pct * 100}%`}
              </button>
            ))}
          </div>

          {/* Fee + receive display */}
          {numAmount > 0 && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-4 py-2.5 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-white/30">Fee</span>
                <span className="text-white/40">${fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/30">You receive</span>
                <span
                  className={cn(
                    "font-semibold",
                    receiveAmount > 0 ? "text-green" : "text-red-400"
                  )}
                >
                  {receiveAmount > 0
                    ? `$${receiveAmount.toFixed(2)} USDC`
                    : "Below minimum"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Destination address */}
      <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
            Solana Address
          </p>
          {privyAddress && !useOwnWallet && (
            <button
              onClick={() => {
                setUseOwnWallet(true);
                setAddress(privyAddress);
              }}
              className="text-[10px] text-violet/80 hover:text-violet font-medium transition-colors"
            >
              use my embedded wallet →
            </button>
          )}
          {privyAddress && useOwnWallet && (
            <button
              onClick={() => {
                setUseOwnWallet(false);
                setAddress("");
              }}
              className="text-[10px] text-white/40 hover:text-white/60 font-medium transition-colors"
            >
              use different address
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Paste your Solana address"
          value={useOwnWallet ? privyAddress : address}
          onChange={(e) => {
            if (useOwnWallet) setUseOwnWallet(false);
            setAddress(e.target.value);
          }}
          readOnly={useOwnWallet}
          className={cn(
            "w-full py-3 px-4 rounded-xl border text-sm font-mono placeholder:text-white/15 focus:outline-none transition-colors",
            useOwnWallet
              ? "bg-violet/[0.04] border-violet/20 text-white/70"
              : "bg-white/[0.03] border-white/[0.08] text-white/70 focus:border-violet/40"
          )}
        />
      </div>

      {/* Warning */}
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 flex items-start gap-2.5">
        <WarningIcon className="w-4 h-4 text-white/20 mt-0.5 shrink-0" />
        <p className="text-white/30 text-[11px] leading-relaxed">
          USDC will be sent on <strong className="text-white/40">Solana</strong>.
          Sending to another chain will result in lost funds.
          Minimum withdrawal: ${LIMITS.MIN_WITHDRAWAL.toFixed(2)}.
        </p>
      </div>

      {/* Withdraw button */}
      <button
        onClick={handleWithdraw}
        disabled={!isValid}
        className={cn(
          "w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all",
          isValid
            ? "bg-gradient-to-r from-violet to-magenta hover:opacity-90 active:scale-[0.99] shadow-[0_4px_20px_rgba(139,92,246,0.25)]"
            : "bg-white/[0.04] text-white/20 cursor-not-allowed"
        )}
      >
        {numAmount > 0 && numAmount < LIMITS.MIN_WITHDRAWAL
          ? `Minimum $${LIMITS.MIN_WITHDRAWAL.toFixed(2)}`
          : numAmount + fee > balance && numAmount > 0
            ? "Insufficient balance"
            : "Withdraw"}
      </button>
    </div>
  );
}

// ---- Icons ----

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
