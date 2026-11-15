import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poker, bestHand, compareRanks, newDeck, type PokerState, type PokerView } from './poker';
import { score } from '../scoring';

const ctx = (seats = ['amber', 'teal']) => ({ seats, random: Math.random });
const ok = (r: ReturnType<typeof poker.act>): PokerState => { if ('error' in r) throw new Error(r.error); return r.state; };
const h = (...cards: string[]) => bestHand(cards);

test('hand ranking', () => {
  assert.equal(h('AS', 'KS', 'QS', 'JS', 'TS', '2D', '3C').name, 'Straight flush');
  assert.equal(h('9S', '9H', '9D', '9C', '2S', '3D', '4C').name, 'Four of a kind');
  assert.equal(h('9S', '9H', '9D', '2C', '2S', '3D', '4C').name, 'Full house');
  assert.equal(h('AH', '2H', '3H', '4H', '5D', 'KC', 'QC').name, 'Straight', 'the wheel, A-2-3-4-5');
  assert.equal(h('2H', '7H', '9H', 'JH', 'KH', '3C', '4D').name, 'Flush');
  assert.ok(compareRanks(h('AS', 'AD', 'KC', '7H', '5S').rank, h('AH', 'AC', 'QD', 'JS', '9H').rank) > 0, 'kicker decides');
  assert.ok(compareRanks(h('5S', '4D', '3C', '2H', 'AS').rank, h('6S', '5D', '4C', '3H', '2S').rank) < 0, 'the wheel is the lowest straight');
  assert.equal(compareRanks(h('AS', 'KD', '9C', '7H', '5S').rank, h('AH', 'KC', '9D', '7S', '5H').rank), 0, 'a split');
});

test('a hand: blinds, folding gives the pot away, hole cards are hidden', () => {
  let s = poker.create({ startChips: 1500, blindEvery: 5 }, 0, ctx());
  assert.equal(s.hand, 1);
  assert.equal(Object.values(s.bet).reduce((a, b) => a + b, 0), 30, 'blinds of 10 and 20');
  const v = poker.view(s, 0, 'amber') as PokerView;
  assert.equal(v.hole?.length, 2);
  assert.equal((poker.view(s, 0, null) as PokerView).hole, null, 'watchers see no hole cards');
  const first = s.toAct!;
  const other = first === 'amber' ? 'teal' : 'amber';
  s = ok(poker.act(s, first, { type: 'fold' }, 0, ctx()));
  assert.equal(s.hand, 2, 'next hand dealt');
  assert.equal(s.chips[first] + s.chips[other] + Object.values(s.bet).reduce((a, b) => a + b, 0), 3000, 'no chips lost');
  assert.equal(s.last?.winners[0].seat, other);
});

test('check and call through to a showdown; all-in side pots and knock-outs', () => {
  let s = poker.create({ startChips: 1000, blindEvery: 5 }, 0, ctx(['amber', 'teal', 'violet']));
  // Everyone goes all in: the hand runs out and someone is knocked out (or it splits).
  for (let i = 0; i < 3 && !s.result && s.hand === 1; i++) s = ok(poker.act(s, s.toAct!, { type: 'allin' }, 0, ctx(['amber', 'teal', 'violet'])));
  const totalChips = s.order.reduce((n, p) => n + s.chips[p] + (s.bet[p] ?? 0), 0);
  assert.equal(totalChips, 3000, 'chips are conserved');
  assert.ok(s.last && s.last.board.length === 5, 'the board ran out to five');
  assert.ok(Object.keys(s.last!.shown).length >= 2, 'hands shown at the showdown');
});

test('the last player with chips wins; others placed by when they went out', () => {
  let s = poker.create({ startChips: 1000, blindEvery: 5 }, 0, ctx());
  for (let i = 0; i < 200 && !s.result; i++) s = ok(poker.act(s, s.toAct!, { type: 'allin' }, 0, ctx()));
  assert.ok(s.result, 'heads-up all-ins end the game');
  assert.equal(s.result!.placings!.length, 2);
  const pts = score(s.result!, ['amber', 'teal']);
  assert.equal(pts[s.result!.winner!].points, 3);
});

