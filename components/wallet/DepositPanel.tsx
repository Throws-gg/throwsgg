"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { useDepositMonitor } from "@/hooks/useDepositMonitor";
import { track } from "@/lib/analytics/posthog";
import { cn } from "@/lib/utils";

export function DepositPanel() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"buy" | "send">("buy");

  const solanaWallet = wallets.find(
    (w) => (w as unknown as { walletClientType?: string }).walletClientType === "privy" ||
           w.standardWallet?.name === "Privy"
  ) || wallets[0];
  const walletAddress = solanaWallet?.address;

  // Monitor for incoming deposits
  const { lastDeposit, checking, refresh } = useDepositMonitor(walletAddress || null);

  // Track when the deposit panel is viewed
  const trackedRef = useRef(false);
  useEffect(() => {
    if (walletAddress && !trackedRef.current) {
      trackedRef.current = true;
      track("deposit_initiated", { method: activeTab });
    }
  }, [walletAddress, activeTab]);

  const handleBuyWithCard = useCallback(() => {
    if (!walletAddress) return;
    track("deposit_buy_clicked", { method: "card", wallet_address: walletAddress });
    fundWallet({ address: walletAddress });
  }, [walletAddress, fundWallet]);

  const handleCopyAddress = useCallback(() => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    track("deposit_address_copied", { wallet_address: walletAddress });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  if (!ready || !authenticated) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-8 text-center">
        <p className="text-white/40 text-sm">Sign in to deposit</p>
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-8 text-center">
        <div className="w-5 h-5 border-2 border-violet/40 border-t-violet rounded-full animate-spin mx-auto mb-3" />
        <p className="text-white/40 text-sm">Setting up your wallet...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
        <button
          onClick={() => setActiveTab("buy")}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            activeTab === "buy"
              ? "bg-white/[0.08] text-white shadow-sm"
              : "text-white/40 hover:text-white/60"
          )}
        >
          Buy with Card
        </button>
        <button
          onClick={() => setActiveTab("send")}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
            activeTab === "send"
              ? "bg-white/[0.08] text-white shadow-sm"
              : "text-white/40 hover:text-white/60"
          )}
        >
          Send Crypto
        </button>
      </div>

      {/* Deposit detected notification */}
      {lastDeposit && Date.now() - lastDeposit.timestamp < 30_000 && (
        <div className="rounded-xl border border-green/20 bg-green/[0.05] px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green/15 flex items-center justify-center shrink-0">
            <span className="text-green text-sm">✓</span>
          </div>
          <div>
            <p className="text-green text-sm font-semibold">
              +${lastDeposit.amount.toFixed(2)} deposited
            </p>
            <p className="text-white/30 text-[10px]">
              Balance updated automatically
            </p>
          </div>
        </div>
      )}

      {/* Monitoring indicator */}
      {activeTab === "send" && checking && (
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
          <span className="text-white/25 text-[10px]">Monitoring for deposits...</span>
        </div>
      )}

      {/* Buy with card */}
      {activeTab === "buy" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#11111a] p-6 space-y-5">
            <div className="text-center space-y-1">
              <h3 className="text-white font-semibold">Purchase USDC</h3>
              <p className="text-white/35 text-xs">
                Instantly fund your account with a card, Apple Pay, or Google Pay
              </p>
            </div>

            <button
              onClick={handleBuyWithCard}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet to-magenta text-white font-bold text-sm
                         hover:opacity-90 active:scale-[0.99] transition-all
                         shadow-[0_4px_20px_rgba(139,92,246,0.25)]"
            >
              Buy USDC
            </button>

            <div className="flex items-center justify-center gap-6 pt-1">
              <span className="text-white/25 text-[10px] flex items-center gap-1.5">
                <CreditCardIcon />
                Card
              </span>
              <span className="text-white/25 text-[10px] flex items-center gap-1.5">
                <AppleIcon />
                Apple Pay
              </span>
              <span className="text-white/25 text-[10px] flex items-center gap-1.5">
                <BankIcon />
                Bank
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 flex items-start gap-2.5">
            <ShieldIcon className="w-4 h-4 text-white/20 mt-0.5 shrink-0" />
            <p className="text-white/30 text-[11px] leading-relaxed">
              Payments are processed securely by MoonPay. Minimum purchase $25 USD.
              Funds typically arrive within 2 minutes.
            </p>
          </div>
        </div>
      )}

      {/* Send crypto */}
      {activeTab === "send" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#14141f] to-[#11111a] p-6 space-y-5">
            <div className="text-center space-y-1">
              <h3 className="text-white font-semibold">Deposit Address</h3>
              <p className="text-white/35 text-xs">
                Send USDC or SOL on the Solana network
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-3 bg-white rounded-xl">
                <QRCodeSVG
                  value={walletAddress}
                  size={140}
                  bgColor="#ffffff"
                  fgColor="#0A0A0F"
                  level="M"
                />
              </div>
            </div>

            {/* Address */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
              <p className="font-mono text-[11px] text-white/60 break-all leading-relaxed text-center select-all">
                {walletAddress}
              </p>
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopyAddress}
              className={cn(
                "w-full py-3 rounded-xl text-sm font-semibold transition-all border",
                copied
                  ? "bg-green/10 border-green/20 text-green"
                  : "bg-white/[0.04] border-white/[0.08] text-white hover:bg-white/[0.06] active:scale-[0.99]"
              )}
            >
              {copied ? "✓ Copied to clipboard" : "Copy Address"}
            </button>
          </div>

          {/* Supported tokens */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#12121a] p-4 space-y-3">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">
              Supported Tokens
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#2775ca]/15 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#2775ca]">$</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">USDC</p>
                    <p className="text-[10px] text-white/25">Recommended</p>
                  </div>
                </div>
                <span className="text-[10px] text-white/20 bg-white/[0.04] px-2 py-0.5 rounded">Solana</span>
              </div>
              <div className="border-t border-white/[0.04]" />
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#9945FF]/15 to-[#14F195]/15 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-[#9945FF]">◎</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">SOL</p>
                    <p className="text-[10px] text-white/25">Auto-converts to USD</p>
                  </div>
                </div>
                <span className="text-[10px] text-white/20 bg-white/[0.04] px-2 py-0.5 rounded">Solana</span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.03] px-4 py-3 flex items-start gap-2.5">
            <WarningIcon className="w-4 h-4 text-amber-500/40 mt-0.5 shrink-0" />
            <p className="text-amber-500/50 text-[11px] leading-relaxed">
              Only send assets on the <strong className="text-amber-500/70">Solana</strong> network.
              Sending on other networks will result in permanent loss of funds.
              Minimum deposit: $1.00
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Icons ----

function CreditCardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="22" height="16" x="1" y="4" rx="2" />
      <line x1="1" x2="23" y1="10" y2="10" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83" />
      <path d="M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
