import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkers, legalMoves, type CheckersState, type Piece } from './checkers';

const ctx = { seats: ['black', 'white'], random: Math.random };
const sq = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
const man = (side: 'black' | 'white', king = false): Piece => ({ side, king });

function position(pieces: Record<string, Piece>, turn: 'black' | 'white' = 'black'): CheckersState {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (const [name, p] of Object.entries(pieces)) board[sq(name)] = p;
  return { board, turn, moves: [], quiet: 0, drawOfferBy: null, result: null };
}
const move = (s: CheckersState, seat: string, ...squares: string[]) =>
  checkers.act(s, seat, { type: 'move', path: squares.map(sq) }, 0, ctx);

test('the start: 12 pieces each, black to move, seven opening moves', () => {
  const s = checkers.create({}, 0, ctx);
  assert.equal(s.board.filter((p) => p?.side === 'black').length, 12);
  assert.equal(s.board.filter((p) => p?.side === 'white').length, 12);
  assert.equal(legalMoves(s.board, 'black').length, 7);
  assert.ok(!('error' in move(s, 'black', 'c3', 'd4')));
  assert.ok('error' in move(s, 'white', 'f6', 'e5'), 'not white’s turn');
});

test('captures are compulsory', () => {
  const s = position({ c3: man('black'), d4: man('white'), g3: man('black'), h8: man('white') });
  assert.ok('error' in move(s, 'black', 'g3', 'h4'), 'a plain move while a capture is available');
  const r = move(s, 'black', 'c3', 'e5');
  assert.ok(!('error' in r));
  if (!('error' in r)) assert.equal(r.state.board[sq('d4')], null);
});

test('a jumping piece keeps jumping, and must finish the sequence', () => {
  const s = position({ a1: man('black'), b2: man('white'), d4: man('white'), h8: man('white') });
  assert.ok('error' in move(s, 'black', 'a1', 'c3'), 'stopping halfway');
  const r = move(s, 'black', 'a1', 'c3', 'e5');
  assert.ok(!('error' in r));
});

test('reaching the far row crowns a man and ends the move; kings go backwards', () => {
  const s = position({ b6: man('black'), c7: man('white'), e7: man('white'), a1: man('white') });
  // b6 x c7 lands on d8 and is crowned; it may not carry on over e7.
  const r = move(s, 'black', 'b6', 'd8');
  assert.ok(!('error' in r));
  if ('error' in r) return;
  assert.deepEqual(r.state.board[sq('d8')], man('black', true));
  const k = position({ d8: man('black', true), h1: man('white') });
  assert.ok(!('error' in move(k, 'black', 'd8', 'c7')), 'a king moves backwards (for Black)');
});

test('no pieces or no moves left loses', () => {
  const s = position({ c3: man('black'), d4: man('white') });
  const r = move(s, 'black', 'c3', 'e5');
  assert.ok(!('error' in r));
  if (!('error' in r)) assert.deepEqual(r.state.result, { winner: 'black', reason: 'capturing every piece' });
  // White's only man is blocked in: Black moves, White has nothing legal.
  const blocked = position({ a8: man('white'), b7: man('black'), c6: man('black'), h1: man('black') });
  const r2 = move(blocked, 'black', 'h1', 'g2');
  assert.ok(!('error' in r2));
  if (!('error' in r2)) assert.equal(r2.state.result?.reason, 'leaving no moves');
});
