-- Reports (#21): a player reports a room or a person; admins see them.
CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  reporter     TEXT NOT NULL,
  room_code    TEXT NOT NULL,
  room_name    TEXT NOT NULL,
  -- Who was reported (null: the room itself).
  target_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  target_name  TEXT,
  reason       TEXT NOT NULL CHECK (reason IN ('rude', 'cheating', 'spam', 'other')),
  details      TEXT NOT NULL DEFAULT '',
  -- The room's chat when the report was made, for context.
  chat         JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT,
  note         TEXT
);
CREATE INDEX reports_open_idx ON reports (created_at DESC) WHERE resolved_at IS NULL;
