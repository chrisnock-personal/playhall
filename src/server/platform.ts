// Platform settings, loaded from the database at startup and kept in memory:
// getPlatformSettings() is synchronous, so any code can check a setting
// without a query. Changes go through updatePlatformSettings(), which saves
// them and updates the cache. One server process, so the cache is the truth.

import type { Db } from './db';
import {
  applyPatch, defaultPlatformSettings, mergePlatformSettings,
  type PlatformPatch, type PlatformSettings,
} from '../shared/platform';

let current: PlatformSettings = defaultPlatformSettings();
let db: Db | null = null;

/** The settings now (the defaults until loadPlatformSettings has run). */
export function getPlatformSettings(): PlatformSettings {
  return current;
}

/** Read the stored settings over the defaults; `env` holds defaults from the
 *  environment (ALLOW_SIGNUP), which a stored value overrides once set. */
export async function loadPlatformSettings(pool: Db, env: { signupsAllowed?: boolean } = {}): Promise<PlatformSettings> {
  db = pool;
  const { rows } = await pool.query<{ key: string; value: unknown }>('SELECT key, value FROM platform_settings');
  current = mergePlatformSettings(defaultPlatformSettings(env), Object.fromEntries(rows.map((r) => [r.key, r.value])));
  return current;
}

/** Save a checked patch (see checkPlatformPatch) and return the new settings. */
export async function updatePlatformSettings(patch: PlatformPatch, by: string | null = null): Promise<PlatformSettings> {
  if (!db) throw new Error('Platform settings are not loaded');
  const next = applyPatch(structuredClone(current), patch);
  // Store each changed top-level key whole (roomDefaults as one object).
  const rows: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof PlatformSettings)[]) rows[key] = next[key];
  if (Object.keys(rows).length) {
    await db.query(
      `INSERT INTO platform_settings (key, value, updated_by)
       SELECT key, value, $2::uuid FROM jsonb_each($1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify(rows), by]);
  }
  current = next;
  return current;
}

/** For tests: put the cache back to the defaults. */
export function resetPlatformSettingsForTests(s: PlatformSettings = defaultPlatformSettings()): void {
  current = s;
  db = null;
}
