import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spades as g, legalPlays, scorePair, trickWinner, type SpadesState } from './spades';

const seats = ['amber', 'teal', 'violet', 'rose'];
const ctx = { seats, random: () => 0.4 };
const ok = (r: ReturnType<typeof g.act>): SpadesState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);

test('partners sit across, and bidding goes round from the one after the dealer', () => {
  let s = g.create({}, 0, ctx);
  assert.deepEqual(s.pairs, [['amber', 'violet'], ['teal', 'rose']]);
  assert.equal(s.phase, 'bid');
  assert.equal(s.order[s.turn], 'teal');
  assert.match(err(g.act(s, 'amber', { type: 'bid', bid: 3 }, 0, ctx)) ?? '', /turn/);
  assert.match(err(g.act(s, 'teal', { type: 'bid', bid: 14 }, 0, ctx)) ?? '', /nil to 13/);
  for (const [p, b] of [['teal', 3], ['violet', 0], ['rose', 4], ['amber', 2]] as const) s = ok(g.act(s, p, { type: 'bid', bid: b }, 0, ctx));
  assert.equal(s.phase, 'play');
  assert.equal(s.order[s.turn], 'teal', 'the one after the dealer leads');
  assert.equal(s.log.at(-3)?.text, 'bid nil');
});

test('what may be played: no spade lead until broken, follow suit, trump when void', () => {
  assert.deepEqual(legalPlays({ trick: [], broken: false, hands: { a: ['5S', '4D'] } }, 'a'), ['4D']);
  assert.deepEqual(legalPlays({ trick: [], broken: false, hands: { a: ['5S', 'AS'] } }, 'a'), ['5S', 'AS'], 'only spades left');
  assert.deepEqual(legalPlays({ trick: [], broken: true, hands: { a: ['5S', '4D'] } }, 'a'), ['5S', '4D']);
  assert.deepEqual(legalPlays({ trick: [{ seat: 'b', card: '9D' }], broken: false, hands: { a: ['5S', '4D', 'KD'] } }, 'a'), ['4D', 'KD']);
  assert.deepEqual(legalPlays({ trick: [{ seat: 'b', card: '9D' }], broken: false, hands: { a: ['5S', '4H'] } }, 'a'), ['5S', '4H']);
});

test('the highest spade takes the trick, or else the highest of the suit led', () => {
  assert.equal(trickWinner([{ seat: 'a', card: 'KD' }, { seat: 'b', card: 'AD' }, { seat: 'c', card: '2S' }, { seat: 'd', card: 'AH' }]), 'c');
  assert.equal(trickWinner([{ seat: 'a', card: 'KD' }, { seat: 'b', card: 'AD' }, { seat: 'c', card: '2C' }, { seat: 'd', card: 'AH' }]), 'b');
});

test('scoring: contracts, bags, sets and nil', () => {
  assert.deepEqual(scorePair([3, 2], [4, 2]), { points: 51, bags: 1, note: 'made 5 with 1 bag' });
  assert.deepEqual(scorePair([3, 2], [2, 2]), { points: -50, bags: 0, note: 'set: 4 of 5' });
  assert.deepEqual(scorePair([0, 4], [0, 5]), { points: 141, bags: 1, note: 'nil made +100, made 4 with 1 bag' });
  assert.deepEqual(scorePair([0, 4], [2, 3]), { points: -140, bags: 2, note: 'nil broken −100, set: 3 of 4' }, 'the nil player’s tricks don’t help the contract');
});

test('every ten bags cost 100', () => {
  let s = g.create({}, 0, ctx);
  s = { ...s, scores: { amber: 495, teal: 100 }, bags: { amber: 9, teal: 0 } };
  for (const [p, b] of [['teal', 1], ['violet', 1], ['rose', 1], ['amber', 1]] as const) s = ok(g.act(s, p, { type: 'bid', bid: b }, 0, ctx));
  // Rig the last trick: amber and violet have taken 12 between them already.
  const last: Record<string, string[]> = { amber: ['AS'], teal: ['2C'], violet: ['3C'], rose: ['4C'] };
  s = { ...s, hands: last, tricksPlayed: 12, tricks: { amber: 6, violet: 6, teal: 0, rose: 0 }, broken: true, turn: 0 };
  for (const p of seats) s = ok(g.act(s, p, { type: 'play', card: last[p][0] }, 0, ctx));
  // 2 bid, 13 taken: 20 + 11 bags; 9 + 11 = 20 bags costs 100 twice, none left.
  assert.equal(s.lastHand?.points.amber, 20 + 11 - 200);
  assert.equal(s.bags.amber, 0);
  assert.equal(s.scores.amber, 495 + 31 - 200);
  assert.equal(s.result, null);
});

test('resigning loses the game for your pair', () => {
  const s = ok(g.act(g.create({}, 0, ctx), 'violet', { type: 'resign' }, 0, ctx));
  assert.deepEqual(s.result?.placings, [['teal', 'rose'], ['amber', 'violet']]);
  assert.equal(s.result?.teamWin, true);
});

test('the first pair to 500 wins as a team, both partners placed first', () => {
  let s = g.create({}, 0, ctx);
  s = { ...s, scores: { amber: 480, teal: 100 } };
  for (const [p, b] of [['teal', 1], ['violet', 1], ['rose', 1], ['amber', 1]] as const) s = ok(g.act(s, p, { type: 'bid', bid: b }, 0, ctx));
  const last: Record<string, string[]> = { amber: ['AS'], teal: ['2C'], violet: ['3C'], rose: ['4C'] };
  s = { ...s, hands: last, tricksPlayed: 12, tricks: { amber: 1, violet: 1, teal: 5, rose: 5 }, broken: true, turn: 0 };
  for (const p of seats) s = ok(g.act(s, p, { type: 'play', card: last[p][0] }, 0, ctx));
  assert.equal(s.scores.amber, 480 + 21);
  assert.deepEqual(s.result?.placings, [['amber', 'violet'], ['teal', 'rose']]);
  assert.equal(s.result?.teamWin, true);
});
