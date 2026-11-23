// The platform settings page's API (/api/admin, admins only): settings for
// the whole Playhall, the TLS certificate, accounts (make or remove admins)
// and rooms (close any).

import { Router } from 'express';
import type { Auth } from './auth';
import type { Db } from './db';
import type { MediaConfig } from './media';
import type { RoomManager } from './rooms/manager';
import type { RoomSockets } from './ws';
import type { CertInfo } from './tls';
import { getPlatformSettings, updatePlatformSettings } from './platform';
import { checkModelServer } from './ai';
import { adminReportRoutes } from './reports';
import { loadProgression, reloadAllProgression } from './progression';
import { checkPlatformPatch, type AdminOverview, type AdminUser } from '../shared/platform';

/** The certificate being served and a way to replace it (null when TLS is off). */
export interface AdminTls {
  current(): CertInfo | null;
  /** Check the pair and serve it from now on; throws with a reason in words. */
  replace(certPem: string, keyPem: string): CertInfo;
}

export interface AdminTarget {
  id: string;
  kind: 'account' | 'guest';
  admin: boolean;
  /** Admin through ADMIN_USERNAMES. */
  envAdmin: boolean;
}

/** Why an admin can't make (or remove) this admin, or null when they can. */
export function adminChangeProblem(actorId: string, target: AdminTarget | null, makeAdmin: boolean, adminCount: number): string | null {
  if (!target) return 'No such account';
  if (target.kind !== 'account') return 'Guests can’t be admins: they need an account first';
  if (makeAdmin || !target.admin) return null;
  if (target.envAdmin) return 'This account is an admin through ADMIN_USERNAMES in the server’s settings: take it out of that list instead';
  if (adminCount <= 1) return target.id === actorId ? 'You’re the only admin: make someone else an admin first' : 'That’s the last admin';
  return null;
}

