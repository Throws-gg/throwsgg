-- ============================================
-- Throws.gg Admin Infrastructure
-- ============================================
--
-- Adds columns and tables the admin panel needs:
--
-- 1. users.is_muted — chat-only suspension (separate from is_banned which
--    blocks everything). Mute = can bet but can't chat.
--
-- 2. system_flags — single-row key-value store for global toggles like
--    "races_paused". Cheap, simple, no migration thrashing.
--
-- 3. admin_actions — audit trail of every admin mutation. Every
--    balance adjust, ban, mute, race force-action gets logged here.
-- ============================================

-- ============================================
-- 1. Mute column on users
-- ============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_muted ON users(is_muted) WHERE is_muted = TRUE;

-- ============================================
-- 2. System flags (kv store for global toggles)
-- ============================================
CREATE TABLE IF NOT EXISTS system_flags (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id)
);

-- Seed default flags
INSERT INTO system_flags (key, value) VALUES
  ('races_paused', 'false'::jsonb),
  ('hot_wallet_balance', '0'::jsonb),
  ('max_bet_override', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 3. Admin action audit log
-- ============================================
-- Every destructive admin action (balance adjust, ban, mute, race control,
-- affiliate approve/terminate) writes a row here. Forever. Never delete.
CREATE TABLE IF NOT EXISTS admin_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES users(id),
  admin_username TEXT NOT NULL,

  action_type   TEXT NOT NULL,      -- 'balance_adjust', 'ban_user', 'mute_user', 'force_race', 'pause_races', 'delete_chat', 'affiliate_approve', etc.
  target_type   TEXT,                -- 'user', 'race', 'chat_message', 'affiliate_application', 'system'
  target_id     TEXT,                -- UUID or other identifier

  before_value  JSONB,               -- snapshot before change
  after_value   JSONB,               -- snapshot after change
  reason        TEXT,                -- admin-provided reason

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON admin_actions(action_type, created_at DESC);
