// Loads rooms from the database when someone opens them, keeps them in
// memory while people are in them, saves changes, and unloads idle rooms.

import { isWord } from '../words';
import crypto from 'node:crypto';
import type { Db } from '../db';
import { GAMES } from '../../shared/games';
import { seatsIn } from '../../shared/game';
import { DEFAULT_SETTINGS, type ChatLine, type RoomSettings, type RoomSummary, type SessionUser } from '../../shared/protocol';
import { Room, RoomError, type RoomRecord, type SeatHolder } from './room';
import { recordGame } from '../stats';
import type { AdminRoom } from '../../shared/platform';
import { transcriptsAllowed } from '../transcripts';
import { aiAvailable, askModel } from '../ai';

const IDLE_UNLOAD_MS = 10 * 60_000;
const SAVE_DELAY_MS = 150;
/** How often a running game notes that the server is up, so a restart
 *  charges nobody's clock for the downtime (at most this much is lost). */
const ALIVE_EVERY_MS = 15_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface RoomRow {
  id: string; code: string; name: string; game_id: string; host_id: string; host_name: string;
  settings: RoomSettings; seats: RoomRecord['seats']; game: RoomRecord['game']; password_hash: string | null; banned: string[];
  table_camera?: RoomRecord['tableCamera'];
}

export interface CreateRoomInput {
  name: string;
  gameId: string;
  listed?: boolean;
  seatPolicy?: 'open' | 'host';
  guestsCanPlay?: boolean;
  ranked?: boolean;
  gameConfig?: unknown;
  hostSeat?: string | null;
  /** From the platform's defaults for new rooms. */
  moveSeconds?: number;
  watcherDelay?: number;
  /** Already hashed. */
  passwordHash?: string | null;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room | null>>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private idleTimers = new Map<string, NodeJS.Timeout>();
  private aliveTimer: NodeJS.Timeout;

  constructor(private db: Db, private onChanged: (room: Room) => void, private onKick: (room: Room, userId: string, reason: string) => void = () => {}) {
    this.aliveTimer = setInterval(() => {
      for (const room of this.rooms.values()) if (room.markAlive()) this.scheduleSave(room.rec);
    }, ALIVE_EVERY_MS);
    this.aliveTimer.unref();
  }

  /** Shutting down: note every running game as alive now and save it, so the
   *  clocks pick up from here when the server is back. */
  async flush(): Promise<void> {
    clearInterval(this.aliveTimer);
    await Promise.all([...this.rooms.values()].map((room) => {
      room.markAlive();
      return this.saveNow(room.rec);
    }));
  }

  async get(code: string): Promise<Room | null> {
    code = code.toUpperCase();
    const live = this.rooms.get(code);
    if (live) return live;
    let p = this.loading.get(code);
    if (!p) {
      p = this.load(code).finally(() => this.loading.delete(code));
      this.loading.set(code, p);
    }
    return p;
  }

  private async load(code: string): Promise<Room | null> {
    const { rows } = await this.db.query<RoomRow>(
      `SELECT r.id, r.code, r.name, r.game_id, r.host_id, u.display_name AS host_name, r.settings, r.seats, r.game, r.password_hash, r.banned, r.table_camera
         FROM rooms r JOIN users u ON u.id = r.host_id
        WHERE r.code = $1 AND r.closed_at IS NULL`, [code]);
    const row = rows[0];
    if (!row || !GAMES[row.game_id]) return null;
    const { rows: chat } = await this.db.query<{ line_id: number; channel: ChatLine['channel']; kind: ChatLine['kind']; user_id: string | null; name: string; body: string; at: string }>(
      `SELECT line_id, channel, kind, user_id, name, body, extract(epoch FROM created_at) * 1000 AS at
         FROM (SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY line_id DESC LIMIT 300) c
        ORDER BY line_id`, [row.id]);
    const rec: RoomRecord = {
      id: row.id, code: row.code, name: row.name, gameId: row.game_id,
      hostId: row.host_id, hostName: row.host_name,
      settings: { ...DEFAULT_SETTINGS, ...row.settings },
      seats: row.seats, game: row.game, passwordHash: row.password_hash, banned: row.banned ?? [],
      tableCamera: row.table_camera ?? null,
    };
    const history: ChatLine[] = chat.map((c) => ({
      id: c.line_id, channel: c.channel, kind: c.kind, userId: c.user_id, name: c.name, text: c.body, at: Number(c.at),
    }));
    return this.adopt(rec, history);
  }

