-- Private rooms: a bcrypt hash of the host's room password, or NULL for none.
-- Never sent to browsers; joining needs a pass from POST /api/rooms/:code/pass.
ALTER TABLE rooms ADD COLUMN password_hash TEXT;
