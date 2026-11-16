// Results, leaderboards and a player's stats. Every finished game writes one
// game_results row per player; everything here is a query over those rows.
// Points: 3 for a win, 1 for a draw, 0 for a loss.

import type { Db } from './db';
import { GAMES } from '../shared/games';
import {
  MIN_RANKED_GAMES,
  type BoardNamesResponse, type LastResult, type LeaderboardResponse, type LeaderboardRow, type Outcome, type Period, type PlayerStatsResponse,
} from '../shared/protocol';
import type { FinishedGame } from './rooms/room';
import { score } from '../shared/scoring';
import { nameKey, tidyName } from '../shared/games/cameratable';

const SINCE: Record<Period, string> = {
  week: `date_trunc('week', now())`,
  month: `date_trunc('month', now())`,
  all: `'-infinity'::timestamptz`,
};

export const PERIODS: Period[] = ['week', 'month', 'all'];

export function isGameFilter(g: string): boolean {
  return g === 'all' || g in GAMES;
}

/** Games played under a typed name (the camera table): the name as typed and
 *  the key results group by, or nulls for every other game. */
export function boardNameOf(gameId: string, state: unknown): { name: string; key: string } | { name: null; key: null } {
  const raw = GAMES[gameId]?.boardName?.(state);
  const name = raw ? tidyName(raw) : '';
  return name ? { name, key: nameKey(name) } : { name: null, key: null };
}

/** A name filter from a query string: the normalised key, null for none, or
 *  undefined when it's not a usable name. */
export function nameFilter(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > 200) return undefined;
  return nameKey(raw) || undefined;
}

/** Store a finished game and its results; returns the standings to show in
 *  the room (null for a stopped game). */
export async function recordGame(db: Db, g: FinishedGame, endedAt = new Date()): Promise<LastResult | null> {
  const seats = Object.entries(g.players);
  const scores = score(g.result, seats.map(([s]) => s));
  const board = boardNameOf(g.rec.gameId, g.state);
  const client = await db.connect();
  let gameRowId = '';
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO games (room_id, game_id, players, result, state, started_at, aborted, ended_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7, $8) RETURNING id`,
      [g.rec.id, g.rec.gameId, JSON.stringify(g.players), JSON.stringify(g.result), JSON.stringify(g.state),
        g.rec.game.startedAt, !!g.result.aborted, endedAt]);
    gameRowId = rows[0].id;
    if (!g.result.aborted) {
      for (const [seat, holder] of seats) {
        // Bots (#18) have no account: no results row, and no opponent id.
        if (holder.bot) continue;
        const { outcome, points } = scores[seat];
        const other = seats.length === 2 ? seats.find(([s]) => s !== seat)![1] : null;
        const opponent = other && !other.bot ? other.userId : null;
        await client.query(
          `INSERT INTO game_results (game_row_id, room_id, game_id, user_id, seat, outcome, points, reason, opponent_id, counted, ended_at, game_name, game_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [rows[0].id, g.rec.id, g.rec.gameId, holder.userId, seat, outcome, points, g.result.reason, opponent, g.counted, endedAt, board.name, board.key]);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  if (g.result.aborted) return null;

  // A camera table game's standings are among games of the same name.
  const standings = g.counted ? await leaderboard(db, g.rec.gameId, 'all', board.key) : null;
  const all = standings ? [...standings.ranked, ...standings.unranked] : [];
  let headToHead: LastResult['headToHead'] = null;
  if (g.counted && seats.length === 2) {
    const { rows } = await db.query<{ w: number; d: number; l: number }>(
      `SELECT count(*) FILTER (WHERE outcome = 'win')::int AS w, count(*) FILTER (WHERE outcome = 'draw')::int AS d,
              count(*) FILTER (WHERE outcome = 'loss')::int AS l
         FROM game_results WHERE counted AND game_id = $1 AND user_id = $2 AND opponent_id = $3 AND ($4::text IS NULL OR game_key = $4)`,
      [g.rec.gameId, seats[0][1].userId, seats[1][1].userId, board.key]);
    headToHead = rows[0];
  }
  return {
    gameRowId: String(gameRowId),
    replayable: canReplay(g.rec.gameId, g.state),
    counted: g.counted,
    note: g.note,
    headToHead,
    players: seats.map(([seat, h]) => {
      const { outcome, points, place } = scores[seat];
      const row = all.find((r) => r.userId === h.userId);
      return { userId: h.userId, name: h.name, seat, outcome, points, place, total: row?.points ?? null, rank: row?.rank ?? null };
    }),
  };
}

