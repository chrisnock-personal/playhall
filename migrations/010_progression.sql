-- Progression (#50): an admin puts a player on the ladder of games.
ALTER TABLE users ADD COLUMN progression BOOLEAN NOT NULL DEFAULT false;
