-- Accounts and guests. A guest is a row with just a display name; it can
-- watch and (if the room allows) play, but can't host.
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('account', 'guest')),
  username      TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind = 'guest' OR (username IS NOT NULL AND password_hash IS NOT NULL))
);

-- A room keeps its seats and the current game here, so a restart picks up
-- where it left off.
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  host_id     UUID NOT NULL REFERENCES users(id),
  settings    JSONB NOT NULL,
  seats       JSONB NOT NULL DEFAULT '{}',
  game        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX rooms_open_idx ON rooms (updated_at DESC) WHERE closed_at IS NULL;

CREATE TABLE chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  line_id     INTEGER NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('table', 'gallery')),
  kind        TEXT NOT NULL CHECK (kind IN ('typed', 'system')),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_room_idx ON chat_messages (room_id, line_id);

-- Finished games, for history.
CREATE TABLE games (
  id          BIGSERIAL PRIMARY KEY,
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_id     TEXT NOT NULL,
  players     JSONB NOT NULL,
  result      JSONB NOT NULL,
  state       JSONB NOT NULL,
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX games_room_idx ON games (room_id, ended_at DESC);
