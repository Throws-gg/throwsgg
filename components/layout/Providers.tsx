"use client";

import { useCallback, useEffect } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/auth-context";
import { useUserStore } from "@/stores/userStore";

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
      const res = await fetch("/api/auth/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (data.user) {
        setUser({
          userId: data.user.id,
          username: data.user.username,
          avatarUrl: null,
          balance: data.user.balance,
          totalWagered: data.user.totalWagered,
          totalProfit: data.user.totalProfit,
        });
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
    }
  }, [ready, authenticated, user]);

  const handleLogout = useCallback(async () => {
    await privyLogout();
    clearUser();
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
  return (
    <PrivyWrapper>
      <TooltipProvider>{children}</TooltipProvider>
    </PrivyWrapper>
  );
}
