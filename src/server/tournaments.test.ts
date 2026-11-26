import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Tournaments, checkTournament, tournamentRoutes } from './tournaments';
import type { Auth } from './auth';
import type { RoomManager } from './rooms/manager';
import type { FinishedGame } from './rooms/room';
import type { Db } from './db';

function fakes() {
  const db = { query: async () => ({ rows: [{ id: 't1', created_at: new Date(0) }], rowCount: 1 }) } as unknown as Db;
  const rooms: { code: string; seated: Record<string, { id: string }>; here: Set<string>; playing: boolean }[] = [];
  const manager = {
    onGameOver: null as null | ((e: FinishedGame) => void),
    async create(_host: unknown, input: { seated: Record<string, { id: string }> }) {
      const r = { code: `R${rooms.length + 1}`, seated: input.seated, here: new Set<string>(), playing: false };
      rooms.push(r);
      return { rec: { code: r.code } };
    },
    async get(code: string) {
      const r = rooms.find((x) => x.code === code);
      return r && { playing: r.playing, isHere: (id: string) => r.here.has(id) };
    },
  };
  const ts = new Tournaments(db, manager as unknown as RoomManager);
  ts.stop();
  /** Finish the game in room `code`: `winner` is a user id, or null for a draw.
   *  Tables (#59) finish with placings of user ids, grouped by finishing place. */
  const finish = async (code: string, winner: string | null, opts?: { placings?: string[][]; teamWin?: boolean; nobodyWins?: boolean }) => {
    const r = rooms.find((x) => x.code === code)!;
    const players = Object.fromEntries(Object.entries(r.seated).map(([seat, p]) => [seat, { userId: p.id, name: p.id, guest: false }]));
    const seat = winner ? Object.keys(r.seated).find((s) => r.seated[s].id === winner)! : null;
    const seatOf = (id: string) => Object.keys(r.seated).find((s) => r.seated[s].id === id)!;
    const result = {
      winner: opts?.placings ? null : seat, reason: 'test',
      ...(opts?.placings ? { placings: opts.placings.map((group) => group.map(seatOf)), teamWin: !!opts.teamWin } : {}),
      ...(opts?.nobodyWins ? { nobodyWins: true } : {}),
    };
    manager.onGameOver!({ rec: { code } as never, result, players, state: null, counted: true, note: null } as FinishedGame);
    await new Promise((res) => setTimeout(res, 5));
  };
  return { ts, rooms, finish };
}

