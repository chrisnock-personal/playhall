import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tournaments, checkTournament } from './tournaments';
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
  /** Finish the game in room `code`: `winner` is a user id, or null for a draw. */
  const finish = async (code: string, winner: string | null) => {
    const r = rooms.find((x) => x.code === code)!;
    const players = Object.fromEntries(Object.entries(r.seated).map(([seat, p]) => [seat, { userId: p.id, name: p.id, guest: false }]));
    const seat = winner ? Object.keys(r.seated).find((s) => r.seated[s].id === winner)! : null;
    manager.onGameOver!({ rec: { code } as never, result: { winner: seat, reason: 'test' }, players, state: null, counted: true, note: null } as FinishedGame);
    await new Promise((res) => setTimeout(res, 5));
  };
  return { ts, rooms, finish };
}

const me = (id: string) => ({ id, name: id });

test('settings are checked: a two-player game, a format, sensible rounds', () => {
  assert.ok('config' in checkTournament({ name: 'Club night', gameId: 'chess', format: 'swiss', rounds: 3 }));
  assert.match((checkTournament({ name: 'x', gameId: 'ship2shore', format: 'knockout' }) as { error: string }).error, /two-player/);
  assert.match((checkTournament({ name: 'x', gameId: 'chess', format: 'league' }) as { error: string }).error, /format/);
  assert.match((checkTournament({ name: 'x', gameId: 'chess', format: 'swiss', rounds: 0 }) as { error: string }).error, /rounds/);
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
