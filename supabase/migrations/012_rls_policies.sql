-- ============================================
-- 012_rls_policies.sql
--
-- Enable Row-Level Security on every user-facing table and add policies
-- that reflect our actual access pattern:
--
--   1. ALL writes go through API routes using the service-role key
--      (createAdminClient). Service-role bypasses RLS, so API writes
--      continue to work.
--
--   2. The browser uses the anon key for two things:
--        a) Reading chat_messages (public read)
--        b) Subscribing to realtime channels for chat_messages + rounds
--
--   3. Every other table must be LOCKED from the anon role. If someone
--      grabs the public URL + anon key they should see NOTHING.
--
-- Strategy: enable RLS on every table, add SELECT policies only where
-- the browser legitimately needs to read. No INSERT/UPDATE/DELETE
-- policies — those are intentionally blocked for anon.
-- ============================================

-- -----------------------------------------------------
-- Tables that must be fully locked from anon
-- -----------------------------------------------------

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_bets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist        ENABLE ROW LEVEL SECURITY;

-- No policies added — anon gets zero access. Service-role continues to
-- bypass RLS, so API routes are unaffected.

-- -----------------------------------------------------
-- Tables the browser needs to READ (no writes)
-- -----------------------------------------------------

-- chat_messages: anon reads the public chat feed
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_anon_read" ON chat_messages;
CREATE POLICY "chat_messages_anon_read"
  ON chat_messages FOR SELECT
  TO anon, authenticated
  USING (true);

-- rounds: realtime subscription for RPS game state (read-only)
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rounds_anon_read" ON rounds;
CREATE POLICY "rounds_anon_read"
  ON rounds FOR SELECT
  TO anon, authenticated
  USING (true);

-- -----------------------------------------------------
-- Racing tables — currently only accessed via API routes,
-- but we enable RLS anyway as defense-in-depth. If the UI
-- ever needs direct reads (leaderboard, recent winners),
-- add a SELECT policy here.
-- -----------------------------------------------------

ALTER TABLE horses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE races         ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_entries  ENABLE ROW LEVEL SECURITY;

-- Horses, races, and race_entries are intentionally read-only for anon
-- because the /api/race/state and /api/race/horses endpoints already
-- expose them publicly via the service-role key. Keeping them locked
-- at the DB layer means the anon key cannot bypass our rate-limiting or
-- pre-processing logic in those endpoints.

-- -----------------------------------------------------
-- Notes for future RLS work
-- -----------------------------------------------------
--
-- If we later want users to read their own balance directly from the
-- browser (instead of going through /api/user/me), we'd add:
--
--   CREATE POLICY "users_read_own" ON users FOR SELECT TO authenticated
--     USING (privy_id = auth.jwt() ->> 'sub');
--
-- But that requires wiring Supabase Auth to Privy JWTs, which we don't
-- do today. Leave it for a post-launch follow-up.
