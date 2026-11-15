-- One row per player per finished game: the basis for leaderboards, a
-- player's stats and head-to-head records. Points: 3 win, 1 draw, 0 loss.
CREATE TABLE game_results (
  id           BIGSERIAL PRIMARY KEY,
  game_row_id  BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_id      TEXT NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat         TEXT NOT NULL,
  outcome      TEXT NOT NULL CHECK (outcome IN ('win', 'draw', 'loss')),
  points       SMALLINT NOT NULL,
  reason       TEXT NOT NULL,
  -- The other player in a two-player game, for head-to-head records.
  opponent_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- False for guests' games and rooms not set to count for the leaderboard.
  counted      BOOLEAN NOT NULL,
  ended_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_results_board_idx ON game_results (game_id, ended_at) WHERE counted;
CREATE INDEX game_results_user_idx ON game_results (user_id, ended_at DESC);

ALTER TABLE games ADD COLUMN aborted BOOLEAN NOT NULL DEFAULT false;

-- Demo data (npm run demo) is flagged so it can be removed cleanly.
ALTER TABLE users ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
