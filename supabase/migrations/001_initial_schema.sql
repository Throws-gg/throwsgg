-- ============================================
-- Throws.gg — Initial Database Schema
-- ============================================

-- ENUMS
CREATE TYPE user_role AS ENUM ('player', 'admin');
CREATE TYPE move AS ENUM ('rock', 'paper', 'scissors');
CREATE TYPE round_status AS ENUM ('betting', 'locked', 'playing', 'settled');
CREATE TYPE round_result AS ENUM ('violet_win', 'magenta_win', 'draw');
CREATE TYPE bet_type AS ENUM ('rock', 'paper', 'scissors', 'draw', 'violet', 'magenta');
CREATE TYPE bet_category AS ENUM ('move', 'player');
CREATE TYPE bet_status AS ENUM ('pending', 'won', 'lost', 'push', 'cancelled');
CREATE TYPE tx_type AS ENUM ('deposit', 'withdrawal', 'bet', 'payout', 'push_refund', 'bonus');
CREATE TYPE tx_status AS ENUM ('pending', 'confirmed', 'failed');

-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id        TEXT UNIQUE NOT NULL,
  wallet_address  TEXT UNIQUE,
  username        TEXT UNIQUE NOT NULL,
  avatar_url      TEXT,
  balance         NUMERIC(18, 8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_wagered   NUMERIC(18, 8) NOT NULL DEFAULT 0,
  total_profit    NUMERIC(18, 8) NOT NULL DEFAULT 0,
  role            user_role NOT NULL DEFAULT 'player',
  is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
  self_excluded_until TIMESTAMPTZ,
  deposit_limit_daily   NUMERIC(18, 8),
  deposit_limit_weekly  NUMERIC(18, 8),
  deposit_limit_monthly NUMERIC(18, 8),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ROUNDS
-- ============================================
CREATE TABLE rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number    BIGINT UNIQUE NOT NULL,
  status          round_status NOT NULL DEFAULT 'betting',

  violet_move     move,
  magenta_move    move,
  result          round_result,
  winning_move    move,

  server_seed     TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  client_seed     TEXT NOT NULL DEFAULT 'throws.gg',
  nonce           BIGINT NOT NULL,

  total_bet_amount  NUMERIC(18, 8) NOT NULL DEFAULT 0,
  total_payout      NUMERIC(18, 8) NOT NULL DEFAULT 0,
  house_profit      NUMERIC(18, 8) NOT NULL DEFAULT 0,
  bet_count         INT NOT NULL DEFAULT 0,

  betting_opens_at  TIMESTAMPTZ NOT NULL,
  betting_closes_at TIMESTAMPTZ NOT NULL,
  played_at         TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rounds_status ON rounds(status);
CREATE INDEX idx_rounds_round_number ON rounds(round_number DESC);

-- ============================================
-- BETS
-- ============================================
CREATE TABLE bets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  round_id        UUID NOT NULL REFERENCES rounds(id),
  bet_type        bet_type NOT NULL,
  bet_category    bet_category NOT NULL,
  amount          NUMERIC(18, 8) NOT NULL CHECK (amount > 0),
  multiplier      NUMERIC(10, 4) NOT NULL,
  payout          NUMERIC(18, 8),
  status          bet_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ,

  UNIQUE(user_id, round_id, bet_category)
);

CREATE INDEX idx_bets_user ON bets(user_id, created_at DESC);
CREATE INDEX idx_bets_round ON bets(round_id);

-- ============================================
-- TRANSACTIONS
-- ============================================
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            tx_type NOT NULL,
  amount          NUMERIC(18, 8) NOT NULL,
  balance_after   NUMERIC(18, 8) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          tx_status NOT NULL DEFAULT 'pending',
  tx_hash         TEXT,
  address         TEXT,
  round_id        UUID REFERENCES rounds(id),
  bet_id          UUID REFERENCES bets(id),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);

