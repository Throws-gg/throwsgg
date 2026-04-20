import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),

  NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(10).optional(),
  PRIVY_APP_SECRET: z.string().min(20).optional(),

  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_SESSION_SALT: z.string().min(32).optional(),

  CRON_SECRET: z.string().min(20).optional(),

  HOT_WALLET_PRIVATE_KEY: z.string().min(40).optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_IS_LIVE: z.enum(["true", "false"]).optional(),
});

const parsed = schema.parse(process.env);

const REQUIRED_IN_PROD = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SALT",
  "CRON_SECRET",
  "HOT_WALLET_PRIVATE_KEY",
] as const;

if (parsed.NODE_ENV === "production") {
  const missing = REQUIRED_IN_PROD.filter((k) => !parsed[k]);
  if (missing.length) {
    throw new Error(
      `Missing required env vars in production: ${missing.join(", ")}`
    );
  }
}

export const env = parsed;
export const isProd = parsed.NODE_ENV === "production";
