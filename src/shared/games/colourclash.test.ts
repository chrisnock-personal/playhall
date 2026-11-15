import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colourClash, newDeck, playable, type ClashCard, type ClashState, type ClashView } from './colourclash';
import { score } from '../scoring';

const ctx = (seats = ['amber', 'teal', 'violet']) => ({ seats, random: Math.random });
const ok = (r: ReturnType<typeof colourClash.act>): ClashState => { if ('error' in r) throw new Error(r.error); return r.state; };
let nextId = 1000;
const c = (colour: ClashCard['colour'], value: ClashCard['value']): ClashCard => ({ id: nextId++, colour, value });
const table = (hands: Record<string, ClashCard[]>, top: ClashCard, extra: Partial<ClashState> = {}): ClashState => ({
  order: Object.keys(hands), hands, draw: newDeck(Math.random), discard: [top], colour: top.colour as 'amber',
  dir: 1, turn: 0, drawn: null, log: [], result: null, ...extra,
});

test('the deck: 108 cards, 25 of each colour and 8 wilds', () => {
  const deck = newDeck(Math.random);
  assert.equal(deck.length, 108);
  assert.equal(deck.filter((x) => x.colour === 'teal').length, 25);
  assert.equal(deck.filter((x) => x.colour === 'wild').length, 8);
  const s = colourClash.create({}, 0, ctx());
  assert.equal(s.hands.amber.length, 7);
  assert.ok(/^\d$/.test(s.discard[0].value), 'starts on a number card');
});

test('hands are hidden: you see your own, and everyone’s count', () => {
  const s = colourClash.create({}, 0, ctx());
  const v = colourClash.view(s, 0, 'teal') as ClashView;
  assert.equal(v.hand?.length, 7);
  assert.deepEqual(v.counts, { amber: 7, teal: 7, violet: 7 });
  assert.equal((colourClash.view(s, 0, null) as ClashView).hand, null);
});

test('matching by colour or symbol; wilds choose a colour', () => {
  const top = c('teal', '5');
  assert.ok(playable(c('teal', '9'), top, 'teal'));
  assert.ok(playable(c('rose', '5'), top, 'teal'));
  assert.ok(!playable(c('rose', '6'), top, 'teal'));
  const wild = c('wild', 'wild');
  let s = table({ amber: [wild, c('amber', '1')], teal: [c('violet', '1'), c('teal', '2')], violet: [c('rose', '3'), c('rose', '4')] }, top);
  assert.ok('error' in colourClash.act(s, 'amber', { type: 'play', card: wild.id }, 0, ctx()), 'must choose a colour');
  s = ok(colourClash.act(s, 'amber', { type: 'play', card: wild.id, colour: 'violet' }, 0, ctx()));
  assert.equal(s.colour, 'violet');
  assert.deepEqual(colourClash.turn!(s), ['teal']);
});

test('skip, reverse and draw two', () => {
  const skip = c('teal', 'skip');
  let s = table({ amber: [skip, c('amber', '1')], teal: [c('teal', '1'), c('teal', '2')], violet: [c('rose', '3'), c('rose', '4')] }, c('teal', '5'));
  s = ok(colourClash.act(s, 'amber', { type: 'play', card: skip.id }, 0, ctx()));
  assert.deepEqual(colourClash.turn!(s), ['violet']);
  const rev = c('teal', 'reverse');
  let r = table({ amber: [rev, c('amber', '1')], teal: [c('teal', '1'), c('teal', '2')], violet: [c('rose', '3'), c('rose', '4')] }, c('teal', '5'));
  r = ok(colourClash.act(r, 'amber', { type: 'play', card: rev.id }, 0, ctx()));
  assert.deepEqual(colourClash.turn!(r), ['violet'], 'play goes the other way');
  const d2 = c('teal', 'draw2');
  let d = table({ amber: [d2, c('amber', '1')], teal: [c('teal', '1'), c('teal', '2')], violet: [c('rose', '3'), c('rose', '4')] }, c('teal', '5'));
  d = ok(colourClash.act(d, 'amber', { type: 'play', card: d2.id }, 0, ctx()));
  assert.equal(d.hands.teal.length, 4);
  assert.deepEqual(colourClash.turn!(d), ['violet']);
});

test('drawing: a playable card may be played at once; otherwise the turn passes', () => {
  const fits = c('teal', '8');
  let s = table({ amber: [c('rose', '1'), c('rose', '2')], teal: [c('violet', '1'), c('violet', '2')] }, c('teal', '5'), { draw: [fits, ...newDeck(Math.random)] });
  s = ok(colourClash.act(s, 'amber', { type: 'draw' }, 0, ctx(['amber', 'teal'])));
  assert.equal(s.drawn, fits.id);
  assert.ok('error' in colourClash.act(s, 'amber', { type: 'play', card: s.hands.amber[0].id }, 0, ctx(['amber', 'teal'])), 'only the drawn card');
  s = ok(colourClash.act(s, 'amber', { type: 'play', card: fits.id }, 0, ctx(['amber', 'teal'])));
  assert.deepEqual(colourClash.turn!(s), ['teal']);
});

test('the last card wins; others placed by cards left, second place earns a point', () => {
  const last = c('teal', '3');
  let s = table({ amber: [last], teal: [c('violet', '1'), c('violet', '2'), c('violet', '3')], violet: [c('rose', '3')] }, c('teal', '5'));
  s = ok(colourClash.act(s, 'amber', { type: 'play', card: last.id }, 0, ctx()));
  assert.deepEqual(s.result?.placings, [['amber'], ['violet'], ['teal']]);
  const pts = score(s.result!, ['amber', 'teal', 'violet']);
  assert.deepEqual([pts.amber.points, pts.violet.points, pts.teal.points], [3, 1, 0]);
});