/** The award route behind a signed-in organiser, as the browser reaches it. */
async function awardServer(ts: Tournaments, code: string) {
  const app = express();
  app.use(express.json());
  const auth = {
    requireUser(req: Request, _res: Response, next: NextFunction) {
      req.user = { id: 'org', name: 'org', guest: false, admin: false };
      next();
    },
  } as unknown as Auth;
  app.use(tournamentRoutes({ auth, tournaments: ts }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/tournaments/${code}/award`;
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { post, close: () => server.close() };
}

const me = (id: string) => ({ id, name: id });

test('settings are checked: table size, a format, sensible rounds', () => {
  assert.ok('config' in checkTournament({ name: 'Club night', gameId: 'chess', format: 'swiss', rounds: 3 }));
  assert.match((checkTournament({ name: 'x', gameId: 'ship2shore', format: 'knockout' }) as { error: string }).error, /5 to 6 players/);
  assert.match((checkTournament({ name: 'x', gameId: 'chess', format: 'league' }) as { error: string }).error, /format/);
  assert.match((checkTournament({ name: 'x', gameId: 'chess', format: 'swiss', rounds: 0 }) as { error: string }).error, /rounds/);
  assert.ok('config' in checkTournament({ name: 'Table night', gameId: 'ludo', format: 'swiss', rounds: 2, tableSize: 3, placePoints: [3, 2, 1] }));
  assert.match((checkTournament({ name: 'x', gameId: 'ludo', format: 'knockout', tableSize: 3 }) as { error: string }).error, /need Swiss/);
  assert.match((checkTournament({ name: 'x', gameId: 'chess', format: 'swiss', rounds: 2, tableSize: 3 }) as { error: string }).error, /needs 2 to 2/);
  assert.match((checkTournament({ name: 'x', gameId: 'spades', format: 'swiss', rounds: 2, teamSize: 2, tableSize: 3 }) as { error: string }).error, /Spades/);
  assert.match((checkTournament({ name: 'x', gameId: 'ludo', format: 'swiss', rounds: 2, tableSize: 3, placePoints: [1, 9, 0] }) as { error: string }).error, /points by place/);
});

test('a knockout from entries to a winner: rooms opened with both players seated, a draw replayed, a forfeit', async () => {
  const { ts, rooms, finish } = fakes();
  const t = await ts.create(me('org'), { name: 'Cup', gameId: 'fourinarow', format: 'knockout', graceMinutes: 5 });
  for (const p of ['a', 'b', 'c', 'd']) await ts.enter(me(p), t, true);
  await assert.rejects(ts.start(me('a'), t), /organiser/);
  await ts.start(me('org'), t, () => 0.5);
  assert.equal(t.status, 'running');
  assert.equal(rooms.length, 2, 'two semi-finals, a room each');
  assert.equal(Object.keys(rooms[0].seated).length, 2, 'both players seated');
  const [m1, m2] = t.rounds[0];
  // A draw in a knockout doesn't decide the match: they play again.
  await finish(m1.room!, null);
  assert.equal(t.rounds[0][0].result, null);
  await finish(m1.room!, m1.a);
  assert.equal(t.rounds[0][0].result, 'a');
  // The other semi: b's player never turns up; a's does; the deadline passes.
  rooms[1].here.add(m2.a);
  await ts.checkDeadlines(Date.now() + 6 * 60_000);
  assert.equal(t.rounds[0][1].how, 'forfeit');
  assert.equal(t.rounds.length, 2, 'the final is paired');
  assert.equal(rooms.length, 3);
  const final = t.rounds[1][0];
  await finish(final.room!, final.b);
  assert.equal(t.status, 'done');
  assert.equal(ts.view(t).winner?.id, final.b);
  // Later games in a decided room change nothing.
  await finish(final.room!, final.a);
  assert.equal(ts.view(t).winner?.id, final.b);
});

test('round robin: draws count half, the organiser can settle a match, the table at the end', async () => {
  const { ts, finish } = fakes();
  const t = await ts.create(me('org'), { name: 'League', gameId: 'chess', format: 'roundrobin' });
  for (const p of ['a', 'b', 'c']) await ts.enter(me(p), t, true);
  await ts.start(me('org'), t, () => 0.1);
  let guard = 0;
  while (t.status === 'running' && guard++ < 10) {
    const r = t.rounds.length - 1;
    for (const [i, m] of t.rounds[r].entries()) {
      if (m.result || !m.b) continue;
      if (r === 0) await ts.award(me('org'), t, r, i, 'draw');
      else await finish(m.room!, [m.a, m.b].sort()[0]);
    }
  }
  assert.equal(t.status, 'done');
  assert.equal(t.rounds.length, 3);
  const table = ts.view(t).standings;
  assert.equal(table.reduce((n, s) => n + s.points, 0), 6, 'each round: a game (1 point between two) and a bye (1)');
});

test('organiser tools: withdrawing a player, more time, late Swiss entries, and nobody turning up', async () => {
  const { ts, rooms } = fakes();
  const t = await ts.create(me('org'), { name: 'Swiss night', gameId: 'chess', format: 'swiss', rounds: 3, graceMinutes: 5 });
  for (const p of ['a', 'b', 'c', 'd']) await ts.enter(me(p), t, true);
  await ts.start(me('org'), t, () => 0.5);
  // A late entry before round 2.
  await ts.enter(me('e'), t, true);
  assert.ok(t.seeds.includes('e'));
  // More time pushes the deadlines back.
  const before = { ...t.deadlines };
  await ts.moreTime(me('org'), t);
  for (const k of Object.keys(before)) assert.ok(t.deadlines[k] > before[k]);
  // Withdraw a: their match goes to their opponent.
  const m = t.rounds[0].find((x) => x.a === 'a' || x.b === 'a')!;
  await ts.withdraw(me('org'), t, 'a');
  assert.equal(m.how, 'forfeit');
  assert.notEqual(m.result === 'a' ? m.a : m.b, 'a');
  // Nobody in the other room by the deadline: both lose (no points).
  await ts.checkDeadlines(Date.now() + 60 * 60_000);
  const other = t.rounds[0].find((x) => x !== m)!;
  assert.equal(other.result, 'none');
  // Round 2 is paired without a, and with e.
  assert.equal(t.rounds.length, 2);
  const r2 = t.rounds[1].flatMap((x) => [x.a, x.b]);
  assert.ok(!r2.includes('a') && r2.includes('e'));
  assert.ok(rooms.length >= 3);
});

test('a table tournament seats the whole table and scores by finishing place', async () => {
  const { ts, rooms, finish } = fakes();
  const t = await ts.create(me('org'), { name: 'Ludo night', gameId: 'ludo', format: 'swiss', rounds: 2, tableSize: 3, placePoints: [3, 2, 1] });
  for (const p of ['a', 'b', 'c', 'd', 'e', 'f']) await ts.enter(me(p), t, true);
  await assert.rejects(ts.start(me('a'), t), /organiser/);
  await ts.start(me('org'), t, () => 0.5);
  assert.equal(rooms.length, 2, 'two tables');
  assert.equal(Object.keys(rooms[0].seated).length, 3, 'all three seats filled');
  assert.equal(new Set(Object.values(rooms[0].seated).map((p) => p.id)).size, 3);
  const m = t.rounds[0][0];
  const table = m.table!;
  await finish(m.room!, null, { placings: [[table[0]], [table[1]], [table[2]]] });
  assert.equal(m.result, 'table');
  assert.equal(m.how, 'game');
  const view = ts.view(t);
  assert.equal(view.standings.find((s) => s.id === table[0])!.points, 3);
  assert.equal(view.standings.find((s) => s.id === table[1])!.points, 2);
  assert.equal(view.standings.find((s) => s.id === table[2])!.points, 1);
  assert.equal(view.standings.find((s) => s.id === t.rounds[0][1].table![0])!.points, 0);
  const other = t.rounds[0][1];
  const otherTable = other.table!;
  await finish(other.room!, null, { placings: [[otherTable[0]], [otherTable[1]], [otherTable[2]]] });
  assert.equal(t.rounds.length, 2, 'round 2 is paired by score');
});

test('the organiser can settle a whole table by picking the winner', async () => {
  const { ts } = fakes();
  const t = await ts.create(me('org'), { name: 'Settled', gameId: 'ludo', format: 'swiss', rounds: 1, tableSize: 3, placePoints: [3, 2, 1] });
  for (const p of ['a', 'b', 'c']) await ts.enter(me(p), t, true);
  await ts.start(me('org'), t, () => 0.5);
  await assert.rejects(ts.award(me('a'), t, 0, 0, 'table', t.rounds[0][0].a), /organiser/);
  await assert.rejects(ts.award(me('org'), t, 0, 0, 'table', 'nobody'), /Pick an entry/);
  const m = t.rounds[0][0];
  await ts.award(me('org'), t, 0, 0, 'table', m.table![1]);
  assert.deepEqual(m.placings, [[m.table![1]], [m.table![0], m.table![2]]]);
  assert.equal(m.result, 'table');
  assert.equal(m.how, 'organiser');
  assert.equal(t.status, 'done');
  const view = ts.view(t);
  assert.equal(view.standings.find((s) => s.id === m.table![1])!.points, 3);
  assert.equal(view.winner?.id, m.table![1]);
});

test('organiser withdrawal and deadlines place the rest of a table', async () => {
  const { ts, rooms } = fakes();
  const t = await ts.create(me('org'), { name: 'Table', gameId: 'ludo', format: 'swiss', rounds: 1, tableSize: 3, placePoints: [3, 2, 1] });
  for (const p of ['a', 'b', 'c']) await ts.enter(me(p), t, true);
  await ts.start(me('org'), t, () => 0.5);
  const m = t.rounds[0][0];
  await ts.withdraw(me('org'), t, m.table![2]);
  assert.deepEqual(m.placings, [[m.table![0], m.table![1]], [m.table![2]]]);
  assert.equal(m.how, 'forfeit');
  assert.equal(t.status, 'done');

  const t2 = await ts.create(me('org'), { name: 'Deadline', gameId: 'ludo', format: 'swiss', rounds: 1, tableSize: 3, placePoints: [3, 2, 1] });
  for (const p of ['d', 'e', 'f']) await ts.enter(me(p), t2, true);
  await ts.start(me('org'), t2, () => 0.5);
  const m2 = t2.rounds[0][0];
  rooms.at(-1)!.here.add(m2.table![0]);
  await ts.checkDeadlines(Date.now() + 60 * 60_000);
  assert.deepEqual(m2.placings, [[m2.table![0]], [m2.table![1], m2.table![2]]]);
  assert.equal(m2.how, 'forfeit');
});

test('Spades pair entries sit as partners and a team win goes to the entry', async () => {
  const { ts, rooms, finish } = fakes();
  const t = await ts.create(me('org'), { name: 'Pairs', gameId: 'spades', format: 'swiss', rounds: 1, teamSize: 2, tableSize: 4, placePoints: [3, 2] });
  await ts.enter(me('a'), t, true, me('a2'));
  await ts.enter(me('b'), t, true, me('b2'));
  await assert.rejects(ts.enter(me('c'), t, true), /partner/);
  assert.equal(t.players.length, 2, 'two entries, four accounts');
  await ts.start(me('org'), t, () => 0.5);
  const seated = rooms[0].seated;
  assert.deepEqual(Object.keys(seated).sort(), ['amber', 'rose', 'teal', 'violet']);
  assert.deepEqual([seated.amber.id, seated.violet.id].sort(), ['a', 'a2'], 'partners sit across');
  assert.deepEqual([seated.teal.id, seated.rose.id].sort(), ['b', 'b2']);
  const m = t.rounds[0][0];
  await finish(m.room!, null, { placings: [['a', 'a2'], ['b', 'b2']], teamWin: true });
  assert.deepEqual(m.placings, [[m.a], [m.b]]);
  const view = ts.view(t);
  assert.equal(view.standings.length, 2);
  assert.equal(view.standings[0].name, 'a & a2');
  assert.equal(view.standings[0].points, 3);
  assert.equal(view.winner?.id, m.a);
  // The other side of the pair is “in” too, for alerts and history.
  assert.ok(ts.summaries('a2')[0].entered);
  assert.equal(ts.summaries('b2')[0].entered, true);
});

test('POST /award refuses unknown results and bad round/index before touching a match (#89)', async () => {
  const { ts } = fakes();
  const t = await ts.create(me('org'), { name: 'League', gameId: 'chess', format: 'roundrobin' });
  for (const p of ['a', 'b', 'c', 'd']) await ts.enter(me(p), t, true);
  await ts.start(me('org'), t, () => 0.5);
  const [m1, m2] = t.rounds[0];
  const { post, close } = await awardServer(ts, t.code);
  try {
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ round: 0, index: 0, result: 'x' }, /valid result/],
      [{ round: 0, index: 0, result: 'none' }, /valid result/],
      [{ round: -1, index: 0, result: 'a' }, /valid round/],
      [{ round: 0.5, index: 0, result: 'a' }, /valid round/],
      [{ round: '', index: 0, result: 'a' }, /valid round/],
      [{ round: 0, index: 1.5, result: 'a' }, /valid match/],
      [{ round: 0, index: null, result: 'a' }, /valid match/],
    ];
    for (const [body, message] of bad) {
      const res = await post(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match((await res.json() as { error: string }).error, message);
      assert.equal(m1.result, null, 'bad input must not settle the match');
      assert.equal(m2.result, null);
    }
    const draw = await post({ round: 0, index: 0, result: 'draw' });
    assert.equal(draw.status, 200);
    assert.equal(m1.result, 'draw');
    const win = await post({ round: 0, index: 1, result: 'a' });
    assert.equal(win.status, 200);
    assert.equal(m2.result, 'a');
    assert.equal(m2.how, 'organiser');
    assert.deepEqual(m2.placings, [[m2.a], [m2.b]]);
  } finally { close(); }
});

test('POST /award still accepts a table result with a winner (#89)', async () => {
  const { ts } = fakes();
  const t = await ts.create(me('org'), { name: 'Settled', gameId: 'ludo', format: 'swiss', rounds: 1, tableSize: 3, placePoints: [3, 2, 1] });
  for (const p of ['a', 'b', 'c']) await ts.enter(me(p), t, true);
  await ts.start(me('org'), t, () => 0.5);
  const m = t.rounds[0][0];
  const { post, close } = await awardServer(ts, t.code);
  try {
    const res = await post({ round: 0, index: 0, result: 'table', winner: m.table![1] });
    assert.equal(res.status, 200);
    assert.equal(m.result, 'table');
    assert.deepEqual(m.placings, [[m.table![1]], [m.table![0], m.table![2]]]);
    const view = (await res.json() as { tournament: { rounds: { result: string | null }[][] } }).tournament;
    assert.equal(view.rounds[0][0].result, 'table');
  } finally { close(); }
});
