-- The camera table (phase 2.4): any real board game, under a name the host
-- types. Results are filed under that name for a leaderboard per game name.
--   game_name: as typed (tidied), shown on the leaderboard tab
--   game_key:  the same name normalised (case-folded), what results group by
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS game_name TEXT;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS game_key TEXT;
CREATE INDEX IF NOT EXISTS game_results_name_idx ON game_results (game_id, game_key, ended_at) WHERE counted AND game_key IS NOT NULL;

-- The room's table camera: the random id in the link the host made for the
-- device filming the board ({ id, since }), or null. Never sent to browsers.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS table_camera JSONB;
