import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ginRummy as g, bestMelds, layOff, type GinState } from './ginrummy';

const ctx = { seats: ['amber', 'teal'], random: () => 0.4 };
const ok = (r: ReturnType<typeof g.act>): GinState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
const rigged = (amber: string[], teal: string[], extra: Partial<GinState> = {}): GinState => ({
  ...g.create({}, 0, ctx), hands: { amber, teal }, deck: ['2C', '3C', '4C', '5C', '6C', '7C'], discard: ['9D'], turn: 'amber', phase: 'draw', took: null, ...extra,
});

test('melds are arranged for the least deadwood', () => {
  const r = bestMelds(['AS', '2S', '3S', '4S', '4H', '4D', 'KC', 'QC', '9H', '2D']);
  // 4S goes in the run or the set: either way, deadwood is K Q 9 2 = 31... or the set takes 4S and the run is A-2-3.
  assert.equal(r.points, 10 + 10 + 9 + 2);
  assert.equal(r.melds.flat().length, 6);
  assert.equal(bestMelds(['7S', '7H', '7D', '7C', '8S', '9S']).points, 0, '7S in the run 7-8-9, the other three a set');
});

test('laying off: on the ends of runs and onto sets of three', () => {
  const r = layOff([['4S', '5S', '6S'], ['9H', '9D', '9C']], ['3S', '7S', '9S', 'KD']);
  assert.deepEqual(r.left, ['KD']);
  assert.equal(r.laid.length, 3);
});

test('a knock scores the difference; laying off counts; an undercut turns it round', () => {
  // amber: two runs and a set, and the 2D: deadwood 2.
  const amber = ['AS', '2S', '3S', '5H', '6H', '7H', 'JD', 'JC', 'JH', '2D'];
  let s = rigged(amber, ['8H', '4S', 'KD', 'KS', 'QD', 'QS', '5C', '9C', 'TC', '3D']);
  s = ok(g.act(s, 'amber', { type: 'draw', from: 'deck' }, 0, ctx)); // the 2C
  assert.match(err(g.act(s, 'amber', { type: 'discard', card: 'JD', knock: true }, 0, ctx)) ?? '', /10 or less/);
  s = ok(g.act(s, 'amber', { type: 'discard', card: '2C', knock: true }, 0, ctx));
  const last = s.lastHand!;
  assert.equal(last.kind, 'knock');
  assert.equal(last.shown.amber.points, 2);
  assert.deepEqual([...last.shown.teal.laid].sort(), ['4S', '8H']);
  // teal: K K Q Q 5 9 10 3 = 10+10+10+10+5+9+10+3 = 67
  assert.equal(last.points, 67 - 2);
  assert.equal(s.scores.amber, 65);
});

test('gin scores 25 more, nothing laid off; an undercut scores 25 for the defender', () => {
  const ginHand = ['AS', '2S', '3S', '5H', '6H', '7H', 'JD', 'JC', 'JH', '9C'];
  let s = rigged(ginHand, ['4S', 'KD', 'KS', 'QD', 'QS', '5C', '8C', 'TC', '3D', '2H'], { deck: ['TC', '2C', '3C', '4C'] });
  // amber draws a card she doesn't need and throws the 9C... use the 9D discard to make 9C 9D? no: just knock with no deadwood.
  s = ok(g.act(s, 'amber', { type: 'draw', from: 'deck' }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'discard', card: '9C', knock: false }, 0, ctx));
  assert.equal(s.turn, 'teal');
  const u = rigged(['AS', '2S', '3S', '5H', '6H', '7H', 'JD', 'JC', 'JH', '9C'], ['AD', '2D', '3D', '4C', '5C', '6C', 'KH', 'KC', 'KD', 'AH']);
  let t = ok(g.act(u, 'amber', { type: 'draw', from: 'deck' }, 0, ctx));
  t = ok(g.act(t, 'amber', { type: 'discard', card: '2C', knock: true }, 0, ctx));
  // amber deadwood 9 (the 9C); teal 1 (the AH): undercut, 25 + 8.
  assert.equal(t.lastHand?.kind, 'undercut');
  assert.equal(t.lastHand?.winner, 'teal');
  assert.equal(t.scores.teal, 33);
  const gin = ok(g.act(ok(g.act(rigged(['AS', '2S', '3S', '5H', '6H', '7H', 'JD', 'JC', 'JH', '8H'], ['KD', 'KS', 'QD', 'QS', '5C', '9C', 'TC', '3D', '2H', '4H'], { discard: ['9H'] }), 'amber', { type: 'draw', from: 'discard' }, 0, ctx)), 'amber', { type: 'discard', card: '5H', knock: true }, 0, ctx));
  assert.equal(gin.lastHand?.kind, 'gin');
  assert.equal(gin.lastHand?.shown.teal.laid.length, 0);
});

test('the deck running low makes the hand a draw', () => {
  let s = rigged(['AS', '2S', '3S', '5H', '6H', '7H', 'JD', 'JC', 'JH', '9C'], ['KD', 'KS', 'QD', 'QS', '5C', '9H', 'TC', '3D', '2H', '4H'], { deck: ['2C', '3C', '4C'] });
  s = ok(g.act(s, 'amber', { type: 'draw', from: 'deck' }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'discard', card: '2C' }, 0, ctx));
  assert.equal(s.lastHand?.kind, 'draw');
  assert.equal(s.hand, 2);
  assert.equal(s.hands.amber.length, 10);
});
