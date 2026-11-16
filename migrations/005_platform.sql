-- Admins: accounts named in ADMIN_USERNAMES are always admins; this flag is
-- for accounts an admin made admin on the platform settings page.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

-- Platform settings (the admin page): one row per setting, the value as JSON.
-- A setting with no row has its default (see src/shared/platform.ts).
CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);
