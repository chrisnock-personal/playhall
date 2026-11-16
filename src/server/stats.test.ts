// Results filed under a typed game name (the camera table), checked against
// a stand-in database that records the queries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardNameOf, nameFilter, recordGame } from './stats';
import type { Db } from './db';
import type { FinishedGame } from './rooms/room';
import { DEFAULT_SETTINGS } from '../shared/protocol';

function fakeDb() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (/INSERT INTO games/.test(sql)) return { rows: [{ id: '7' }] };
    if (/opponent_id = \$3/.test(sql)) return { rows: [{ w: 1, d: 0, l: 0 }] };
    return { rows: [] };
  };
  const db = { query, connect: async () => ({ query, release() {} }) } as unknown as Db;
  return { db, queries };
}

const finished = (name: string, counted = true): FinishedGame => ({
  rec: {
    id: 'r1', code: 'CAM123', name: 'Night', gameId: 'cameratable', hostId: 'h', hostName: 'Sam',
    settings: { ...DEFAULT_SETTINGS, gameConfig: { name, seats: 2 } }, passwordHash: null, banned: [],
    seats: {}, game: { status: 'over', state: null, startedAt: 0, players: null },
  },
  result: { winner: 'amber', placings: [['amber'], ['teal']], reason: 'the agreed result' },
  state: { config: { name, seats: 2, playersScore: true } },
  players: { amber: { userId: 'u1', name: 'Kai', guest: false }, teal: { userId: 'u2', name: 'Alex', guest: false } },
  counted, note: null,
});

test('a camera table result is filed under its typed name, grouped case-insensitively', async () => {
  const { db, queries } = fakeDb();
  const standings = await recordGame(db, finished('  CATAN '));
  const inserts = queries.filter((q) => /INSERT INTO game_results/.test(q.sql));
  assert.equal(inserts.length, 2);
  for (const q of inserts) assert.deepEqual(q.params.slice(-2), ['CATAN', 'catan']);
  const board = queries.find((q) => /FROM game_results r JOIN users/.test(q.sql))!;
  assert.deepEqual(board.params, ['cameratable', 'catan'], 'standings among Catan games only');
  const h2h = queries.find((q) => /opponent_id = \$3/.test(q.sql))!;
  assert.equal(h2h.params[3], 'catan');
  assert.equal(standings?.players.find((p) => p.userId === 'u1')?.points, 3);
});

test('other games have no name', () => {
  assert.deepEqual(boardNameOf('chess', {}), { name: null, key: null });
  assert.deepEqual(boardNameOf('cameratable', { config: { name: 'Ticket to  Ride' } }), { name: 'Ticket to Ride', key: 'ticket to ride' });
});

test('the leaderboard’s name filter', () => {
  assert.equal(nameFilter(undefined), null);
  assert.equal(nameFilter(''), null);
  assert.equal(nameFilter(' Catan'), 'catan');
  assert.equal(nameFilter(['a']), undefined);
  assert.equal(nameFilter('x'.repeat(300)), undefined);
});
