// Demo data: eight players, two months of finished chess games (so the
// leaderboards and stats have something to show), and five rooms in
// different states with some chat. Everything is flagged (users.is_demo) and
// --remove takes it all out again.
//
//   node dist/server/demo.js            load it (prints the demo password)
//   node dist/server/demo.js --remove   remove it
//   (in development: npx tsx src/server/demo.ts)

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createPool, migrate, type Db } from './db';
import { DEFAULT_SETTINGS, POINTS, type Outcome } from '../shared/protocol';
import { chess } from '../shared/games/chess';

const PLAYERS: { name: string; strength: number; activity: number }[] = [
  { name: 'Priya', strength: 1.7, activity: 1.0 },
  { name: 'Sam', strength: 1.6, activity: 1.1 },
  { name: 'Alex', strength: 1.3, activity: 1.2 },
  { name: 'Morgan', strength: 1.2, activity: 0.8 },
  { name: 'Kai', strength: 0.9, activity: 0.9 },
  { name: 'Jordan', strength: 0.8, activity: 0.6 },
  { name: 'Lee', strength: 0.7, activity: 0.7 },
  { name: 'Robin', strength: 1.0, activity: 0.12 },
];

const WIN_REASONS: [string, number][] = [['checkmate', 0.4], ['resignation', 0.37], ['time', 0.23]];
const DRAW_REASONS: [string, number][] = [['agreement', 0.6], ['threefold repetition', 0.22], ['stalemate', 0.1], ['insufficient material', 0.08]];

// A small seeded generator, so every load gives the same history.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, weighted: [T, number][]): T {
  const total = weighted.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [v, w] of weighted) { if ((x -= w) <= 0) return v; }
  return weighted[weighted.length - 1][0];
}

async function remove(db: Db): Promise<void> {
  const { rowCount: rooms } = await db.query('DELETE FROM rooms WHERE host_id IN (SELECT id FROM users WHERE is_demo)');
  const { rowCount: users } = await db.query('DELETE FROM users WHERE is_demo');
  console.log(`[demo] removed ${users ?? 0} demo players and ${rooms ?? 0} rooms (with their games, results and chat)`);
}

function code(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.randomBytes(6)].map((b) => A[b % A.length]).join('');
}

