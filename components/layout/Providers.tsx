"use client";

import { useCallback, useEffect } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/auth-context";
import { useUserStore } from "@/stores/userStore";
import { initPostHog, identify, resetAnalytics } from "@/lib/analytics/posthog";
import { getVisitorId } from "@/lib/fingerprint/client";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const isConfigured = privyAppId && privyAppId !== "your_privy_app_id";

/**
 * Inside PrivyProvider: syncs auth state + provides login/logout actions.
 */
function PrivyAuthBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout: privyLogout, getAccessToken } = usePrivy();
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

      // Extract the user's email from Privy if available
      const email = user.email?.address || null;

      const res = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ referralCode, fingerprint, email }),
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

        // Identify the user in analytics
        identify(data.user.id, {
          username: data.user.username,
          total_wagered: data.user.totalWagered,
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
  }, [ready, authenticated, user, getAccessToken, setUser]);

  useEffect(() => {
    if (ready && authenticated && user) {
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
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
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
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <PrivyWrapper>
      <TooltipProvider>{children}</TooltipProvider>
    </PrivyWrapper>
  );
}
