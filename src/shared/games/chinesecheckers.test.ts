import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chineseCheckers as g, HOLES, pointHoles, reachable, bestMove, type CheckersState } from './chinesecheckers';

const ok = (r: ReturnType<typeof g.act>): CheckersState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
const ctx2 = { seats: ['amber', 'teal'], random: () => 0.5 };

test('the star: 121 holes, six points of ten', () => {
  assert.equal(HOLES.length, 121);
  for (let i = 0; i < 6; i++) assert.equal(pointHoles(i).length, 10);
  assert.equal(new Set([0, 1, 2, 3, 4, 5].flatMap(pointHoles)).size, 60);
});

test('players start in opposite points (two), alternate points (three)', () => {
  const s = g.create({}, 0, ctx2);
  assert.equal(Object.keys(s.board).length, 20);
  assert.equal((s.home.amber + 3) % 6, s.home.teal);
  const three = g.create({}, 0, { seats: ['amber', 'teal', 'violet'], random: () => 0.5 });
  assert.deepEqual(Object.values(three.home), [0, 2, 4]);
  assert.throws(() => g.create({}, 0, { seats: ['amber'], random: () => 0.5 }));
});

test('a step to a neighbour, or a chain of hops over anyone’s marbles', () => {
  // A line: marble at 0,0; others at 1,0 and 3,0; empty at 2,0 and 4,0 → hop to 2,0, then on to 4,0.
  const board = { '0,0': 'amber', '1,0': 'teal', '3,0': 'amber' };
  const r = reachable(board, '0,0');
  assert.deepEqual(r.get('2,0'), ['0,0', '2,0']);
  assert.deepEqual(r.get('4,0'), ['0,0', '2,0', '4,0']);
  assert.ok(r.has('0,1') && !r.has('1,0'), 'a step to an empty neighbour, not onto a marble');
});

test('moves are checked; turns go round', () => {
  let s = g.create({}, 0, ctx2);
  const m = bestMove(s, 'amber', () => 0)!;
  assert.match(err(g.act(s, 'teal', { type: 'move', ...m }, 0, ctx2)) ?? '', /turn/);
  assert.match(err(g.act(s, 'amber', { type: 'move', from: m.from, to: '0,0' }, 0, ctx2)) ?? '', /can’t get there/);
  s = ok(g.act(s, 'amber', { type: 'move', ...m }, 0, ctx2));
  assert.equal(s.board[m.to], 'amber');
  assert.equal(s.order[s.turn], 'teal');
});

test('filling the opposite point wins, and a never-moved blocker counts as filled', () => {
  const s = g.create({}, 0, ctx2);
  const target = pointHoles((s.home.amber + 3) % 6);
  // Amber has nine home and one a step away; teal left one marble (never moved) in its own start.
  const board: Record<string, string> = {};
  target.slice(0, 8).forEach((h) => { board[h] = 'amber'; });
  board[target[8]] = 'teal';
  const free = target[9];
  const outside = HOLES.find((h) => !target.includes(h) && reachable({ ...board, [h]: 'amber' }, h).has(free))!;
  board[outside] = 'amber';
  const won = ok(g.act({ ...s, board, moved: [...target.slice(0, 8), outside] }, 'amber', { type: 'move', from: outside, to: free }, 0, ctx2));
  assert.equal(won.result?.winner, 'amber');
});