async function load(db: Db): Promise<void> {
  const { rows: existing } = await db.query('SELECT 1 FROM users WHERE is_demo LIMIT 1');
  if (existing.length) { console.log('[demo] already loaded (run with --remove first to reload)'); return; }

  const password = process.env.DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 11);
  const ids: Record<string, string> = {};
  for (const p of PLAYERS) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (kind, username, display_name, password_hash, is_demo, created_at)
       VALUES ('account', $1, $2, $3, true, now() - interval '70 days') RETURNING id`,
      [`demo_${p.name.toLowerCase()}`, p.name, hash]);
    ids[p.name] = rows[0].id;
  }
  const holder = (name: string) => ({ userId: ids[name], name, guest: false });

  // ---- rooms ----
  const config = (initialSeconds: number, incrementSeconds: number) => ({ initialSeconds, incrementSeconds });
  const italian = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5'];
  const live = { ...chess.create(config(0, 0), Date.now()), moves: italian };
  const rooms: { name: string; host: string; settings: Partial<typeof DEFAULT_SETTINGS> & { gameConfig: unknown }; seats: Record<string, unknown>; game: unknown }[] = [
    {
      name: 'Long game, no clock', host: 'Sam',
      settings: { gameConfig: config(0, 0) },
      seats: { white: holder('Sam'), black: holder('Alex') },
      game: { status: 'playing', state: live, startedAt: Date.now() - 25 * 60_000, players: { white: holder('Sam'), black: holder('Alex') } },
    },
    {
      name: 'Openings club', host: 'Priya',
      settings: { gameConfig: config(300, 3), afterGame: 'winnerStays' },
      seats: { white: holder('Priya'), black: null },
      game: { status: 'idle', state: null, startedAt: null, players: null },
    },
    {
      name: 'Late-night rapid', host: 'Kai',
      settings: { gameConfig: config(600, 0), afterGame: 'rotate' },
      seats: { white: holder('Kai'), black: holder('Jordan') },
      game: { status: 'idle', state: null, startedAt: null, players: null },
    },
    {
      name: 'Teaching table', host: 'Morgan',
      settings: { gameConfig: config(900, 10), ranked: false, seatPolicy: 'host' },
      seats: { white: null, black: null },
      game: { status: 'idle', state: null, startedAt: null, players: null },
    },
    {
      name: 'Friends only', host: 'Alex',
      settings: { gameConfig: config(180, 2), listed: false },
      seats: { white: null, black: null },
      game: { status: 'idle', state: null, startedAt: null, players: null },
    },
  ];
  const roomIds: string[] = [];
  for (const r of rooms) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO rooms (code, name, game_id, host_id, settings, seats, game, updated_at)
       VALUES ($1, $2, 'chess', $3, $4, $5, $6, now()) RETURNING id`,
      [code(), r.name, ids[r.host], JSON.stringify({ ...DEFAULT_SETTINGS, ...r.settings }), JSON.stringify(r.seats), JSON.stringify(r.game)]);
    roomIds.push(rows[0].id);
  }

  // ---- chat ----
  const chat: [number, 'table' | 'gallery', 'typed' | 'system', string | null, string, number][] = [
    [0, 'table', 'system', null, 'Sam sat down as White', 40],
    [0, 'table', 'system', null, 'Alex sat down as Black', 39],
    [0, 'table', 'system', null, 'Game started: White Sam, Black Alex · No clock', 25],
    [0, 'table', 'typed', 'Alex', 'No clock tonight, so no excuses.', 24],
    [0, 'table', 'typed', 'Sam', 'Italian it is. Your move took long enough.', 18],
    [0, 'gallery', 'typed', 'Priya', 'Bishop to c5: the Giuoco Piano. Quiet but sharp.', 15],
    [0, 'gallery', 'typed', 'Morgan', 'If Sam plays c3 next, d4 is coming.', 12],
    [0, 'gallery', 'typed', 'Kai', 'Who plays the winner? I’m asking for a seat.', 6],
    [2, 'table', 'system', null, 'Jordan (Black) won by time', 50],
    [2, 'table', 'typed', 'Kai', 'Flagged with mate in two on the board. Rematch.', 48],
    [2, 'table', 'typed', 'Jordan', 'After a coffee.', 47],
  ];
  const lineIds = new Map<number, number>();
  for (const [ri, channel, kind, who, text, minsAgo] of chat) {
    const id = (lineIds.get(ri) ?? 0) + 1;
    lineIds.set(ri, id);
    await db.query(
      `INSERT INTO chat_messages (room_id, line_id, channel, kind, user_id, name, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(mins => $8))`,
      [roomIds[ri], id, channel, kind, who ? ids[who] : null, who ?? '', text, minsAgo]);
  }

  // ---- two months of finished games ----
  const r = rng(20261115);
  const now = Date.now();
  const DAY = 86_400_000;
  const active = PLAYERS.map((p) => [p, p.activity] as [typeof p, number]);
  let games = 0;
  for (let day = 60; day >= 0; day--) {
    // More play recently, and more at weekends.
    const date = new Date(now - day * DAY);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const n = Math.round((day < 14 ? 4 : 3) * (weekend ? 1.4 : 1) * (0.6 + r() * 0.8) * (day === 0 ? 0.5 : 1));
    for (let g = 0; g < n; g++) {
      const a = pick(r, active);
      let b = pick(r, active);
      while (b === a) b = pick(r, active);
      const [white, black] = r() < 0.5 ? [a, b] : [b, a];
      const drawn = r() < 0.12;
      const whiteEdge = 1.08; // White's first-move advantage
      const whiteWins = !drawn && r() < (white.strength * whiteEdge) / (white.strength * whiteEdge + black.strength);
      const winner = drawn ? null : whiteWins ? 'white' : 'black';
      const reason = drawn ? pick(r, DRAW_REASONS) : pick(r, WIN_REASONS);
      const minutesIntoDay = 17 * 60 + Math.floor(r() * 300);
      let endedMs = now - day * DAY - (now % DAY) + minutesIntoDay * 60_000;
      // Today's evening hasn't happened yet: spread those games over the last few hours.
      if (endedMs > now - 60_000) endedMs = now - (20 + Math.floor(r() * 400)) * 60_000;
      const ended = new Date(endedMs);
      const startedAt = ended.getTime() - (8 + Math.floor(r() * 25)) * 60_000;
      const room = roomIds[Math.floor(r() * 3)];
      const players = { white: holder(white.name), black: holder(black.name) };
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO games (room_id, game_id, players, result, state, started_at, ended_at)
         VALUES ($1, 'chess', $2, $3, '{"demo":true}', to_timestamp($4 / 1000.0), $5) RETURNING id`,
        [room, JSON.stringify(players), JSON.stringify({ winner, reason }), startedAt, ended]);
      for (const [seat, me, them] of [['white', white, black], ['black', black, white]] as const) {
        const outcome: Outcome = winner === null ? 'draw' : winner === seat ? 'win' : 'loss';
        await db.query(
          `INSERT INTO game_results (game_row_id, room_id, game_id, user_id, seat, outcome, points, reason, opponent_id, counted, ended_at)
           VALUES ($1, $2, 'chess', $3, $4, $5, $6, $7, $8, true, $9)`,
          [rows[0].id, room, ids[me.name], seat, outcome, POINTS[outcome], reason, ids[them.name], ended]);
      }
      games++;
    }
  }
  console.log(`[demo] loaded ${PLAYERS.length} players (usernames demo_${PLAYERS[0].name.toLowerCase()} and so on), ${rooms.length} rooms and ${games} finished games`);
  console.log(`[demo] password for every demo player: ${password}`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  const db = createPool(url);
  try {
    await migrate(db, process.env.MIGRATIONS_DIR ?? 'migrations');
    if (process.argv.includes('--remove')) await remove(db); else await load(db);
  } finally {
    await db.end();
  }
}

main().catch((err) => { console.error('[demo]', err.message ?? err); process.exit(1); });