/** Leaderboards: one game (or 'all'), and for games played under typed
 *  names, optionally one name (its key from nameKey()). */
export async function leaderboard(db: Db, game: string, period: Period, name: string | null = null): Promise<LeaderboardResponse> {
  const { rows } = await db.query<Omit<LeaderboardRow, 'rank'>>(
    `SELECT r.user_id AS "userId", u.display_name AS name, count(*)::int AS played,
            count(*) FILTER (WHERE outcome = 'win')::int AS w,
            count(*) FILTER (WHERE outcome = 'draw')::int AS d,
            count(*) FILTER (WHERE outcome = 'loss')::int AS l,
            sum(points)::int AS points,
            (array_agg(outcome ORDER BY ended_at DESC))[1:5] AS form
       FROM game_results r JOIN users u ON u.id = r.user_id
      WHERE r.counted AND ($1 = 'all' OR r.game_id = $1) AND ($2::text IS NULL OR r.game_key = $2) AND r.ended_at >= ${SINCE[period]}
      GROUP BY r.user_id, u.display_name
      ORDER BY points DESC, sum(points)::float / count(*) DESC, w DESC, name`,
    [game, name]);
  const ranked: LeaderboardRow[] = [];
  const unranked: LeaderboardRow[] = [];
  for (const r of rows) {
    if (r.played >= MIN_RANKED_GAMES) ranked.push({ ...r, rank: ranked.length + 1 });
    else unranked.push({ ...r, rank: null });
  }
  return { game, period, ranked, unranked, minGames: MIN_RANKED_GAMES, ...(name ? { name } : {}) };
}

/** The names a game has been played under (the camera table), most played
 *  first: one leaderboard tab each. The label is the latest spelling. */
export async function boardNames(db: Db, game: string): Promise<BoardNamesResponse> {
  const { rows } = await db.query<{ key: string; name: string; games: number }>(
    `SELECT game_key AS key, (array_agg(game_name ORDER BY ended_at DESC))[1] AS name, count(DISTINCT game_row_id)::int AS games
       FROM game_results
      WHERE counted AND game_id = $1 AND game_key IS NOT NULL
      GROUP BY game_key
      ORDER BY games DESC, key
      LIMIT 100`, [game]);
  return { game, names: rows };
}

interface ResultRow {
  game_row_id: string;
  /** The game's moves were kept (not demo data with only a result). */
  has_moves: boolean;
  /** The state has a history (games that keep one need it for a replay). */
  has_history: boolean;
  game_id: string; seat: string; outcome: Outcome; points: number; reason: string;
  opponent_id: string | null; opponent: string | null; room: string; ended_at: Date;
}

