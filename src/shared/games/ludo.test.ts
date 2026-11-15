import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ludo, square, HOME, type LudoState } from './ludo';
import { score } from '../scoring';

const dice = (...values: number[]) => ({ seats: ['amber', 'teal'], random: () => (values.shift()! - 1) / 6 + 0.01 });
const ok = (r: ReturnType<typeof ludo.act>): LudoState => { if ('error' in r) throw new Error(r.error); return r.state; };
const base = (tokens: Record<string, number[]>, extra: Partial<LudoState> = {}): LudoState =>
  ({ order: Object.keys(tokens), tokens, turn: 0, roll: null, sixes: 0, log: [], result: null, ...extra });

test('a 6 brings a token out and earns another roll; anything else with all in the yard passes', () => {
  let s = ludo.create({}, 0, dice());
  s = ok(ludo.act(s, 'amber', { type: 'roll' }, 0, dice(3)));
  assert.equal(s.roll, null);
  assert.deepEqual(ludo.turn!(s), ['teal'], 'no move with a 3: teal’s turn');
  s = ok(ludo.act(s, 'teal', { type: 'roll' }, 0, dice(6)));
  assert.equal(s.roll, 6);
  s = ok(ludo.act(s, 'teal', { type: 'move', token: 2 }, 0, dice()));
  assert.equal(s.tokens.teal[2], 0);
  assert.equal(square('teal', 0), 13);
  assert.deepEqual(ludo.turn!(s), ['teal'], 'a 6 rolls again');
});

test('landing on an opponent sends it home, except on a safe square', () => {
  // Amber at progress 10 (square 10); teal at progress 49 (square (13+49)%52 = 10).
  let s = base({ amber: [8, -1, -1, -1], teal: [49, -1, -1, -1] });
  s = ok(ludo.act(s, 'amber', { type: 'roll' }, 0, dice(2)));
  s = ok(ludo.act(s, 'amber', { type: 'move', token: 0 }, 0, dice()));
  assert.equal(s.tokens.teal[0], -1, 'captured');
  // Square 8 is a star: no capture there.
  let t = base({ amber: [5, -1, -1, -1], teal: [47, -1, -1, -1] });
  assert.equal(square('teal', 47), 8);
  t = ok(ludo.act(t, 'amber', { type: 'roll' }, 0, dice(3)));
  t = ok(ludo.act(t, 'amber', { type: 'move', token: 0 }, 0, dice()));
  assert.equal(t.tokens.teal[0], 47);
});

test('home needs an exact roll; all four home wins, the rest placed by progress', () => {
  const s = base({ amber: [HOME, HOME, HOME, 54], teal: [30, 20, -1, -1], violet: [50, 40, 10, -1] });
  assert.ok('error' in ludo.act(ok(ludo.act(s, 'amber', { type: 'roll' }, 0, dice(4))), 'amber', { type: 'move', token: 3 }, 0, dice()), 'overshoot');
  const r = ok(ludo.act(ok(ludo.act(s, 'amber', { type: 'roll' }, 0, dice(2))), 'amber', { type: 'move', token: 3 }, 0, dice()));
  assert.deepEqual(r.result?.placings, [['amber'], ['violet'], ['teal']]);
  const pts = score(r.result!, ['amber', 'teal', 'violet']);
  assert.deepEqual([pts.amber.points, pts.violet.points, pts.teal.points], [3, 1, 0]);
});

test('three 6s in a row end the turn', () => {
  let s = base({ amber: [10, -1, -1, -1], teal: [-1, -1, -1, -1] });
  for (let i = 0; i < 2; i++) {
    s = ok(ludo.act(s, 'amber', { type: 'roll' }, 0, dice(6)));
    s = ok(ludo.act(s, 'amber', { type: 'move', token: 0 }, 0, dice()));
  }
  s = ok(ludo.act(s, 'amber', { type: 'roll' }, 0, dice(6)));
  assert.deepEqual(ludo.turn!(s), ['teal']);
});
