// A chess computer player (#18): a small search (two moves ahead, then every
// capture until the position is quiet) over material and piece placement,
// with a little randomness so it doesn't always play the same game. Strong
// enough to punish a hanging piece; easy enough for a family to beat.

import { Chess, type Move } from 'chess.js';
import type { SeatId } from '../game';
import type { ChessView } from './chess';
import type { BotLevel } from '../bots';

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece placement from White's side (a8..h1 rows), a simplified table set.
const CENTRE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 5, 5, 5, 5, 5, 5, 0,
  0, 5, 10, 10, 10, 10, 5, 0,
  0, 5, 10, 20, 20, 10, 5, 0,
  0, 5, 10, 20, 20, 10, 5, 0,
  0, 5, 10, 10, 10, 10, 5, 0,
  0, 5, 5, 5, 5, 5, 5, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PAWN_ADVANCE = [0, 60, 40, 25, 12, 5, 0, 0]; // by row from White's side (row 0 = rank 8)

/** The position's score for the side to move (centipawns). */
function evaluate(c: Chess): number {
  let score = 0;
  const board = c.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = board[r][f];
    if (!sq) continue;
    const i = r * 8 + f;
    const own = sq.color === 'w' ? 1 : -1;
    let v = VALUE[sq.type];
    if (sq.type === 'n' || sq.type === 'b') v += CENTRE[i];
    else if (sq.type === 'q') v += CENTRE[i] / 2;
    else if (sq.type === 'p') v += sq.color === 'w' ? PAWN_ADVANCE[r] + CENTRE[i] / 2 : PAWN_ADVANCE[7 - r] + CENTRE[i] / 2;
    score += own * v;
  }
  return c.turn() === 'w' ? score : -score;
}

const order = (moves: Move[]) => moves.sort((a, b) => (b.captured ? VALUE[b.captured] - VALUE[b.piece] / 10 : -1) - (a.captured ? VALUE[a.captured] - VALUE[a.piece] / 10 : -1));

function quiesce(c: Chess, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(c);
  if (stand >= beta || depth === 0) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of order(c.moves({ verbose: true }).filter((x) => x.captured || x.promotion))) {
    c.move(m);
    const v = -quiesce(c, -beta, -alpha, depth - 1);
    c.undo();
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(c: Chess, depth: number, alpha: number, beta: number): number {
  const moves = c.moves({ verbose: true });
  // No moves: checkmate (the worse the sooner) or stalemate.
  if (!moves.length) return c.inCheck() ? -100_000 - depth : 0;
  if (depth === 0) return quiesce(c, alpha, beta, 2);
  let best = -Infinity;
  for (const m of order(moves)) {
    c.move(m);
    const v = -negamax(c, depth - 1, -beta, -alpha);
    c.undo();
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** The move this bot picks in a position (exported for tests). */
export function chooseChessMove(fen: string, random: () => number = Math.random, depth = 2, noise = 20): { from: string; to: string; promotion?: string } | null {
  const c = new Chess(fen);
  const moves = order(c.moves({ verbose: true }));
  if (!moves.length) return null;
  let best: Move[] = [];
  let bestScore = -Infinity;
  for (const m of moves) {
    c.move(m);
    // A little noise (up to a fifth of a pawn) between moves that are about as
    // good; moves more than that worse than the best so far are cut short.
    const v = -negamax(c, depth - 1, -Infinity, -(bestScore - noise)) + random() * noise;
    c.undo();
    if (v > bestScore + 0.001) { bestScore = v; best = [m]; } else if (Math.abs(v - bestScore) < 0.001) best.push(m);
  }
  const m = best[0];
  return { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) };
}

export function chessBot(view: unknown, seat: SeatId, random: () => number, _words?: unknown, level: BotLevel = 'fair'): unknown | null {
  const v = view as ChessView;
  if (v.result || v.turn !== seat) return null;
  // Gentle: one move ahead and plenty of noise (it misses things); strong: no noise.
  const m = level === 'gentle' ? chooseChessMove(v.fen, random, 1, 250) : chooseChessMove(v.fen, random, 2, level === 'strong' ? 1 : 20);
  return m ? { type: 'move', ...m } : null;
}
