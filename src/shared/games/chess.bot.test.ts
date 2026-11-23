import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseChessMove } from './chess.bot';

test('the chess bot takes a hanging queen and mates in one', () => {
  // White to move; Black's queen on d5 is undefended and attacked by the e4 pawn.
  assert.deepEqual(chooseChessMove('rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', () => 0), { from: 'e4', to: 'd5' });
  // Scholar's mate: Qxf7#.
  assert.deepEqual(chooseChessMove('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', () => 0), { from: 'f3', to: 'f7' });
});

test('it doesn’t leave its queen to be taken', () => {
  // Black's queen on h4 is attacked by the g3 pawn: it must move it (or take something bigger).
  const m = chooseChessMove('rnb1kbnr/pppp1ppp/8/4p3/4P2q/6P1/PPPP1P1P/RNBQKBNR b KQkq - 0 3', () => 0)!;
  assert.equal(m.from, 'h4');
});
