import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chineseCheckers as g, HOLES, partnerIn, pointHoles, reachable, bestMove, type CheckersState } from './chinesecheckers';

const ok = (r: ReturnType<typeof g.act>): CheckersState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
const ctx2 = { seats: ['amber', 'teal'], random: () => 0.5 };

test('the star: 121 holes, six points of ten', () => {
  assert.equal(HOLES.length, 121);
  for (let i = 0; i < 6; i++) assert.equal(pointHoles(i).length, 10);
  assert.equal(new Set([0, 1, 2, 3, 4, 5].flatMap(pointHoles)).size, 60);
});

test('players start in opposite points (two), alternate points (three)', () => {
  const s = g.create({ teams: false }, 0, ctx2);
  assert.equal(Object.keys(s.board).length, 20);
  assert.equal((s.home.amber + 3) % 6, s.home.teal);
  const three = g.create({ teams: false }, 0, { seats: ['amber', 'teal', 'violet'], random: () => 0.5 });
  assert.deepEqual(Object.values(three.home), [0, 2, 4]);
  assert.throws(() => g.create({ teams: false }, 0, { seats: ['amber'], random: () => 0.5 }));
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
  let s = g.create({ teams: false }, 0, ctx2);
  const m = bestMove(s, 'amber', () => 0)!;
  assert.match(err(g.act(s, 'teal', { type: 'move', ...m }, 0, ctx2)) ?? '', /turn/);
  assert.match(err(g.act(s, 'amber', { type: 'move', from: m.from, to: '0,0' }, 0, ctx2)) ?? '', /can’t get there/);
  s = ok(g.act(s, 'amber', { type: 'move', ...m }, 0, ctx2));
  assert.equal(s.board[m.to], 'amber');
  assert.equal(s.order[s.turn], 'teal');
});

test('filling the opposite point wins, and a never-moved blocker counts as filled', () => {
  const s = g.create({ teams: false }, 0, ctx2);
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

test('team play: partners in opposite points; the first to finish waits; both finishing wins for the team', () => {
  const ctx4 = { seats: ['amber', 'teal', 'violet', 'rose'], random: () => 0.5 };
  const s0 = g.create({ teams: true }, 0, ctx4);
  assert.equal(s0.teams, true);
  assert.equal(partnerIn(s0, 'amber'), 'violet');
  /** A board where `p` is one step from filling their target (and nobody's left at home). */
  const nearlyDone = (base: CheckersState, p: string, also: Record<string, string> = {}) => {
    const target = pointHoles((base.home[p] + 3) % 6);
    for (const free of target) {
      const board: Record<string, string> = { ...also };
      for (const h of target) if (h !== free) board[h] = p;
      const from = HOLES.find((h) => !target.includes(h) && !board[h] && reachable({ ...board, [h]: p }, h).has(free));
      if (from) { board[from] = p; return { board, from, free, moved: [...target.filter((h) => h !== free), from] }; }
    }
    throw new Error('no way in');
  };
  // Amber finishes first: the game goes on, and amber's turns are skipped.
  const a = nearlyDone(s0, 'amber');
  let s = ok(g.act({ ...s0, board: a.board, moved: a.moved, turn: 0 }, 'amber', { type: 'move', from: a.from, to: a.free }, 0, ctx4));
  assert.equal(s.result, null);
  assert.deepEqual(s.done, ['amber']);
  assert.equal(s.order[s.turn], 'teal');
  // Then violet (amber's partner) finishes: the team wins.
  const filled = Object.fromEntries(Object.entries(s.board).filter(([, p]) => p === 'amber'));
  const v = nearlyDone(s0, 'violet', filled);
  s = ok(g.act({ ...s, board: v.board, moved: [...s.moved, ...v.moved], turn: 2 }, 'violet', { type: 'move', from: v.from, to: v.free }, 0, ctx4));
  assert.deepEqual(s.result?.placings?.[0], ['violet', 'amber']);
  assert.equal(s.result?.teamWin, true);
});
