-- The default admin account (admin / admin) must choose a new password on its
-- first sign-in; nothing else works until it has.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