test('raises: too small refused, the bigger stack must respond', () => {
  const s = poker.create({ startChips: 1500, blindEvery: 5 }, 0, ctx());
  const first = s.toAct!;
  assert.ok('error' in poker.act(s, first, { type: 'raise', to: 25 }, 0, ctx()), 'below a min raise');
  assert.ok('error' in poker.act(s, first, { type: 'check' }, 0, ctx()), 'can’t check facing the big blind');
  const r = ok(poker.act(s, first, { type: 'raise', to: 60 }, 0, ctx()));
  assert.notEqual(r.toAct, first);
  assert.equal((poker.view(r, 0, null) as PokerView).toCall, 40);
});

test('one deck: 52 different cards, and no card is ever dealt twice', () => {
  assert.equal(new Set(newDeck(Math.random)).size, 52);
  const seats = ['amber', 'teal', 'violet', 'rose'];
  for (let g = 0; g < 200; g++) {
    let s = poker.create({ startChips: 1000, blindEvery: 5 }, 0, ctx(seats));
    // Check or call round to the river, checking the cards at every step.
    for (let i = 0; i < 40 && !s.result && s.hand === 1; i++) {
      const dealt = [...Object.values(s.hole).flat(), ...s.board, ...s.deck];
      assert.equal(new Set(dealt).size, dealt.length, 'a card appears twice');
      const seat = s.toAct!;
      s = ok(poker.act(s, seat, { type: s.currentBet > s.bet[seat] ? 'call' : 'check' }, 0, ctx(seats)));
    }
    assert.equal(s.last?.board.length, 5);
    assert.equal(new Set(s.last!.board).size, 5);
  }
});

test('a short all-in raise does not reopen the betting for those who have acted', () => {
  const seats = ['amber', 'teal', 'violet'];
  let s = poker.create({ startChips: 1000, blindEvery: 5 }, 0, ctx(seats));
  const [a, b, c] = s.pending; // a acts first, then b, then c (the big blind)
  assert.equal(s.toAct, a);
  s = { ...s, chips: { ...s.chips, [b]: 150 - s.bet[b] } }; // b can reach 150 at most
  s = ok(poker.act(s, a, { type: 'raise', to: 100 }, 0, ctx(seats))); // a full raise (by 80)
  s = ok(poker.act(s, b, { type: 'allin' }, 0, ctx(seats))); // to 150: 50 more, short of a full 80
  assert.equal(s.currentBet, 150);
  assert.equal(s.toAct, c);
  assert.equal((poker.view(s, 0, c) as PokerView).canRaise, true, 'c had not acted: may still raise');
  s = ok(poker.act(s, c, { type: 'call' }, 0, ctx(seats)));
  assert.equal(s.toAct, a, 'a still owes 50');
  assert.equal((poker.view(s, 0, a) as PokerView).canRaise, false);
  assert.ok('error' in poker.act(s, a, { type: 'raise', to: 400 }, 0, ctx(seats)), 'a may not re-raise');
  assert.ok('error' in poker.act(s, a, { type: 'allin' }, 0, ctx(seats)), 'nor shove');
  s = ok(poker.act(s, a, { type: 'call' }, 0, ctx(seats)));
  assert.equal(s.street, 'flop', 'betting round over');
});

test('a full raise after a short all-in reopens the betting', () => {
  const seats = ['amber', 'teal', 'violet'];
  let s = poker.create({ startChips: 1000, blindEvery: 5 }, 0, ctx(seats));
  const [a, b, c] = s.pending;
  s = { ...s, chips: { ...s.chips, [b]: 150 - s.bet[b] } };
  s = ok(poker.act(s, a, { type: 'raise', to: 100 }, 0, ctx(seats)));
  s = ok(poker.act(s, b, { type: 'allin' }, 0, ctx(seats)));
  s = ok(poker.act(s, c, { type: 'raise', to: 300 }, 0, ctx(seats))); // c re-raises fully
  assert.equal(s.toAct, a);
  assert.equal((poker.view(s, 0, a) as PokerView).canRaise, true, 'a full raise reopens it for a');
  s = ok(poker.act(s, a, { type: 'raise', to: 600 }, 0, ctx(seats)));
  assert.equal(s.currentBet, 600);
});
