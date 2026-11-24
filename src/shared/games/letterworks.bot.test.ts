import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMoves, letterworksBot } from './letterworks.bot';
import { letterworks as g, CENTRE, SIZE, scorePlacement, type LetterworksState } from './letterworks';
import { isPrefix, isWord } from '../../server/words';

const words = { isWord, isPrefix };

test('the first move covers the centre and is a real word', () => {
  const board = Array(SIZE * SIZE).fill(null);
  isPrefix('A'); // the prefix table is built on first use: not part of a move's time
  const t = Date.now();
  const found = findMoves(board, ['C', 'A', 'T', 'S', 'E', 'R', 'O'], words);
  const ms = Date.now() - t;
  assert.ok(found.length > 50, `found ${found.length}`);
  assert.ok(found.every((f) => f.tiles.some((p) => p.cell === CENTRE)));
  const best = found.sort((a, b) => b.score - a.score)[0];
  assert.equal(best.tiles.length, 7, 'a seven-letter word from CATSERO (COASTER, say)');
  assert.ok(ms < 15000, `${ms} ms (a runaway search, not a precise timing: the tests run in parallel)`);
});

test('later moves join what’s on the board, and every one is legal', () => {
  const ctx = { seats: ['amber', 'teal'], random: () => 0.3, isWord };
  let s: LetterworksState = g.create({}, 0, ctx);
  for (let turn = 0; turn < 6 && !s.result; turn++) {
    const seat = s.order[s.turn];
    const t = Date.now();
    const action = letterworksBot(g.view(s, 0, seat), seat, () => 0.3, words) as { type: string };
    assert.ok(Date.now() - t < 15000, 'a move in seconds, not minutes');
    const r = g.act(s, seat, action, 0, ctx);
    assert.ok(!('error' in r), `refused: ${'error' in r ? r.error : ''}`);
    s = (r as { state: LetterworksState }).state;
  }
  const plays = s.moves.filter((m) => m.kind === 'play');
  assert.ok(plays.length >= 4, `${plays.length} words played in 6 turns`);
  assert.ok(plays.every((m) => (m.words ?? []).every((w) => isWord(w.word))));
});

test('a blank is used as any letter, and scored as nothing', () => {
  const board = Array(SIZE * SIZE).fill(null);
  const found = findMoves(board, ['Q', 'U', '?', 'Z'], words);
  const quiz = found.find((f) => f.tiles.map((p) => p.letter).join('') === 'QUIZ');
  assert.ok(quiz && quiz.tiles.some((p) => p.blank && p.letter === 'I'));
  assert.equal(typeof scorePlacement(board, quiz!.tiles), 'object');
});
