import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hearts as g, legalPlays, passTarget, type HeartsState, type HeartsView } from './hearts';

const seats = ['amber', 'teal', 'violet', 'rose'];
const ctx = { seats, random: () => 0.4 };
const ok = (r: ReturnType<typeof g.act>): HeartsState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);

test('passing: three cards, left then right then across then none', () => {
  assert.equal(passTarget(seats, 'amber', 'left'), 'teal');
  assert.equal(passTarget(seats, 'amber', 'right'), 'rose');
  assert.equal(passTarget(seats, 'amber', 'across'), 'violet');
  let s = g.create({}, 0, ctx);
  assert.equal(s.phase, 'pass');
  assert.match(err(g.act(s, 'amber', { type: 'pass', cards: s.hands.amber.slice(0, 2) }, 0, ctx)) ?? '', /three/);
  const gave = s.hands.amber.slice(0, 3);
  for (const p of seats) s = ok(g.act(s, p, { type: 'pass', cards: s.hands[p].slice(0, 3) }, 0, ctx));
  assert.equal(s.phase, 'play');
  assert.ok(gave.every((c) => s.hands.teal.includes(c)), 'amber’s three went left, to teal');
  assert.ok(s.hands[s.order[s.turn]].includes('2C'), 'the 2 of clubs leads');
});

test('what may be played: the 2 of clubs first, follow suit, no points on the first trick, hearts once broken', () => {
  const base = { trick: [], broken: false, tricksPlayed: 0 };
  assert.deepEqual(legalPlays({ ...base, hands: { a: ['2C', '5H', 'QS'] } }, 'a'), ['2C']);
  assert.deepEqual(legalPlays({ ...base, trick: [{ seat: 'b', card: '2C' }], hands: { a: ['5H', 'QS', '4D'] } }, 'a'), ['4D'], 'void in clubs: no points on the first trick');
  assert.deepEqual(legalPlays({ ...base, tricksPlayed: 3, hands: { a: ['5H', '4D'] } }, 'a'), ['4D'], 'hearts not broken: no heart lead');
  assert.deepEqual(legalPlays({ ...base, tricksPlayed: 3, broken: true, hands: { a: ['5H', '4D'] } }, 'a'), ['5H', '4D']);
  assert.deepEqual(legalPlays({ ...base, tricksPlayed: 3, trick: [{ seat: 'b', card: '9D' }], hands: { a: ['5H', '4D', 'KD'] } }, 'a'), ['4D', 'KD'], 'follow suit');
});

test('a whole game: scores move, someone reaches 100, the lowest wins and everyone is placed', () => {
  // Play with the lowest legal card each time, passing the first three.
  let s = g.create({}, 0, ctx);
  let hands = 0;
  for (let i = 0; i < 5000 && !s.result; i++) {
    const seat = g.turn!(s)[0];
    s = g.timeout!(s, seat, 0, ctx);
    if (s.lastHand && s.hand > hands) hands = s.hand;
  }
  assert.ok(s.result, 'the game ended');
  assert.ok(Object.values(s.scores).some((v) => v >= 100));
  assert.equal(s.result!.placings!.flat().length, 4);
  const best = Math.min(...Object.values(s.scores));
  assert.ok(s.result!.placings![0].every((p) => s.scores[p] === best));
  for (const p of seats) assert.equal(s.scores[p] % 1, 0);
});

test('views: only your own cards; everyone sees the trick and the scores', () => {
  const s = g.create({}, 0, ctx);
  const v = g.view(s, 0, 'amber') as HeartsView;
  assert.equal(v.cards?.length, 13);
  assert.ok(!JSON.stringify(v).includes(JSON.stringify(s.hands.teal)));
  assert.equal((g.view(s, 0, null) as HeartsView).cards, null);
});
