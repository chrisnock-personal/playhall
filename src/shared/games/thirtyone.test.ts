import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thirtyOne as g, handScore, worstCard, type ThirtyOneState } from './thirtyone';

const seats = ['amber', 'teal', 'violet'];
const ctx = { seats, random: () => 0.4 };
const ok = (r: ReturnType<typeof g.act>): ThirtyOneState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
/** A round with chosen hands, amber to move, after the first turn. */
const rigged = (hands: Record<string, string[]>, extra: Partial<ThirtyOneState> = {}): ThirtyOneState => ({
  ...g.create({}, 0, ctx), hands, deck: ['2C', '3C', '4C', '5C', '6C'], discard: ['9D'], turn: 'amber', phase: 'draw', turns: 1, knocker: null, lastTurns: [], ...extra,
});

test('a hand scores its best suit; three of a kind is 30½; 31 is the best', () => {
  assert.equal(handScore(['AS', 'KS', '5H']), 21);
  assert.equal(handScore(['AS', 'KS', 'QS']), 31);
  assert.equal(handScore(['7S', '7H', '7D']), 30.5);
  assert.equal(handScore(['2S', '3H', '4D']), 4);
  assert.equal(worstCard(['AS', 'KS', '5H', '9S'], null), '5H');
  assert.equal(worstCard(['AS', 'KS', '5H', '9S'], '5H'), '9S', 'not the card just taken');
});

test('take, then throw one away; not straight back from the discard', () => {
  let s = rigged({ amber: ['AS', 'KS', '2H'], teal: ['3D', '4D', '5D'], violet: ['6H', '7H', '8C'] });
  s = ok(g.act(s, 'amber', { type: 'draw', from: 'discard' }, 0, ctx));
  assert.deepEqual(s.hands.amber, ['AS', 'KS', '2H', '9D']);
  assert.match(err(g.act(s, 'amber', { type: 'discard', card: '9D' }, 0, ctx)) ?? '', /just took/);
  s = ok(g.act(s, 'amber', { type: 'discard', card: '2H' }, 0, ctx));
  assert.equal(s.turn, 'teal');
  assert.equal(s.discard.at(-1), '2H');
});

test('a knock gives everyone else one more turn, then the lowest hand loses a life', () => {
  let s = rigged({ amber: ['AS', 'KS', 'QH'], teal: ['3D', '4D', '5D'], violet: ['6H', '7H', '8C'] });
  assert.match(err(g.act({ ...s, turns: 0 }, 'amber', { type: 'knock' }, 0, ctx)) ?? '', /first turn/);
  s = ok(g.act(s, 'amber', { type: 'knock' }, 0, ctx));
  assert.equal(s.turn, 'teal');
  for (const p of ['teal', 'violet']) {
    s = ok(g.act(s, p, { type: 'draw', from: 'deck' }, 0, ctx));
    s = ok(g.act(s, p, { type: 'discard', card: s.hands[p][3] }, 0, ctx));
  }
  // teal 12 (3+4+5 diamonds), violet 13 (6+7 hearts): teal is lowest.
  assert.deepEqual(s.lastRound?.losers, ['teal']);
  assert.equal(s.lives.teal, 2);
  assert.equal(s.round, 2);
});

test('31 costs everyone else a life at once; the last player left wins', () => {
  let s = rigged({ amber: ['AS', 'KS', '2H'], teal: ['3D', '4D', '5D'], violet: ['6H', '7H', '8C'] }, { lives: { amber: 3, teal: 1, violet: 1 }, discard: ['QS'] });
  s = ok(g.act(s, 'amber', { type: 'draw', from: 'discard' }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'discard', card: '2H' }, 0, ctx));
  assert.equal(s.result?.winner, 'amber');
  assert.deepEqual(s.result?.placings, [['amber'], ['teal', 'violet']]);
});

test('resigning takes you out, and a fresh round is dealt', () => {
  const s = ok(g.act(rigged({ amber: ['AS', 'KS', '2H'], teal: ['3D', '4D', '5D'], violet: ['6H', '7H', '8C'] }), 'teal', { type: 'resign' }, 0, ctx));
  assert.equal(s.lives.teal, 0);
  assert.equal(s.hands.teal.length, 0);
  assert.equal(s.result, null);
});
