import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlay, poophead as g, type PoopState, type PoopView } from './poophead';

const ctx = { seats: ['amber', 'teal', 'violet'], random: () => 0.3 };
const ok = (r: ReturnType<typeof g.act>): PoopState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
/** A table in play: hands, face-up and face-down cards as given, amber to play. */
function table(x: Partial<PoopState>): PoopState {
  const { history: _h, ...s } = g.create({}, 0, ctx);
  return { ...s, phase: 'play', ready: ctx.seats, deck: [], pile: [], turn: 0, ...x } as PoopState;
}
const three = (a: string[], b: string[], c: string[]) => ({ amber: a, teal: b, violet: c });

test('what can go on the pile: equal or higher, 2 and 10 on anything, 7 or lower after a 7', () => {
  assert.equal(canPlay('5', ['5H']), true);
  assert.equal(canPlay('4', ['5H']), false);
  assert.equal(canPlay('A', ['KH']), true);
  assert.equal(canPlay('2', ['AH']), true);
  assert.equal(canPlay('T', ['AH']), true);
  assert.equal(canPlay('3', ['AH', '2C']), true, 'a 2 resets the pile');
  assert.equal(canPlay('8', ['7H']), false);
  assert.equal(canPlay('6', ['7H']), true);
});

test('the swap before play, then the lowest card starts', () => {
  let s = g.create({}, 0, ctx);
  const hand = s.hand.amber[0], up = s.up.amber[0];
  s = ok(g.act(s, 'amber', { type: 'swap', hand, up }, 0, ctx));
  assert.ok(s.up.amber.includes(hand) && s.hand.amber.includes(up));
  assert.match(err(g.act(s, 'amber', { type: 'play', cards: [s.hand.amber[0]] }, 0, ctx)) ?? '', /Swap cards or press Ready/);
  for (const p of ctx.seats) s = ok(g.act(s, p, { type: 'ready' }, 0, ctx));
  assert.equal(s.phase, 'play');
});

test('playing several of a rank, drawing back up, picking up the pile', () => {
  let s = table({ deck: ['9C', 'KD'], hand: three(['5H', '5S', 'QH'], ['3C', '4C', '4D'], ['8S', '8D', 'JH']), up: three(['AS', 'KS', 'QS'], ['AH', 'KH', 'QD'], ['AD', 'KC', 'QC']), down: three(['2C', '3D', '6D'], ['2D', '3H', '6H'], ['2S', '3S', '6S']) });
  s = ok(g.act(s, 'amber', { type: 'play', cards: ['5H', '5S'] }, 0, ctx));
  assert.deepEqual(s.pile, ['5H', '5S']);
  assert.deepEqual(s.hand.amber, ['QH', '9C', 'KD'], 'drew back up to three');
  assert.equal(s.order[s.turn], 'teal');
  assert.match(err(g.act(s, 'teal', { type: 'play', cards: ['3C'] }, 0, ctx)) ?? '', /equal or higher/);
  s = ok(g.act(s, 'teal', { type: 'pickup' }, 0, ctx));
  assert.deepEqual(s.hand.teal, ['3C', '4C', '4D', '5H', '5S']);
  assert.equal(s.pile.length, 0);
});

test('a 10 burns the pile and the same player goes again; so do four of a kind', () => {
  let s = table({ pile: ['9H', 'JH'], hand: three(['TS', '4C', '6C'], ['3C'], ['8S']), up: three([], [], []), down: three(['2C'], ['2D'], ['2S']) });
  s = ok(g.act(s, 'amber', { type: 'play', cards: ['TS'] }, 0, ctx));
  assert.equal(s.pile.length, 0);
  assert.equal(s.burned, 3);
  assert.equal(s.order[s.turn], 'amber', 'goes again');
  s = table({ pile: ['6H', '6D'], hand: three(['6S', '6C', '4C'], ['3C'], ['8S']), up: three([], [], []), down: three(['2C'], ['2D'], ['2S']) });
  s = ok(g.act(s, 'amber', { type: 'play', cards: ['6S', '6C'] }, 0, ctx));
  assert.equal(s.pile.length, 0, 'four sixes in a row burn');
});

test('face-up, then face-down blind: a bad card picks up the pile; the last left is the Poophead', () => {
  let s = table({ pile: ['KH'], hand: three([], ['3C'], ['4C']), up: three([], ['5C'], ['6C']), down: three(['4D', 'AD'], ['7C'], ['7D']) });
  s = ok(g.act(s, 'amber', { type: 'blind', index: 0 }, 0, ctx)); // a 4 on a king: no good
  assert.deepEqual(s.hand.amber, ['KH', '4D']);
  assert.equal(s.order[s.turn], 'teal');
  // Amber out, teal out, violet left holding cards.
  s = table({ pile: [], hand: three([], [], ['4C']), up: three([], [], []), down: three(['AD'], ['7C'], ['7D']) });
  s = ok(g.act(s, 'amber', { type: 'blind', index: 0 }, 0, ctx));
  assert.deepEqual(s.out, ['amber']);
  assert.equal(s.order[s.turn], 'teal');
  // Teal plays their last card: only violet is left holding cards.
  s = { ...s, down: { ...s.down, teal: [] }, hand: { ...s.hand, teal: ['KC'] }, pile: [] };
  s = ok(g.act(s, 'teal', { type: 'play', cards: ['KC'] }, 0, ctx));
  assert.deepEqual(s.result?.placings, [['amber'], ['teal'], ['violet']], 'violet is the Poophead');
  assert.equal(s.result?.winner, 'amber');
  assert.equal((g.view(s, 0, 'violet') as PoopView).hand?.length, 1);
});
