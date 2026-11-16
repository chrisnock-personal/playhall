// Local accounts (username + password) and guests (just a display name).
// Both get the same kind of session token; a guest's says guest: true.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Db } from './db';
import type { SessionUser } from '../shared/protocol';
import { getPlatformSettings } from './platform';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: SessionUser }
  }
}

const ACCOUNT_TTL = '30d';
const GUEST_TTL = '7d';

export class Auth {
  /** Usernames made admin by ADMIN_USERNAMES (lower case). */
  readonly envAdmins: ReadonlySet<string>;
  /** Ids of every admin account, from the database and ADMIN_USERNAMES, so
   *  checking a session needs no query. Kept current by setAdmin(). */
  private admins = new Set<string>();

  constructor(private db: Db, private secret: string, adminUsernames: string[] = []) {
    this.envAdmins = new Set(adminUsernames.map((u) => u.trim().toLowerCase()).filter(Boolean));
  }

  /** Read who the admins are (at startup). */
  async loadAdmins(): Promise<void> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE kind = 'account' AND (is_admin OR username = ANY($1))`, [[...this.envAdmins]]);
    this.admins = new Set(rows.map((r) => r.id));
  }

  isAdmin(userId: string): boolean {
    return this.admins.has(userId);
  }

  get adminCount(): number {
    return this.admins.size;
  }

  /** Update the cache after the is_admin column changed. */
  setAdmin(userId: string, on: boolean): void {
    if (on) this.admins.add(userId); else this.admins.delete(userId);
  }

  sign(user: SessionUser): string {
    return jwt.sign({ name: user.name, guest: user.guest }, this.secret, {
      subject: user.id,
      expiresIn: user.guest ? GUEST_TTL : ACCOUNT_TTL,
    });
  }

  verify(token: string | null | undefined): SessionUser | null {
    if (!token) return null;
    try {
      const p = jwt.verify(token, this.secret) as jwt.JwtPayload & { name: string; guest: boolean; scope?: string };
      if (!p.sub || typeof p.name !== 'string' || p.scope) return null;
      return { id: p.sub, name: p.name, guest: !!p.guest, admin: !p.guest && this.admins.has(p.sub) };
    } catch {
      return null;
    }
  }

  // ---- private rooms ----
  // A correct room password gets a pass for that room and person, tied to the
  // current password: changing the password makes every old pass invalid.

  signRoomPass(userId: string, code: string, passwordHash: string): string {
    return jwt.sign({ scope: 'room-pass', room: code, pv: fingerprint(passwordHash) }, this.secret, { subject: userId, expiresIn: '7d' });
  }

  verifyRoomPass(token: string | null, userId: string, code: string, passwordHash: string): boolean {
    if (!token) return false;
    try {
      const p = jwt.verify(token, this.secret) as jwt.JwtPayload & { scope?: string; room?: string; pv?: string };
      return p.scope === 'room-pass' && p.sub === userId && p.room === code && p.pv === fingerprint(passwordHash);
    } catch {
      return false;
    }
  }

  requireUser = (req: Request, res: Response, next: NextFunction): void => {
    const h = req.headers.authorization;
    const user = this.verify(h?.startsWith('Bearer ') ? h.slice(7) : null);
    if (!user) { res.status(401).json({ error: 'Sign in first' }); return; }
    req.user = user;
    next();
  };

  /** Signed in as an admin (on its own: no need for requireUser first). */
  requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    this.requireUser(req, res, () => {
      if (!req.user!.admin) { res.status(403).json({ error: 'Only an admin can do that' }); return; }
      next();
    });
  };

  routes(): Router {
    const r = Router();
    const limiter = rateLimit(20, 60_000);

    r.post('/register', limiter, async (req, res) => {
      if (!getPlatformSettings().signupsAllowed) { res.status(403).json({ error: 'New accounts are switched off here' }); return; }
      const username = cleanUsername(req.body?.username);
      const name = cleanName(req.body?.displayName ?? req.body?.username);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!username) { res.status(400).json({ error: 'Usernames are 3-32 letters, numbers, dots, dashes or underscores' }); return; }
      if (!name) { res.status(400).json({ error: 'Pick a display name (up to 32 characters)' }); return; }
      if (password.length < 8 || password.length > 200) { res.status(400).json({ error: 'Passwords need at least 8 characters' }); return; }
      const hash = await bcrypt.hash(password, 11);
      try {
        const { rows } = await this.db.query<{ id: string }>(
          `INSERT INTO users (kind, username, display_name, password_hash) VALUES ('account', $1, $2, $3) RETURNING id`,
          [username, name, hash]);
        if (this.envAdmins.has(username)) this.admins.add(rows[0].id);
        const user = { id: rows[0].id, name, guest: false, admin: this.admins.has(rows[0].id) };
        res.status(201).json({ token: this.sign(user), user });
      } catch (err) {
        if ((err as { code?: string }).code === '23505') { res.status(409).json({ error: 'That username is taken' }); return; }
        throw err;
      }
    });

    r.post('/login', limiter, async (req, res) => {
      const username = cleanUsername(req.body?.username);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const { rows } = username
        ? await this.db.query<{ id: string; display_name: string; password_hash: string }>(
          `SELECT id, display_name, password_hash FROM users WHERE kind = 'account' AND username = $1`, [username])
        : { rows: [] };
      const row = rows[0];
      // Compare against a dummy hash when there's no such user, so timing
      // doesn't reveal which usernames exist.
      const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
      if (!row || !ok) { res.status(401).json({ error: 'Wrong username or password' }); return; }
      await this.db.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [row.id]);
      const user = { id: row.id, name: row.display_name, guest: false, admin: this.admins.has(row.id) };
      res.json({ token: this.sign(user), user });
    });

    r.post('/guest', limiter, async (req, res) => {
      if (!getPlatformSettings().guestsAllowed) { res.status(403).json({ error: 'Guests are switched off here: sign in or create an account' }); return; }
      const name = cleanName(req.body?.displayName);
      if (!name) { res.status(400).json({ error: 'Pick a display name (up to 32 characters)' }); return; }
      const { rows } = await this.db.query<{ id: string }>(
        `INSERT INTO users (kind, display_name) VALUES ('guest', $1) RETURNING id`, [name]);
      const user = { id: rows[0].id, name, guest: true, admin: false };
      res.status(201).json({ token: this.sign(user), user });
    });

    r.get('/me', this.requireUser, (req, res) => {
      res.json({ user: req.user, allowSignup: getPlatformSettings().signupsAllowed });
    });

    r.get('/options', (_req, res) => {
      const p = getPlatformSettings();
      res.json({ allowSignup: p.signupsAllowed, allowGuests: p.guestsAllowed });
    });

    return r;
  }
}

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);

const fingerprint = (hash: string) => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

/** A room password from a request body: null for none, or an error message. */
export function roomPassword(v: unknown): { password: string | null } | { error: string } {
  if (v === undefined || v === null || v === '') return { password: null };
  if (typeof v !== 'string' || v.length < 4 || v.length > 100) return { error: 'Room passwords are 4-100 characters' };
  return { password: v };
}

function cleanUsername(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const u = v.trim().toLowerCase();
  return /^[a-z0-9_.-]{3,32}$/.test(u) ? u : null;
}

export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // Drop control characters and collapse runs of whitespace.
  const n = v.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= 32 ? n : null;
}

/** A small in-memory limiter per client address. */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      next();
      return;
    }
    if (++h.n > max) { res.status(429).json({ error: 'Too many tries: wait a minute' }); return; }
    next();
  };
}
