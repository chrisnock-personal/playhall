import { test } from 'node:test';
import assert from 'node:assert/strict';
import { craps as g, settle, cantBet, type CrapsState } from './craps';

const ok = (r: ReturnType<typeof g.act>): CrapsState => { if ('error' in r) throw new Error(r.error); return r.state; };
const z = { pass: 0, dontpass: 0, odds: 0, field: 0 };

test('the come-out roll: naturals, craps and the point', () => {
  assert.deepEqual(settle({ ...z, pass: 10, dontpass: 10 }, null, 7), { back: 20, bets: z });
  assert.deepEqual(settle({ ...z, pass: 10, dontpass: 10 }, null, 3), { back: 20, bets: z });
  assert.deepEqual(settle({ ...z, pass: 10, dontpass: 10 }, null, 12), { back: 10, bets: z }, 'don’t pass pushes on 12');
  assert.deepEqual(settle({ ...z, pass: 10 }, null, 6), { back: 0, bets: { ...z, pass: 10 } }, 'the point is set; the bet stays');
});

test('after the point: made pays pass and true odds; seven out pays don’t pass', () => {
  assert.deepEqual(settle({ ...z, pass: 10, odds: 20 }, 4, 4), { back: 20 + 20 + 40, bets: z }, '2 to 1 on 4');
  assert.deepEqual(settle({ ...z, pass: 10, odds: 10 }, 5, 5), { back: 20 + 10 + 15, bets: z }, '3 to 2 on 5');
  assert.deepEqual(settle({ ...z, pass: 10, odds: 10 }, 6, 6), { back: 20 + 10 + 12, bets: z }, '6 to 5 on 6');
  assert.deepEqual(settle({ ...z, pass: 10, odds: 20, dontpass: 10 }, 6, 7), { back: 20, bets: z });
  assert.deepEqual(settle({ ...z, pass: 10 }, 6, 9), { back: 0, bets: { ...z, pass: 10 } });
});

test('the field: one roll, 2 and 12 double', () => {
  assert.equal(settle({ ...z, field: 10 }, null, 12).back, 30);
  assert.equal(settle({ ...z, field: 10 }, 8, 9).back, 20);
  assert.equal(settle({ ...z, field: 10 }, 8, 6).back, 0);
});

test('what can be bet when', () => {
  const s = { point: null, bets: { amber: z }, chips: { amber: 100 } };
  assert.match(cantBet(s, 'amber', 'odds', 10) ?? '', /once there’s a point/);
  assert.match(cantBet({ ...s, point: 6 }, 'amber', 'pass', 10) ?? '', /before the come-out/);
  assert.match(cantBet({ ...s, point: 6 }, 'amber', 'odds', 10) ?? '', /behind a pass/);
  assert.match(cantBet({ ...s, point: 6, bets: { amber: { ...z, pass: 10 } } }, 'amber', 'odds', 25) ?? '', /twice/);
  assert.equal(cantBet({ ...s, point: 6, bets: { amber: { ...z, pass: 10 } } }, 'amber', 'odds', 20), null);
});

test('a roll when everyone is done; a seven out passes the dice; Clear only takes back this roll’s bets', () => {
  // random 0.99 → two sixes (12): craps on the come-out.
  const ctx = { seats: ['amber', 'teal'], random: () => 0.99 };
  let s = g.create(g.defaultConfig, 0, ctx);
  s = ok(g.act(s, 'amber', { type: 'bet', bet: 'pass', amount: 50 }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'clear' }, 0, ctx));
  assert.equal(s.chips.amber, 1000);
  s = ok(g.act(s, 'amber', { type: 'bet', bet: 'dontpass', amount: 50 }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'done' }, 0, ctx));
  s = ok(g.act(s, 'teal', { type: 'done' }, 0, ctx));
  assert.deepEqual(s.last?.dice, [6, 6]);
  assert.equal(s.chips.amber, 1000, 'a push on 12');
  const seven = { ...s, point: 6, bets: { amber: { ...z, pass: 10 }, teal: z }, chips: { amber: 990, teal: 1000 } };
  const r = ok(g.act(ok(g.act(seven, 'amber', { type: 'done' }, 0, { ...ctx, random: (() => { let k = 0; return () => [0.0, 0.99][k++ % 2]; })() })), 'teal', { type: 'done' }, 0, { ...ctx, random: (() => { let k = 0; return () => [0.0, 0.99][k++ % 2]; })() }));
  assert.equal(r.last?.dice[0]! + r.last?.dice[1]!, 7);
  assert.equal(r.shooter, 1);
  assert.equal(r.point, null);
});