  private adopt(rec: RoomRecord, history: ChatLine[]): Room {
    let room!: Room;
    room = new Room(rec, {
      now: () => Date.now(),
      random: () => crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48,
      isWord,
      setTimer: (ms, fn) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); },
      save: (r) => this.scheduleSave(r),
      chat: (roomId, line) => {
        this.db.query(
          `INSERT INTO chat_messages (room_id, line_id, channel, kind, user_id, name, body, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))`,
          [roomId, line.id, line.channel, line.kind, line.userId, line.name, line.text, line.at],
        ).catch((err) => console.error('[rooms] chat save failed:', err.message));
      },
      gameOver: (ended) => {
        recordGame(this.db, ended)
          .then((standings) => room.setLastResult(standings))
          .catch((err) => console.error('[rooms] saving the result failed:', err.message));
      },
      kick: (userId, reason) => this.onKick(room, userId, reason),
      transcriptsAllowed,
      aiAvailable,
      aiAsk: askModel,
      newId: () => crypto.randomBytes(18).toString('base64url'),
      changed: () => {
        if (room) this.onChanged(room);
        if (room) this.checkIdle(room);
      },
    }, history);
    this.rooms.set(rec.code, room);
    this.checkIdle(room);
    return room;
  }

  private scheduleSave(rec: RoomRecord): void {
    if (this.saveTimers.has(rec.id)) return;
    this.saveTimers.set(rec.id, setTimeout(() => { void this.saveNow(rec); }, SAVE_DELAY_MS));
  }

  private async saveNow(rec: RoomRecord): Promise<void> {
    const pending = this.saveTimers.get(rec.id);
    if (pending) { clearTimeout(pending); this.saveTimers.delete(rec.id); }
    await this.db.query(
      `UPDATE rooms SET name = $2, host_id = $3, settings = $4, seats = $5, game = $6, password_hash = $7, banned = $8, table_camera = $9, updated_at = now() WHERE id = $1`,
      [rec.id, rec.name, rec.hostId, JSON.stringify(rec.settings), JSON.stringify(rec.seats), JSON.stringify(rec.game), rec.passwordHash, JSON.stringify(rec.banned ?? []),
        rec.tableCamera ? JSON.stringify(rec.tableCamera) : null],
    ).catch((err) => console.error('[rooms] save failed:', err.message));
  }

  /** Unload a room nobody has been in for a while (it reloads on demand). */
  private checkIdle(room: Room): void {
    const t = this.idleTimers.get(room.rec.code);
    if (room.presentCount > 0) {
      if (t) { clearTimeout(t); this.idleTimers.delete(room.rec.code); }
      return;
    }
    if (t) return;
    this.idleTimers.set(room.rec.code, setTimeout(() => {
      this.idleTimers.delete(room.rec.code);
      if (room.presentCount > 0) return this.checkIdle(room);
      // Its clocks stop while it's unloaded: note when, and save it now.
      if (room.markAlive() || this.saveTimers.has(room.rec.id)) void this.saveNow(room.rec);
      room.dispose();
      this.rooms.delete(room.rec.code);
    }, IDLE_UNLOAD_MS));
  }

  async create(host: SessionUser, input: CreateRoomInput): Promise<Room> {
    if (host.guest) throw new RoomError('Guests can’t host: create an account first');
    const game = GAMES[input.gameId];
    if (!game) throw new RoomError('Unknown game');
    const name = typeof input.name === 'string' ? input.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 60) : '';
    if (!name) throw new RoomError('Give the room a name');
    const bad = game.configError?.(input.gameConfig ?? game.defaultConfig);
    if (bad) throw new RoomError(bad);
    const settings: RoomSettings = {
      ...DEFAULT_SETTINGS,
      listed: input.listed ?? DEFAULT_SETTINGS.listed,
      seatPolicy: input.seatPolicy === 'host' ? 'host' : 'open',
      guestsCanPlay: input.guestsCanPlay ?? DEFAULT_SETTINGS.guestsCanPlay,
      ranked: input.ranked ?? DEFAULT_SETTINGS.ranked,
      moveSeconds: input.moveSeconds ?? DEFAULT_SETTINGS.moveSeconds,
      watcherDelay: input.watcherDelay ?? DEFAULT_SETTINGS.watcherDelay,
      gameConfig: game.parseConfig(input.gameConfig ?? game.defaultConfig),
    };
    const seats: Record<string, SeatHolder | null> = {};
    for (const s of game.seats) seats[s.id] = null;
    if (input.hostSeat && seatsIn(game, settings.gameConfig).some((s) => s.id === input.hostSeat)) seats[input.hostSeat] = { userId: host.id, name: host.name, guest: false };
    const gameRec: RoomRecord['game'] = { status: 'idle', state: null, startedAt: null, players: null };

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      try {
        const { rows } = await this.db.query<{ id: string }>(
          `INSERT INTO rooms (code, name, game_id, host_id, settings, seats, game, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [code, name, game.id, host.id, JSON.stringify(settings), JSON.stringify(seats), JSON.stringify(gameRec), input.passwordHash ?? null]);
        return this.adopt({
          id: rows[0].id, code, name, gameId: game.id, hostId: host.id, hostName: host.name, settings, seats, game: gameRec, passwordHash: input.passwordHash ?? null, banned: [],
        }, []);
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    throw new Error('Could not find a free room code');
  }

  /** Rooms listed in the lobby, plus any the user hosts. */
  async list(userId: string): Promise<RoomSummary[]> {
    const { rows } = await this.db.query<RoomRow>(
      `SELECT r.id, r.code, r.name, r.game_id, r.host_id, u.display_name AS host_name, r.settings, r.seats, r.game, r.password_hash
         FROM rooms r JOIN users u ON u.id = r.host_id
        WHERE r.closed_at IS NULL AND ((r.settings->>'listed')::boolean OR r.host_id = $1)
        ORDER BY r.updated_at DESC LIMIT 100`, [userId]);
    return rows.filter((r) => GAMES[r.game_id]).map((r) => {
      const live = this.rooms.get(r.code);
      if (live) return live.summary();
      const game = GAMES[r.game_id];
      return {
        code: r.code, name: r.name, gameId: game.id, gameName: game.name,
        configLabel: game.describeConfig(game.parseConfig(r.settings.gameConfig)),
        hostName: r.host_name, status: r.game.status,
        seats: seatsIn(game, r.settings.gameConfig).map((s) => ({ id: s.id, label: s.label, userId: r.seats[s.id]?.userId ?? null, name: r.seats[s.id]?.name ?? null })),
        watching: 0, listed: !!r.settings.listed, ranked: r.settings.ranked !== false, locked: !!r.password_hash,
      };
    });
  }

  /** Close a room (host only). */
  async close(code: string, userId: string): Promise<boolean> {
    const room = await this.get(code);
    if (!room || !room.isHost(userId)) return false;
    await this.db.query('UPDATE rooms SET closed_at = now() WHERE id = $1', [room.rec.id]);
    room.dispose();
    this.rooms.delete(room.rec.code);
    return true;
  }

  /** Close any room (an admin). */
  async closeAsAdmin(code: string): Promise<boolean> {
    const room = await this.get(code);
    if (!room) return false;
    await this.db.query('UPDATE rooms SET closed_at = now() WHERE id = $1', [room.rec.id]);
    room.dispose();
    this.rooms.delete(room.rec.code);
    return true;
  }

  /** Every open room, listed or not, for the admin page: the live ones with
   *  how many people have them open now. */
  /** Every room loaded now (e.g. to refresh them all when a platform setting changes). */
  loaded(): Room[] { return [...this.rooms.values()]; }

  async adminList(): Promise<AdminRoom[]> {
    const { rows } = await this.db.query<RoomRow & { updated_at: Date }>(
      `SELECT r.id, r.code, r.name, r.game_id, r.host_id, u.display_name AS host_name, r.settings, r.seats, r.game, r.password_hash, r.updated_at
         FROM rooms r JOIN users u ON u.id = r.host_id
        WHERE r.closed_at IS NULL
        ORDER BY r.updated_at DESC LIMIT 500`);
    return rows.filter((r) => GAMES[r.game_id]).map((r) => {
      const game = GAMES[r.game_id];
      const live = this.rooms.get(r.code);
      const seats = live?.rec.seats ?? r.seats;
      return {
        code: r.code, name: live?.rec.name ?? r.name, gameName: game.name, hostName: live?.rec.hostName ?? r.host_name,
        status: live?.rec.game.status ?? r.game.status,
        present: live?.presentCount ?? 0,
        seated: game.seats.filter((s) => seats[s.id]).length, seats: seatsIn(game, (live?.rec.settings ?? r.settings).gameConfig).length,
        listed: !!(live?.rec.settings ?? r.settings).listed, locked: !!(live ? live.rec.passwordHash : r.password_hash),
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    });
  }
}

function newCode(): string {
  const bytes = crypto.randomBytes(6);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
