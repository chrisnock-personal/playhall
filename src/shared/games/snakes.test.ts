import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snakes, step, type SnakesState } from './snakes';
import { score } from '../scoring';

// A die that rolls the given values in order.
const dice = (...values: number[]) => ({ seats: ['amber', 'teal', 'violet'], random: () => (values.shift()! - 1) / 6 + 0.01 });

test('ladders, snakes and the bounce at 100', () => {
  assert.deepEqual(step(0, 4), { from: 0, to: 25, via: 'ladder', bounced: false });
  assert.deepEqual(step(22, 5), { from: 22, to: 5, via: 'snake', bounced: false });
  assert.deepEqual(step(97, 5), { from: 97, to: 98, via: null, bounced: true });
  assert.deepEqual(step(97, 3), { from: 97, to: 100, via: null, bounced: false });
});

test('turns go round the seated players; only the player to move may roll', () => {
  const ctx = dice(2, 3, 1);
  let s = snakes.create({}, 0, ctx);
  assert.deepEqual(s.order, ['amber', 'teal', 'violet']);
  assert.ok('error' in snakes.act(s, 'teal', { type: 'roll' }, 0, ctx));
  for (const seat of ['amber', 'teal', 'violet']) {
    const r = snakes.act(s, seat, { type: 'roll' }, 0, ctx);
    assert.ok(!('error' in r)); if (!('error' in r)) s = r.state;
  }
  assert.deepEqual(s.pos, { amber: 2, teal: 3, violet: 1 });
  assert.deepEqual(snakes.turn!(s), ['amber']);
});

test('reaching 100 wins, and the rest are placed by height: second place earns a point', () => {
  const ctx = dice(3);
  const s: SnakesState = { order: ['amber', 'teal', 'violet'], pos: { amber: 97, teal: 60, violet: 80 }, turn: 0, rolls: [], result: null };
  const r = snakes.act(s, 'amber', { type: 'roll' }, 0, ctx);
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.deepEqual(r.state.result?.placings, [['amber'], ['violet'], ['teal']]);
  const points = score(r.state.result!, ['amber', 'teal', 'violet']);
  assert.deepEqual([points.amber.points, points.violet.points, points.teal.points], [3, 1, 0]);
});

test('out of time: the die is rolled for you', () => {
  const ctx = dice(6);
  const s = snakes.create({}, 0, ctx);
  const t = snakes.timeout!(s, 'amber', 0, ctx);
  assert.equal(t.pos.amber, 6);
  assert.deepEqual(snakes.turn!(t), ['teal']);
});
