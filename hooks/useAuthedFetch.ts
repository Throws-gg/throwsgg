"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Wraps fetch with a Privy Bearer token in the Authorization header.
 *
 * Usage:
 *   const authedFetch = useAuthedFetch();
 *   const res = await authedFetch("/api/race/bet", { method: "POST", body: ... });
 *
 * In dev mode (no Privy configured), falls back to plain fetch — the API routes
 * accept userId from the body via verifyRequest's dev fallback.
 */
export function useAuthedFetch() {
  const { getAccessToken } = usePrivy();

  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch {
        // Not logged in with Privy (dev mode) — proceed without token
      }

      const headers = new Headers(init.headers || {});
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(input, { ...init, headers });
    },
    [getAccessToken]
  );
}
