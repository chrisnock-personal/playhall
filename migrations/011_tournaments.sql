-- Tournaments (#17): the entry list, rounds and results live in data (JSONB).
CREATE TABLE tournaments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  game_id       TEXT NOT NULL,
  organiser_id  UUID NOT NULL REFERENCES users(id),
  organiser     TEXT NOT NULL,
  config        JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'signup' CHECK (status IN ('signup', 'running', 'done')),
  data          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tournaments_status_idx ON tournaments (status, updated_at DESC);
