import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridge as g, callWords, legalCalls, scoreDeal, vulnerable, trickWinner, type BridgeState } from './bridge';

const ctx = { seats: ['amber', 'teal', 'violet', 'rose'], random: () => 0.37 };
const ok = (r: ReturnType<typeof g.act>): BridgeState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);

test('scoring: made contracts, games, slams, doubles and undertricks', () => {
  assert.equal(scoreDeal({ level: 2, strain: 'H', doubled: 0, declarer: 'amber' }, 8, false).declarer, 110, '2♥ made: 60 + 50');
  assert.equal(scoreDeal({ level: 4, strain: 'S', doubled: 0, declarer: 'amber' }, 10, false).declarer, 420, '4♠: 120 + 300');
  assert.equal(scoreDeal({ level: 3, strain: 'N', doubled: 0, declarer: 'amber' }, 10, true).declarer, 630, '3NT +1 vulnerable: 100 + 500 + 30');
  assert.equal(scoreDeal({ level: 6, strain: 'H', doubled: 0, declarer: 'amber' }, 12, false).declarer, 980, 'small slam: 180 + 300 + 500');
  assert.equal(scoreDeal({ level: 2, strain: 'S', doubled: 1, declarer: 'amber' }, 8, false).declarer, 470, '2♠ doubled made: 120 + 300 + 50');
  assert.equal(scoreDeal({ level: 4, strain: 'H', doubled: 0, declarer: 'amber' }, 8, true).defenders, 200, 'two down vulnerable');
  assert.equal(scoreDeal({ level: 4, strain: 'H', doubled: 1, declarer: 'amber' }, 7, false).defenders, 500, 'three down doubled: 100 + 200 + 200');
});

test('Chicago vulnerability: none, dealer’s side, dealer’s side, both', () => {
  assert.deepEqual([1, 2, 3, 4].map(vulnerable), [{ NS: false, EW: false }, { NS: false, EW: true }, { NS: true, EW: false }, { NS: true, EW: true }]);
});

test('calls: higher bids only, doubles of the other side, redoubles of a double', () => {
  const a = [{ seat: 'amber', call: '1H' }];
  const teal = legalCalls(a, 'teal');
  assert.ok(teal.includes('X') && !teal.includes('1C') && teal.includes('1S') && !teal.includes('XX'));
  const b = [...a, { seat: 'teal', call: 'X' }];
  assert.ok(legalCalls(b, 'violet').includes('XX'));
  assert.ok(!legalCalls(b, 'rose').includes('X'));
  assert.equal(callWords('2H'), '2♥: hearts, eight tricks');
});

test('an auction to a contract, the declarer, and dummy played by the declarer', () => {
  let s = g.create({}, 0, ctx);
  assert.equal(s.turn, 'amber', 'North deals and calls first');
  for (const [p, c] of [['amber', '1S'], ['teal', 'P'], ['violet', '3S'], ['rose', 'P'], ['amber', '4S'], ['teal', 'P'], ['violet', 'P']] as const) s = ok(g.act(s, p, { type: 'call', call: c }, 0, ctx));
  assert.match(err(g.act(s, 'violet', { type: 'call', call: '5S' }, 0, ctx)) ?? '', /turn/);
  s = ok(g.act(s, 'rose', { type: 'call', call: 'P' }, 0, ctx));
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.contract, { level: 4, strain: 'S', doubled: 0, declarer: 'amber' }, 'North named spades first');
  assert.equal(s.turn, 'teal', 'the player on the declarer’s left leads');
  s = ok(g.act(s, 'teal', { type: 'play', card: s.hands.teal[0] }, 0, ctx));
  assert.ok(s.dummyShown);
  // South is dummy: North plays South's card.
  assert.equal(s.turn, 'violet');
  const card = (g.view(s, 0, 'amber') as { legal: string[] }).legal[0];
  assert.match(err(g.act(s, 'violet', { type: 'play', card }, 0, ctx)) ?? '', /turn/);
  s = ok(g.act(s, 'amber', { type: 'play', card }, 0, ctx));
  assert.ok((g.view(s, 0, 'rose') as { dummyHand: unknown }).dummyHand, 'everyone sees dummy');
});

test('four passes: dealt again by the same dealer', () => {
  let s = g.create({}, 0, ctx);
  const before = s.hands.amber.join();
  for (const p of ['amber', 'teal', 'violet', 'rose']) s = ok(g.act(s, p, { type: 'call', call: 'P' }, 0, { ...ctx, random: () => 0.9 }));
  assert.equal(s.deal, 1);
  assert.equal(s.phase, 'auction');
  assert.notEqual(s.hands.amber.join(), before);
});

test('trumps win the trick', () => {
  assert.equal(trickWinner([{ seat: 'a', card: 'AH' }, { seat: 'b', card: '2S' }, { seat: 'c', card: 'KH' }, { seat: 'd', card: 'QH' }], 'S'), 'b');
  assert.equal(trickWinner([{ seat: 'a', card: 'AH' }, { seat: 'b', card: '2S' }, { seat: 'c', card: 'KH' }, { seat: 'd', card: 'QH' }], 'N'), 'a');
});