CREATE INDEX idx_tx_user ON transactions(user_id, created_at DESC);
CREATE INDEX idx_tx_hash ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;

-- ============================================
-- CHAT MESSAGES
-- ============================================
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  username        TEXT NOT NULL,
  message         TEXT NOT NULL CHECK (char_length(message) <= 500),
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_created ON chat_messages(created_at DESC);

-- ============================================
-- DEPOSIT ADDRESSES
-- ============================================
CREATE TABLE deposit_addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  chain           TEXT NOT NULL,
  address         TEXT NOT NULL UNIQUE,
  derivation_index INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, chain)
);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Atomic balance update with transaction logging
CREATE OR REPLACE FUNCTION update_balance(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type tx_type,
  p_currency TEXT DEFAULT 'USD',
  p_round_id UUID DEFAULT NULL,
  p_bet_id UUID DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE users
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id AND balance + p_amount >= 0
  RETURNING balance INTO new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance or user not found';
  END IF;

  INSERT INTO transactions (user_id, type, amount, balance_after, currency, status, round_id, bet_id, tx_hash, address, metadata, confirmed_at)
  VALUES (p_user_id, p_type, p_amount, new_balance, p_currency, 'confirmed', p_round_id, p_bet_id, p_tx_hash, p_address, p_metadata, NOW());

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- Settle all bets for a round
CREATE OR REPLACE FUNCTION settle_round(
  p_round_id UUID,
  p_violet_move move,
  p_magenta_move move,
  p_result round_result,
  p_winning_move move,
  p_server_seed TEXT
) RETURNS void AS $$
DECLARE
  bet RECORD;
  payout_amount NUMERIC;
  bet_result bet_status;
BEGIN
  UPDATE rounds SET
    status = 'settled',
    violet_move = p_violet_move,
    magenta_move = p_magenta_move,
    result = p_result,
    winning_move = p_winning_move,
    server_seed = p_server_seed,
    played_at = NOW(),
    settled_at = NOW()
  WHERE id = p_round_id;

  FOR bet IN SELECT * FROM bets WHERE round_id = p_round_id AND status = 'pending' LOOP
    IF bet.bet_category = 'move' THEN
      IF (bet.bet_type = 'draw' AND p_result = 'draw')
         OR (bet.bet_type = 'rock' AND p_winning_move = 'rock')
         OR (bet.bet_type = 'paper' AND p_winning_move = 'paper')
         OR (bet.bet_type = 'scissors' AND p_winning_move = 'scissors')
      THEN
        bet_result := 'won';
        payout_amount := bet.amount * bet.multiplier;
      ELSE
        bet_result := 'lost';
        payout_amount := 0;
      END IF;
    ELSE
      IF p_result = 'draw' THEN
        bet_result := 'push';
        payout_amount := bet.amount;
      ELSIF (bet.bet_type = 'violet' AND p_result = 'violet_win')
            OR (bet.bet_type = 'magenta' AND p_result = 'magenta_win')
      THEN
        bet_result := 'won';
        payout_amount := bet.amount * bet.multiplier;
      ELSE
        bet_result := 'lost';
        payout_amount := 0;
      END IF;
    END IF;

    UPDATE bets SET
      status = bet_result,
      payout = payout_amount,
      settled_at = NOW()
    WHERE id = bet.id;

    IF payout_amount > 0 THEN
      PERFORM update_balance(
        bet.user_id,
        payout_amount,
        CASE WHEN bet_result = 'push' THEN 'push_refund' ELSE 'payout' END,
        'USD',
        p_round_id,
        bet.id
      );
    END IF;

    UPDATE rounds SET
      total_payout = total_payout + payout_amount
    WHERE id = p_round_id;
  END LOOP;

  UPDATE rounds SET
    house_profit = total_bet_amount - total_payout
  WHERE id = p_round_id;
END;
$$ LANGUAGE plpgsql;
