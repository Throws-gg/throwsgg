"use client";

import posthog from "posthog-js";

let initialized = false;

/**
 * Initialize PostHog once in the browser. No-op if env vars aren't set
 * (dev mode) or if we're on the server.
 */
export function initPostHog() {
  if (typeof window === "undefined") return;
  if (initialized) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key || key === "your_posthog_key") return;

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: "identified_only", // only create profiles after login
    loaded: () => {
      initialized = true;
    },
  });
}

/**
 * Track a custom event. Safe to call before PostHog is initialized —
 * calls will just be dropped.
 */
export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // ignore analytics errors
  }
}

/**
 * Identify the logged-in user. Called from Providers after auth sync.
 */
export function identify(userId: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  try {
    posthog.identify(userId, properties);
  } catch {
    // ignore
  }
}

/**
 * Reset on logout.
 */
export function resetAnalytics() {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}
