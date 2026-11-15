-- People the host has removed from a room; they can't come back in.
ALTER TABLE rooms ADD COLUMN banned JSONB NOT NULL DEFAULT '[]';
