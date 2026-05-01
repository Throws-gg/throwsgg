-- ============================================
-- Post-012 RLS lockdown
-- ============================================
--
-- Migration 012 enabled RLS on the tables that existed at the time and left
-- direct browser/anon access locked down by default. Later migrations created
-- new operational/economics tables without repeating that lockdown.
--
-- All application writes/reads for these tables go through Next API routes or
-- server components using the Supabase service-role key, so anon/authenticated
-- clients should have zero direct PostgREST access.
-- ============================================

-- Enable and force RLS on every table created after migration 012.
ALTER TABLE public.bonus_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonus_config FORCE ROW LEVEL SECURITY;

ALTER TABLE public.affiliate_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_periods FORCE ROW LEVEL SECURITY;

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks FORCE ROW LEVEL SECURITY;

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_applications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.vanity_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vanity_slugs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.system_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_flags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log FORCE ROW LEVEL SECURITY;

ALTER TABLE public.daily_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_claims FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rakeback_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rakeback_accruals FORCE ROW LEVEL SECURITY;

-- Remove direct table access from public API roles. Service-role keeps access
-- for API routes and server components.
REVOKE ALL ON TABLE
  public.bonus_config,
  public.affiliate_periods,
  public.affiliate_clicks,
  public.affiliate_applications,
  public.vanity_slugs,
  public.system_flags,
  public.admin_actions,
  public.email_log,
  public.daily_claims,
  public.rakeback_accruals
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.bonus_config,
  public.affiliate_periods,
  public.affiliate_clicks,
  public.affiliate_applications,
  public.vanity_slugs,
  public.system_flags,
  public.admin_actions,
  public.email_log,
  public.daily_claims,
  public.rakeback_accruals
TO service_role;

-- affiliate_clicks uses BIGSERIAL; keep the sequence server-only too.
REVOKE ALL ON SEQUENCE public.affiliate_clicks_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.affiliate_clicks_id_seq TO service_role;

-- Lock down direct RPC execution from anon/authenticated as defense-in-depth.
-- The app calls RPCs through createAdminClient() with the service-role key.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Default future objects to the same posture. If a future table or RPC is
-- intentionally public, its migration must explicitly grant access and add an
-- RLS policy.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
