-- ============================================
-- Drop FK constraint on admin_actions.admin_id
-- ============================================
--
-- Admin auth is now password-based (not DB-role-based), so admin_id
-- no longer references a real user row. Keep the column as a text
-- identifier instead.
-- ============================================

-- Drop the FK constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_actions_admin_id_fkey'
      AND table_name = 'admin_actions'
  ) THEN
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_admin_id_fkey;
  END IF;
END $$;

-- Change admin_id to TEXT so we can store arbitrary identifiers
-- (e.g. "admin" for password-auth, or a real UUID if we ever add multiple admins)
ALTER TABLE admin_actions ALTER COLUMN admin_id TYPE TEXT;

-- Also rename for clarity
ALTER TABLE admin_actions RENAME COLUMN admin_id TO admin_identifier;
