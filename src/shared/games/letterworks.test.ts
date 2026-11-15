import { test } from 'node:test';
import assert from 'node:assert/strict';
import { letterworks, scorePlacement, newBag, CENTRE, SIZE, type LetterworksState, type LetterworksView, type Placement } from './letterworks';
import { score } from '../scoring';

const WORDS = new Set(['HALL', 'HALLS', 'PAWN', 'AH', 'AT', 'TA', 'CAT', 'CATS', 'ACT']);
const ctx = (seats = ['amber', 'teal']) => ({ seats, random: Math.random, isWord: (w: string) => WORDS.has(w) });
const ok = (r: ReturnType<typeof letterworks.act>): LetterworksState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof letterworks.act>) => ('error' in r ? r.error : null);
const across = (r: number, c: number, word: string): Placement[] => [...word].map((letter, i) => ({ cell: r * SIZE + c + i, letter }));
const down = (r: number, c: number, word: string): Placement[] => [...word].map((letter, i) => ({ cell: (r + i) * SIZE + c, letter }));
/** A two-player game where amber holds `rack` and it's amber's turn. */
function game(rack: string[], seats = ['amber', 'teal']): LetterworksState {
  const s = letterworks.create({}, 0, ctx(seats));
  return { ...s, racks: { ...s.racks, amber: rack } };
}

test('the bag: 100 tiles, 2 blanks', () => {
  const bag = newBag(Math.random);
  assert.equal(bag.length, 100);
  assert.equal(bag.filter((l) => l === '?').length, 2);
  const s = letterworks.create({}, 0, ctx(['amber', 'teal', 'violet']));
  assert.equal(s.bag.length, 100 - 21);
  assert.ok(Object.values(s.racks).every((r) => r.length === 7));
});

test('shape rules', () => {
  const empty = Array(SIZE * SIZE).fill(null);
  assert.match(String(scorePlacement(empty, across(0, 0, 'CAT'))), /centre/);
  assert.match(String(scorePlacement(empty, [{ cell: CENTRE, letter: 'A' }])), /two letters/);
  assert.match(String(scorePlacement(empty, [{ cell: CENTRE, letter: 'C' }, { cell: CENTRE + 2, letter: 'T' }])), /no gaps/);
  assert.match(String(scorePlacement(empty, [{ cell: CENTRE, letter: 'C' }, { cell: CENTRE + SIZE + 1, letter: 'T' }])), /straight line/);
  // HALL across the centre (row 7, cols 6-9): the centre star doubles it.
  const first = scorePlacement(empty, across(7, 6, 'HALL'));
  assert.ok(typeof first !== 'string');
  assert.equal(first.score, (3 + 1 + 1 + 1) * 2);
  const board = [...empty];
  for (const t of across(7, 6, 'HALL')) board[t.cell] = { letter: t.letter, blank: false, move: 0 };
  assert.match(String(scorePlacement(board, across(0, 0, 'AT'))), /join/);
});

test('a first play: scores, draws back to seven, passes the turn', () => {
  let s = game(['H', 'A', 'L', 'L', 'E', 'S', 'T']);
  s = ok(letterworks.act(s, 'amber', { type: 'play', tiles: across(7, 6, 'HALL') }, 0, ctx()));
  assert.equal(s.scores.amber, 12);
  assert.equal(s.racks.amber.length, 7);
  assert.equal(s.order[s.turn], 'teal');
  assert.deepEqual(s.moves[0].words, [{ word: 'HALL', score: 12 }]);
});

test('words must be in the list; nothing changes when one isn’t', () => {
  const s = game(['Q', 'Z', 'A', 'B', 'C', 'D', 'E']);
  assert.match(err(letterworks.act(s, 'amber', { type: 'play', tiles: across(7, 6, 'QZ') }, 0, ctx())) ?? '', /QZ isn’t a word/);
  assert.match(err(letterworks.act(s, 'amber', { type: 'play', tiles: across(7, 6, 'XA') }, 0, ctx())) ?? '', /no X/);
  assert.match(err(letterworks.act(s, 'teal', { type: 'pass' }, 0, ctx())) ?? '', /your turn/);
});

