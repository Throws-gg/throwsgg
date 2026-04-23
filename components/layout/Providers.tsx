"use client";

import { useCallback, useEffect } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/auth-context";
import { useUserStore } from "@/stores/userStore";
import { initPostHog, identify, resetAnalytics } from "@/lib/analytics/posthog";
import { getVisitorId } from "@/lib/fingerprint/client";
import { useGlobalBalancePoller } from "@/hooks/useGlobalBalancePoller";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const isConfigured = privyAppId && privyAppId !== "your_privy_app_id";

/**
 * Inside PrivyProvider: syncs auth state + provides login/logout actions.
 */
function PrivyAuthBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout: privyLogout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const setUser = useUserStore((s) => s.setUser);
  const clearUser = useUserStore((s) => s.logout);

  const syncUser = useCallback(async () => {
    if (!ready || !authenticated || !user) return;

    try {
      const token = await getAccessToken();

      // Pull referral code from localStorage (set by /r/[code] landing page)
      let referralCode: string | null = null;
      try {
        const stored = localStorage.getItem("throws_referral_code");
        const expiresStr = localStorage.getItem("throws_referral_code_expires");
        const expires = expiresStr ? parseInt(expiresStr, 10) : 0;
        if (stored && expires > Date.now()) {
          referralCode = stored;
        }
      } catch {
        // ignore
      }

      // Get FingerprintJS visitor ID (null if env var not set)
      const fingerprint = await getVisitorId();

      // Extract the user's email from Privy. Privy stores it on different
      // sub-objects per login method: `user.email` for email login, but
      // `user.google.email` for Google OAuth, `user.linkedAccounts[]` as a
      // catch-all. Check all of them so Google signups actually get emails.
      const googleAccount = user.google as { email?: string } | undefined;
      const linkedEmail = (user.linkedAccounts ?? [])
        .map((a) => {
          const acc = a as { type?: string; email?: string; address?: string };
          if (acc.type === "email") return acc.address;
          if (acc.type === "google_oauth") return acc.email;
          return null;
        })
        .find((e) => typeof e === "string" && e.length > 0);
      const email =
        user.email?.address ||
        googleAccount?.email ||
        linkedEmail ||
        null;

      // The Privy embedded Solana wallet — persisted server-side as the user's
      // deposit address. Write-once on the server (see /api/auth/sync).
      const solanaWallet = wallets.find(
        (w) => (w as unknown as { walletClientType?: string }).walletClientType === "privy" ||
               w.standardWallet?.name === "Privy"
      ) || wallets[0];
      const solanaAddress = solanaWallet?.address || null;

      const res = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ referralCode, fingerprint, email, solanaAddress }),
      });

      const data = await res.json();
      if (data.user) {
        setUser({
          userId: data.user.id,
          username: data.user.username,
          avatarUrl: null,
          balance: data.user.balance,
          bonusBalance: data.user.bonusBalance ?? 0,
          wageringRemaining: data.user.wageringRemaining ?? 0,
          bonusExpiresAt: data.user.bonusExpiresAt ?? null,
          totalWagered: data.user.totalWagered,
          totalProfit: data.user.totalProfit,
          referralCode: data.user.referralCode,
        });

        // Fire-and-forget: ensure the user's USDC ATA exists on-chain so
        // deposits from external wallets land instantly. Idempotent on the
        // server — no-op if the ATA already exists or was initialized before.
        // Costs ~0.002 SOL (hot wallet) per new user, one-time.
        fetch("/api/wallet/init-ata", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {
          // Safe to drop — the next /auth/sync tick retries.
        });

        // Identify the user in analytics. Raw money figures get bucketed
        // into tiers — PostHog holds segments, not balances. Keeps us safe
        // from PII-in-third-party-analytics for a licensed gambling product.
        const totalWagered = data.user.totalWagered || 0;
        const balance = data.user.balance || 0;
        const bonusBalance = data.user.bonusBalance || 0;
        const bucket = (v: number): string =>
          v <= 0 ? "zero"
          : v < 10 ? "under_10"
          : v < 100 ? "under_100"
          : v < 1000 ? "under_1k"
          : v < 10000 ? "under_10k"
          : "over_10k";
        const depositTier = totalWagered >= 10000 ? "whale"
          : totalWagered >= 1000 ? "medium"
          : totalWagered >= 100 ? "small"
          : "micro";

        identify(data.user.id, {
          username: data.user.username,
          total_wagered_tier: bucket(totalWagered),
          total_profit_tier: bucket(data.user.totalProfit || 0),
          current_balance_tier: bucket(balance),
          bonus_balance_tier: bucket(bonusBalance),
          has_active_bonus: bonusBalance > 0,
          wagering_remaining_tier: bucket(data.user.wageringRemaining || 0),
          deposit_tier: depositTier,
          referral_code: data.user.referralCode,
          device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
        });

        // If user was created with this referral, clear the stored code
        if (data.isNew && referralCode) {
          try {
            localStorage.removeItem("throws_referral_code");
            localStorage.removeItem("throws_referral_code_expires");
          } catch {
            // ignore
          }
        }

        // Surface the signup bonus result via a localStorage flag so the UI
        // can pop a congratulations modal on first page load after signup.
        if (data.isNew && data.signupBonus?.granted) {
          try {
            localStorage.setItem(
              "throws_signup_bonus_granted",
              JSON.stringify(data.signupBonus)
            );
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.error("Auth sync failed:", err);
    }
  }, [ready, authenticated, user, getAccessToken, setUser, wallets]);

  useEffect(() => {
    if (ready && authenticated && user) {
      initPostHog(); // Only load PostHog JS when user is authenticated
      syncUser();
    } else if (ready && !authenticated) {
      clearUser();
      resetAnalytics();
    }
  }, [ready, authenticated, user]);

  const handleLogout = useCallback(async () => {
    await privyLogout();
    clearUser();
    resetAnalytics();
  }, [privyLogout, clearUser]);

  // Global 20s balance + deposit poller. Runs anywhere in the app whenever
  // the user is authenticated — fixes the "balance doesn't update until
  // page refresh" bug on /racing, /profile, /horses, etc.
  useGlobalBalancePoller();

  return (
    <AuthProvider login={login} logout={handleLogout}>
      {children}
    </AuthProvider>
  );
}

function PrivyWrapper({ children }: { children: React.ReactNode }) {
  if (!isConfigured) {
    // Dev mode — no Privy, provide no-op auth actions
    return (
      <AuthProvider login={() => {}} logout={() => {}}>
        {children}
      </AuthProvider>
    );
  }

  // Skip Privy on non-localhost HTTP (mobile dev)
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.protocol !== "https:"
  ) {
    return (
      <AuthProvider login={() => {}} logout={() => {}}>
        {children}
      </AuthProvider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId!}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#8B5CF6",
        },
        // Solana-only: we're a Solana-native product. Dropping "wallet" removes
        // the Metamask/EVM footgun (user connects MM, signs in, has no Solana
        // embedded wallet, deposit address is wrong-chain). Email + Google
        // always mint a Solana embedded wallet via the Privy SDK.
        loginMethods: ["email", "google"],
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <PrivyAuthBridge>{children}</PrivyAuthBridge>
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyWrapper>
      <TooltipProvider>{children}</TooltipProvider>
    </PrivyWrapper>
  );
}
