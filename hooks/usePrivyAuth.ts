"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useUserStore } from "@/stores/userStore";

const isConfigured =
  process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
  process.env.NEXT_PUBLIC_PRIVY_APP_ID !== "your_privy_app_id";

/**
 * Wrapper around usePrivy that also handles logout from our user store.
 * Must be called inside PrivyProvider.
 */
export function usePrivyAuth() {
  const { ready, authenticated, login, logout: privyLogout, getAccessToken } = usePrivy();

  const handleLogout = useCallback(async () => {
    await privyLogout();
    useUserStore.getState().logout();
  }, [privyLogout]);

  return {
    ready,
    authenticated,
    login,
    logout: handleLogout,
    getToken: getAccessToken,
    isPrivyConfigured: !!isConfigured,
  };
}