export async function playerStats(db: Db, userId: string, game: string, period: Period): Promise<PlayerStatsResponse | null> {
  const { rows: users } = await db.query<{ id: string; display_name: string; kind: string; created_at: Date }>(
    'SELECT id, display_name, kind, created_at FROM users WHERE id = $1', [userId]);
  const user = users[0];
  if (!user) return null;

  const { rows } = await db.query<ResultRow>(
    `SELECT r.game_row_id, NOT COALESCE((g.state->>'demo')::boolean, false) AS has_moves, g.state ? 'history' AS has_history, r.game_id, r.seat, r.outcome, r.points, r.reason, r.opponent_id, ou.display_name AS opponent,
            rm.name AS room, r.ended_at
       FROM game_results r
       JOIN rooms rm ON rm.id = r.room_id
       LEFT JOIN games g ON g.id = r.game_row_id
       LEFT JOIN users ou ON ou.id = r.opponent_id
      WHERE r.user_id = $1 AND r.counted AND ($2 = 'all' OR r.game_id = $2) AND r.ended_at >= ${SINCE[period]}
      ORDER BY r.ended_at DESC`,
    [userId, game]);

  const count = (list: ResultRow[]) => ({
    played: list.length,
    w: list.filter((r) => r.outcome === 'win').length,
    d: list.filter((r) => r.outcome === 'draw').length,
    l: list.filter((r) => r.outcome === 'loss').length,
    points: list.reduce((n, r) => n + r.points, 0),
  });

  // Current run (newest first) and the best run of wins (oldest first).
  let current: PlayerStatsResponse['streak']['current'] = null;
  if (rows.length) {
    let n = 0;
    while (n < rows.length && rows[n].outcome === rows[0].outcome) n++;
    current = { outcome: rows[0].outcome, length: n };
  }
  let best = 0, run = 0;
  for (const r of [...rows].reverse()) { run = r.outcome === 'win' ? run + 1 : 0; best = Math.max(best, run); }

  const seatLabel = (gameId: string, seat: string) => GAMES[gameId]?.seats.find((s) => s.id === seat)?.label ?? seat;
  const bySeat = game === 'all' ? [] : (GAMES[game]?.seats ?? []).map((s) => ({
    seat: s.id, label: s.label, ...count(rows.filter((r) => r.seat === s.id)),
  }));

  const endings = new Map<string, number>();
  for (const r of rows) endings.set(r.reason, (endings.get(r.reason) ?? 0) + 1);

  const h2h = new Map<string, { userId: string; name: string; w: number; d: number; l: number }>();
  for (const r of rows) {
    if (!r.opponent_id) continue;
    const h = h2h.get(r.opponent_id) ?? { userId: r.opponent_id, name: r.opponent ?? 'Someone', w: 0, d: 0, l: 0 };
    h[r.outcome === 'win' ? 'w' : r.outcome === 'draw' ? 'd' : 'l']++;
    h2h.set(r.opponent_id, h);
  }

  const { rows: weekly } = await db.query<{ weekStart: string; points: number }>(
    `SELECT to_char(w.wk, 'YYYY-MM-DD') AS "weekStart", COALESCE(sum(r.points), 0)::int AS points
       FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS w(wk)
       LEFT JOIN game_results r
         ON date_trunc('week', r.ended_at) = w.wk AND r.user_id = $1 AND r.counted AND ($2 = 'all' OR r.game_id = $2)
      GROUP BY w.wk ORDER BY w.wk`,
    [userId, game]);

  const board = await leaderboard(db, game, period);

  return {
    user: { id: user.id, name: user.display_name, guest: user.kind === 'guest', since: user.created_at.toISOString() },
    game,
    period,
    totals: count(rows),
    rank: board.ranked.find((r) => r.userId === userId)?.rank ?? null,
    streak: { current, bestWins: best },
    bySeat,
    weekly,
    endings: [...endings].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    recent: rows.slice(0, 10).map((r) => ({
      gameRowId: String(r.game_row_id), replayable: !!GAMES[r.game_id]?.replay && r.has_moves && (!GAMES[r.game_id].keepsHistory || r.has_history),
      opponent: r.opponent, opponentId: r.opponent_id, outcome: r.outcome, reason: r.reason,
      seat: r.seat, seatLabel: seatLabel(r.game_id, r.seat), room: r.room, endedAt: r.ended_at.toISOString(), points: r.points,
    })),
    headToHead: [...h2h.values()].sort((a, b) => (b.w + b.d + b.l) - (a.w + a.d + a.l)).slice(0, 8),
  };
}

/** Whether a stored game's moves were kept, so it can be replayed. */
function canReplay(gameId: string, state: unknown): boolean {
  const game = GAMES[gameId];
  if (!game?.replay) return false;
  return !game.keepsHistory || !!(state as { history?: unknown } | null)?.history;
}

/** A finished game, move by move, for its replay (games that keep their moves). */
export async function replay(db: Db, id: string): Promise<import('../shared/protocol').ReplayResponse | null> {
  const { rows } = await db.query<{ id: string; game_id: string; players: Record<string, { userId: string; name: string }>; result: { winner: string | null; reason: string }; state: unknown; ended_at: Date; room: string }>(
    `SELECT g.id, g.game_id, g.players, g.result, g.state, g.ended_at, r.name AS room
       FROM games g JOIN rooms r ON r.id = g.room_id WHERE g.id = $1`, [id]);
  const row = rows[0];
  const game = row && GAMES[row.game_id];
  if (!row || !game?.replay || (row.state as { demo?: boolean })?.demo || !canReplay(row.game_id, row.state)) return null;
  return {
    id: String(row.id), gameId: row.game_id, room: row.room,
    players: Object.entries(row.players).map(([seat, p]) => ({ seat, name: p.name, userId: p.userId })),
    result: row.result, endedAt: row.ended_at.toISOString(), frames: game.replay(row.state),
  };
}
