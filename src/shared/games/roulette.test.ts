import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roulette as g, payout, WHEEL, REDS, type RouletteState } from './roulette';

const ok = (r: ReturnType<typeof g.act>): RouletteState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);

test('the wheel and the payouts', () => {
  assert.equal(new Set(WHEEL).size, 37);
  assert.equal(REDS.size, 18);
  assert.equal(payout('n17', 17), 35);
  assert.equal(payout('n0', 0), 35);
  assert.equal(payout('red', 1), 1);
  assert.equal(payout('black', 1), 0);
  assert.equal(payout('red', 0), 0, 'zero loses outside bets');
  assert.equal(payout('d2', 13), 2);
  assert.equal(payout('d2', 25), 0);
  assert.equal(payout('c1', 34), 2);
  assert.equal(payout('c3', 36), 2);
  assert.equal(payout('high', 19), 1);
  assert.equal(payout('low', 19), 0);
});

test('bets come off your chips, the wheel spins when everyone is done, and winners are paid', () => {
  // random 0.5 → randInt(37) = 18 (red, even, low, dozen 2, column 3).
  const ctx = { seats: ['amber', 'teal'], random: () => 0.5 };
  let s = g.create(g.defaultConfig, 0, ctx);
  assert.match(err(g.act(s, 'amber', { type: 'bet', spot: 'n37', amount: 10 }, 0, ctx)) ?? '', /place to bet/);
  assert.match(err(g.act(s, 'amber', { type: 'bet', spot: 'red', amount: 2 }, 0, ctx)) ?? '', /at least/);
  s = ok(g.act(s, 'amber', { type: 'bet', spot: 'n18', amount: 10 }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'bet', spot: 'black', amount: 50 }, 0, ctx));
  assert.equal(s.chips.amber, 940);
  s = ok(g.act(s, 'amber', { type: 'done' }, 0, ctx));
  assert.match(err(g.act(s, 'amber', { type: 'bet', spot: 'red', amount: 10 }, 0, ctx)) ?? '', /done/);
  s = ok(g.act(s, 'teal', { type: 'bet', spot: 'even', amount: 100 }, 0, ctx));
  s = ok(g.act(s, 'teal', { type: 'done' }, 0, ctx));
  assert.equal(s.last?.number, 18);
  assert.equal(s.chips.amber, 940 + 360, '35 to 1 on 18 plus the stake; black lost');
  assert.equal(s.last?.net.amber, 300);
  assert.equal(s.chips.teal, 1100);
  assert.equal(s.spin, 2);
});

test('after the last spin the most chips wins', () => {
  const ctx = { seats: ['amber', 'teal'], random: () => 0.5 };
  let s: RouletteState = { ...g.create(g.defaultConfig, 0, ctx), spin: 10 };
  s = ok(g.act(s, 'amber', { type: 'bet', spot: 'n18', amount: 10 }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'done' }, 0, ctx));
  s = ok(g.act(s, 'teal', { type: 'done' }, 0, ctx));
  assert.equal(s.result?.winner, 'amber');
});