const PEM_MAX = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function adminRoutes(opts: { auth: Auth; db: Db; rooms: RoomManager; sockets: RoomSockets; media: MediaConfig | null; tls: AdminTls | null }): Router {
  const { auth, db, rooms, sockets, media, tls } = opts;
  const r = Router();
  r.use(auth.requireAdmin);
  r.use(adminReportRoutes(db));

  r.get('/', (_req, res) => {
    let cert: CertInfo | null = null;
    try { cert = tls?.current() ?? null; } catch { cert = null; }
    const body: AdminOverview = {
      settings: getPlatformSettings(),
      tls: cert,
      media: { configured: !!media, url: media?.url ?? null },
      envAdmins: [...auth.envAdmins],
    };
    res.json(body);
  });

  r.put('/settings', async (req, res) => {
    const checked = checkPlatformPatch(req.body);
    if ('error' in checked) { res.status(400).json({ error: checked.error }); return; }
    const settings = await updatePlatformSettings(checked.patch, req.user!.id);
    if (checked.patch.progression) await reloadAllProgression();
    // Open rooms see the change at once (e.g. the transcripts switch and notice).
    for (const room of rooms.loaded()) sockets.changed(room);
    console.log(`[admin] ${req.user!.name} changed ${Object.keys(checked.patch).join(', ')}`);
    res.json({ settings });
  });

  // AI players (#32): can the model server be reached, and does it have the model?
  r.post('/ai/check', async (_req, res) => {
    res.json(await checkModelServer());
  });

  // A new certificate (with any intermediates) and its private key, as PEM
  // text. The key is written to TLS_DIR and never sent back or logged.
  r.put('/tls', (req, res) => {
    if (!tls) { res.status(409).json({ error: 'This server runs plain HTTP (TLS=off), so there’s no certificate to replace' }); return; }
    const cert = req.body?.cert, key = req.body?.key;
    if (typeof cert !== 'string' || typeof key !== 'string' || !cert.trim() || !key.trim()) { res.status(400).json({ error: 'Paste or choose both the certificate and the private key' }); return; }
    if (cert.length > PEM_MAX || key.length > PEM_MAX) { res.status(400).json({ error: 'Those files are too big for a certificate and key' }); return; }
    try {
      const info = tls.replace(cert, key);
      console.log(`[admin] ${req.user!.name} replaced the TLS certificate`);
      res.json({ tls: info });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  r.get('/users', async (_req, res) => {
    const { rows } = await db.query<{ id: string; username: string; display_name: string; created_at: Date; last_seen_at: Date; played: number; progression: boolean }>(
      `SELECT u.id, u.username, u.display_name, u.created_at, u.last_seen_at, u.progression,
              (SELECT count(*) FROM game_results g WHERE g.user_id = u.id)::int AS played
         FROM users u WHERE u.kind = 'account'
        ORDER BY u.created_at LIMIT 2000`);
    const users: AdminUser[] = rows.map((u) => ({
      id: u.id, username: u.username, name: u.display_name,
      createdAt: new Date(u.created_at).toISOString(), lastSeenAt: new Date(u.last_seen_at).toISOString(),
      admin: auth.isAdmin(u.id), envAdmin: auth.envAdmins.has(u.username), played: u.played, progression: u.progression,
    }));
    res.json({ users });
  });

  r.put('/users/:id/admin', async (req, res) => {
    const id = String(req.params.id);
    const makeAdmin = req.body?.admin;
    if (typeof makeAdmin !== 'boolean') { res.status(400).json({ error: 'Say whether the account should be an admin' }); return; }
    const { rows } = UUID.test(id)
      ? await db.query<{ id: string; kind: 'account' | 'guest'; username: string | null }>('SELECT id, kind, username FROM users WHERE id = $1', [id])
      : { rows: [] };
    const row = rows[0];
    const target: AdminTarget | null = row
      ? { id: row.id, kind: row.kind, admin: auth.isAdmin(row.id), envAdmin: !!row.username && auth.envAdmins.has(row.username) }
      : null;
    const problem = adminChangeProblem(req.user!.id, target, makeAdmin, auth.adminCount);
    if (problem) { res.status(target ? 400 : 404).json({ error: problem }); return; }
    await db.query('UPDATE users SET is_admin = $2 WHERE id = $1', [id, makeAdmin]);
    auth.setAdmin(id, makeAdmin || target!.envAdmin);
    console.log(`[admin] ${req.user!.name} ${makeAdmin ? 'made' : 'removed'} admin ${id}`);
    res.json({ admin: auth.isAdmin(id) });
  });

  r.put('/users/:id/progression', async (req, res) => {
    const id = String(req.params.id);
    const on = req.body?.progression;
    if (typeof on !== 'boolean') { res.status(400).json({ error: 'Say whether the account should be on the ladder' }); return; }
    if (!UUID.test(id)) { res.status(404).json({ error: 'No such account' }); return; }
    if (on && auth.isAdmin(id)) { res.status(400).json({ error: 'Admins can’t be put on the ladder' }); return; }
    const { rowCount } = await db.query(`UPDATE users SET progression = $2 WHERE id = $1 AND kind = 'account'`, [id, on]);
    if (!rowCount) { res.status(404).json({ error: 'No such account' }); return; }
    await loadProgression(id);
    // Open rooms recheck what this player may do.
    for (const room of rooms.loaded()) sockets.changed(room);
    console.log(`[admin] ${req.user!.name} ${on ? 'put' : 'took'} ${id} ${on ? 'on' : 'off'} the progression ladder`);
    res.json({ progression: on });
  });

  r.get('/rooms', async (_req, res) => {
    res.json({ rooms: await rooms.adminList() });
  });

  r.delete('/rooms/:code', async (req, res) => {
    const room = await rooms.get(String(req.params.code));
    if (!room) { res.status(404).json({ error: 'No such room (it may be closed already)' }); return; }
    await rooms.closeAsAdmin(room.rec.code);
    sockets.closeRoom(room, true);
    console.log(`[admin] ${req.user!.name} closed room ${room.rec.code}`);
    res.status(204).end();
  });

  return r;
}
