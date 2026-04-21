import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * Critical:
 *  - X-Frame-Options / frame-ancestors: prevents /wallet clickjacking (the scariest
 *    vector — attacker iframes our wallet and tricks a logged-in user into
 *    approving a withdrawal via overlay).
 *  - HSTS: force HTTPS, 2 years, preload-eligible.
 *
 * CSP is shipped in Report-Only mode so we don't break Privy/PostHog/Supabase
 * before launch. Promote to enforcing after watching the report endpoint for a
 * few days with real traffic. `frame-ancestors 'none'` still applies via the
 * dedicated X-Frame-Options header (Report-Only mode doesn't enforce CSP, but
 * X-Frame-Options is its own header and IS enforced).
 */
const cspReportOnly = [
  "default-src 'self'",
  // Privy + PostHog + Solana RPCs + Resend + Fingerprint — all the third parties we load scripts or make network calls to.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.privy.io https://challenges.cloudflare.com https://*.posthog.com https://us-assets.i.posthog.com https://*.fpjs.io https://*.fptls.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.privy.io wss://*.privy.io https://*.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://*.supabase.co wss://*.supabase.co https://*.solana.com https://api.mainnet-beta.solana.com https://*.helius-rpc.com https://*.fpjs.io https://*.fptls.com https://*.fingerprint.com https://api.resend.com",
  "frame-src 'self' https://*.privy.io https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.14.0.175", "172.20.10.4"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
