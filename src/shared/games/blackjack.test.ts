import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blackjack, handValue, START_CHIPS, type BlackjackState, type BlackjackView } from './blackjack';

const ctx = (seats = ['amber', 'teal']) => ({ seats, random: Math.random });
const ok = (r: ReturnType<typeof blackjack.act>): BlackjackState => { if ('error' in r) throw new Error(r.error); return r.state; };
/** A game whose shoe deals these cards first: per player two each in rounds, then the dealer's two, then hits. */
function rigged(shoe: string[], seats = ['amber', 'teal'], hands = 10): BlackjackState {
  const s = blackjack.create({ hands }, 0, ctx(seats));
  return { ...s, shoe: [...shoe, ...s.shoe] };
}

test('hand values: aces count 1 or 11', () => {
  assert.deepEqual(handValue(['AS', 'KD']), { total: 21, soft: true });
  assert.deepEqual(handValue(['AS', 'AD', '9C']), { total: 21, soft: true });
  assert.deepEqual(handValue(['AS', '9D', 'KC']), { total: 20, soft: false });
  assert.deepEqual(handValue(['TS', '9D', '5C']), { total: 24, soft: false });
});

test('a hand: bets, hit, stand, the dealer draws to 17, and the payouts', () => {
  // Deal order: amber, teal, amber, teal, dealer x2; then hits.
  let s = rigged(['TS', '9H', '7D', '9C', 'TC', '6H', '5S', '2D']);
  s = ok(blackjack.act(s, 'amber', { type: 'bet', amount: 100 }, 0, ctx()));
  assert.equal(s.phase, 'betting');
  s = ok(blackjack.act(s, 'teal', { type: 'bet', amount: 50 }, 0, ctx()));
  assert.equal(s.phase, 'playing');
  assert.equal((blackjack.view(s, 0, null) as BlackjackView).dealer[1], null, 'the hole card is hidden');
  // Amber has T,7 = 17 and stands; teal has 9,9 = 18 and stands. Dealer T,6 = 16 draws 5 = 21.
  s = ok(blackjack.act(s, 'amber', { type: 'stand' }, 0, ctx()));
  s = ok(blackjack.act(s, 'teal', { type: 'stand' }, 0, ctx()));
  assert.deepEqual(s.last?.deltas, { amber: -100, teal: -50 });
  assert.equal(s.hand, 2);
  assert.equal(s.phase, 'betting');
});

test('blackjack pays 3 to 2; busting loses at once; doubling takes one card', () => {
  // amber: A,K = blackjack. teal: 5,6 = 11, doubles and gets a 9 = 20. Dealer 9,8 = 17 stands.
  let s = rigged(['AS', '5H', 'KD', '6C', '9S', '8H', '9D']);
  s = ok(blackjack.act(s, 'amber', { type: 'bet', amount: 100 }, 0, ctx()));
  s = ok(blackjack.act(s, 'teal', { type: 'bet', amount: 100 }, 0, ctx()));
  assert.deepEqual(blackjack.turn!(s), ['teal'], 'amber’s blackjack needs no turn');
  s = ok(blackjack.act(s, 'teal', { type: 'double' }, 0, ctx()));
  assert.deepEqual(s.last?.deltas, { amber: 150, teal: 200 });
  assert.deepEqual(s.chips, { amber: START_CHIPS + 150, teal: START_CHIPS + 200 });
  // Bust: teal hits on 16 and gets a ten.
  let b = rigged(['TS', 'TH', '7D', '6C', '9S', '8H', 'KD']);
  b = ok(blackjack.act(b, 'amber', { type: 'bet', amount: 10 }, 0, ctx()));
  b = ok(blackjack.act(b, 'teal', { type: 'bet', amount: 40 }, 0, ctx()));
  b = ok(blackjack.act(b, 'amber', { type: 'stand' }, 0, ctx()));
  b = ok(blackjack.act(b, 'teal', { type: 'hit' }, 0, ctx()));
  assert.equal(b.last?.deltas.teal, -40);
});

test('the session ends after the last hand; most chips first', () => {
  let s = rigged(['AS', '5H', 'KD', '6C', '9S', '8H', '2D'], ['amber', 'teal'], 5);
  s = { ...s, hand: 5 };
  s = ok(blackjack.act(s, 'amber', { type: 'bet', amount: 100 }, 0, ctx()));
  s = ok(blackjack.act(s, 'teal', { type: 'bet', amount: 100 }, 0, ctx()));
  s = ok(blackjack.act(s, 'teal', { type: 'stand' }, 0, ctx()));
  assert.deepEqual(s.result?.placings, [['amber'], ['teal']]);
});