test('crossing words all score; bonus squares only count when first covered; blanks are 0', () => {
  let s = game(['C', 'A', 'T', 'X', 'X', 'X', 'X']);
  s = ok(letterworks.act(s, 'amber', { type: 'play', tiles: across(7, 7, 'CAT') }, 0, ctx())); // C on the star
  assert.equal(s.scores.amber, (3 + 1 + 1) * 2);
  s = { ...s, racks: { ...s.racks, teal: ['?', 'H', 'Q', 'Q', 'Q', 'Q', 'Q'] } };
  // An H under the A of CAT makes AH down.
  s = ok(letterworks.act(s, 'teal', { type: 'play', tiles: [{ cell: 8 * SIZE + 8, letter: 'H' }] }, 0, ctx()));
  assert.equal(s.scores.teal, 1 + 3, 'AH: the A (already down) and the H; no bonus at (8,8)');
  s = { ...s, racks: { ...s.racks, amber: ['?', 'X', 'X', 'X', 'X', 'X', 'X'] } };
  s = ok(letterworks.act(s, 'amber', { type: 'play', tiles: [{ cell: 7 * SIZE + 10, letter: 'S', blank: true }] }, 0, ctx()));
  assert.equal(s.moves.at(-1)!.score, 3 + 1 + 1 + 0, 'CATS with the blank S: the star no longer doubles');
  assert.equal(s.board[7 * SIZE + 10]?.blank, true);
});

test('using all seven tiles earns 40 more', () => {
  WORDS.add('HALLWAY');
  const s = ok(letterworks.act(game(['H', 'A', 'L', 'L', 'W', 'A', 'Y']), 'amber', { type: 'play', tiles: down(4, 7, 'HALLWAY') }, 0, ctx()));
  // H(4,7) A L(6,7) L(7,7 star, 2W) W A Y(10,7): 3W? no; (3,7)/(11,7) are 2L but outside. 3+1+1+1+4+1+4 = 15, x2 = 30, +40.
  assert.equal(s.scores.amber, 30 + 40);
});

test('exchanges need seven in the bag and keep the rack at seven; six scoreless turns end it', () => {
  let s = game(['Q', 'Q', 'A', 'B', 'C', 'D', 'E']);
  s = ok(letterworks.act(s, 'amber', { type: 'exchange', letters: ['Q', 'Q'] }, 0, ctx()));
  assert.equal(s.racks.amber.length, 7);
  assert.equal(s.bag.length, 100 - 14);
  assert.equal(s.moves[0].count, 2);
  assert.equal((letterworks.view(s, 0, 'teal') as LetterworksView).moves[0].tiles, undefined, 'nobody sees what was swapped');
  assert.match(err(letterworks.act({ ...s, bag: s.bag.slice(0, 6) }, 'teal', { type: 'exchange', letters: [s.racks.teal[0]] }, 0, ctx())) ?? '', /at least 7/);
  for (let i = 0; i < 5; i++) s = ok(letterworks.act(s, s.order[s.turn], { type: 'pass' }, 0, ctx()));
  assert.ok(s.result, 'over after six');
  assert.match(s.result!.reason, /scoreless/);
  assert.ok(s.scores.amber <= 0 && s.scores.teal <= 0, 'everyone loses their tiles’ value');
});

test('going out: the bag is empty and a player uses their last tile', () => {
  let s = game(['A', 'T']);
  s = { ...s, bag: [], racks: { ...s.racks, teal: ['Q', 'Z'] } };
  s = ok(letterworks.act(s, 'amber', { type: 'play', tiles: across(7, 7, 'AT') }, 0, ctx()));
  assert.ok(s.result);
  assert.equal(s.result!.winner, 'amber');
  assert.deepEqual(s.endBonus, { amber: 18, teal: -18 });
  assert.equal(s.scores.amber, (1 + 1) * 2 + 18);
  const pts = score(s.result!, s.order);
  assert.equal(pts.amber.points, 3);
  assert.equal(pts.teal.points, 0);
});

test('watchers see no racks; players see only their own', () => {
  const s = letterworks.create({}, 0, ctx());
  assert.equal((letterworks.view(s, 0, null) as LetterworksView).rack, null);
  assert.deepEqual((letterworks.view(s, 0, 'teal') as LetterworksView).rack, s.racks.teal);
  assert.equal((letterworks.view(s, 0, null) as LetterworksView).rackCounts.amber, 7);
});

test('resigning and the move timer', () => {
  const seats = ['amber', 'teal', 'violet'];
  let s = letterworks.create({}, 0, ctx(seats));
  s = letterworks.timeout!(s, 'amber', 0, ctx(seats));
  assert.equal(s.order[s.turn], 'teal', 'out of time: the turn passes');
  s = ok(letterworks.act(s, 'teal', { type: 'resign' }, 0, ctx(seats)));
  assert.equal(s.order[s.turn], 'violet', 'skips the resigned player');
  s = ok(letterworks.act(s, 'violet', { type: 'resign' }, 0, ctx(seats)));
  assert.equal(s.result?.winner, 'amber');
  assert.deepEqual(s.result?.placings, [['amber'], ['violet'], ['teal']]);
});
