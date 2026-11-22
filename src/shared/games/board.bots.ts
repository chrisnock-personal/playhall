// Bots for the board games (#18): Snakes and Ladders, Ludo, Four in a Row
// and checkers. Each decides from its own seat's view (see src/shared/bots.ts).

import { bestMove as ccBestMove, type CheckersView as StarView } from './chinesecheckers';
import type { SeatId } from '../game';
import type { SnakesView } from './snakes';
import { HOME, SAFE, square, type LudoView } from './ludo';
import { COLS, ROWS, landing, lineThrough, type FourSeat, type FourView } from './fourinarow';
import { legalMoves, type CheckersMove, type CheckersSide, type CheckersView, type Piece } from './checkers';
import { CAST, bestQuestion, openQuestions, type WhoView } from './whodat';

/** Snakes and Ladders has no choices: roll when it's your turn. */
export function snakesBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as SnakesView;
  return !v.result && v.turn === seat ? { type: 'roll' } : null;
}

/** Ludo: roll, then the best token to move: a capture, then reaching home,
 *  then a token out of the yard, then off a square an opponent could hit,
 *  then the one furthest along. */
export function ludoBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as LudoView;
  if (v.result || v.turn !== seat) return null;
  if (v.roll === null) return { type: 'roll' };
  if (!v.movable.length) return null;
  const roll = v.roll;
  const mine = v.tokens[seat];
  const theirs = Object.entries(v.tokens).filter(([p]) => p !== seat)
    .flatMap(([p, ts]) => ts.map((t) => (t >= 0 ? square(p, t) : null)).filter((q): q is number => q !== null));
  const exposed = (q: number | null) => q !== null && !SAFE.has(q) && theirs.some((t) => ((q - t + 52) % 52) >= 1 && ((q - t + 52) % 52) <= 6);
  const score = (i: number) => {
    const from = mine[i];
    const to = from === -1 ? 0 : from + roll;
    const q = square(seat, to);
    let s = to;
    if (q !== null && !SAFE.has(q) && theirs.includes(q)) s += 200;
    if (to === HOME) s += 150;
    if (from === -1) s += 100;
    if (exposed(from >= 0 ? square(seat, from) : null)) s += 40;
    if (exposed(q)) s -= 30;
    return s;
  };
  const best = [...v.movable].sort((a, b) => score(b) - score(a))[0];
  return { type: 'move', token: best };
}

// ---- Four in a Row: a look-ahead search ----

const other4 = (s: FourSeat): FourSeat => (s === 'amber' ? 'teal' : 'amber');
const ORDER = [3, 2, 4, 1, 5, 0, 6];

/** How good a grid looks for `me`: open lines of two and three count. */
function score4(grid: (FourSeat | null)[], me: FourSeat): number {
  let total = 0;
  const lines = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of lines) {
    let mine = 0, theirs = 0, ok = true;
    for (let k = 0; k < 4; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) { ok = false; break; }
      const x = grid[rr * COLS + cc];
      if (x === me) mine++; else if (x) theirs++;
    }
    if (!ok || (mine && theirs)) continue;
    total += mine === 3 ? 5 : mine === 2 ? 2 : 0;
    total -= theirs === 3 ? 6 : theirs === 2 ? 2 : 0;
  }
  for (let r = 0; r < ROWS; r++) if (grid[r * COLS + 3] === me) total += 3;
  return total;
}

function negamax(grid: (FourSeat | null)[], who: FourSeat, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return score4(grid, who);
  let best = -Infinity, any = false;
  for (const col of ORDER) {
    const cell = landing(grid, col);
    if (cell < 0) continue;
    any = true;
    grid[cell] = who;
    const v = lineThrough(grid, cell, who) ? 10000 + depth : -negamax(grid, other4(who), depth - 1, -beta, -alpha);
    grid[cell] = null;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}

export function fourBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as FourView;
  if (v.result || v.turn !== seat) return null;
  const grid = [...v.grid];
  const me = seat as FourSeat;
  let best = -Infinity, picks: number[] = [];
  for (const col of ORDER) {
    const cell = landing(grid, col);
    if (cell < 0) continue;
    grid[cell] = me;
    const val = lineThrough(grid, cell, me) ? 100000 : -negamax(grid, other4(me), 4, -Infinity, Infinity);
    grid[cell] = null;
    if (val > best) { best = val; picks = [col]; } else if (val === best) picks.push(col);
  }
  if (!picks.length) return null;
  return { type: 'drop', col: picks[Math.floor(random() * picks.length)] };
}

// ---- Checkers: a look-ahead search over material ----

const otherSide = (s: CheckersSide): CheckersSide => (s === 'black' ? 'white' : 'black');

function apply(board: (Piece | null)[], m: CheckersMove): (Piece | null)[] {
  const b = [...board];
  const from = m.path[0], to = m.path[m.path.length - 1];
  const piece = b[from]!;
  b[from] = null;
  for (const c of m.captures) b[c] = null;
  const crowned = !piece.king && Math.floor(to / 8) === (piece.side === 'black' ? 7 : 0);
  b[to] = crowned ? { ...piece, king: true } : piece;
  return b;
}

function material(board: (Piece | null)[], me: CheckersSide): number {
  let s = 0;
  board.forEach((p, i) => {
    if (!p) return;
    const row = Math.floor(i / 8);
    const advance = p.king ? 0 : (p.side === 'black' ? row : 7 - row) * 0.05;
    const v = (p.king ? 1.6 : 1) + advance;
    s += p.side === me ? v : -v;
  });
  return s;
}

function search(board: (Piece | null)[], side: CheckersSide, me: CheckersSide, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, side);
  if (!moves.length) return side === me ? -1000 - depth : 1000 + depth;
  if (depth === 0) return material(board, me);
  if (side === me) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(apply(board, m), otherSide(side), me, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(apply(board, m), otherSide(side), me, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function checkersBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as CheckersView;
  const me = seat as CheckersSide;
  if (v.result) return null;
  // A draw offer to us: take it only when behind.
  if (v.drawOfferBy && v.drawOfferBy !== me) return material(v.board, me) < -1 ? { type: 'accept_draw' } : { type: 'decline_draw' };
  if (v.turn !== me || !v.legal.length) return null;
  let best = -Infinity, picks: CheckersMove[] = [];
  for (const m of v.legal) {
    const val = search(apply(v.board, m), otherSide(me), me, 4, -Infinity, Infinity);
    if (val > best + 1e-9) { best = val; picks = [m]; } else if (Math.abs(val - best) <= 1e-9) picks.push(m);
  }
  return { type: 'move', path: picks[Math.floor(random() * picks.length)].path };
}

// ---- Who Dat?: ask the question that halves the faces still up ----

export function whoDatBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as WhoView;
  const up = v.up[seat];
  if (v.result || v.turn !== seat || !up) return null;
  const left = CAST.map((_, i) => i).filter((i) => up[i]);
  if (left.length === 1) return { type: 'guess', face: left[0] };
  const q = bestQuestion(up, openQuestions(v.asked, seat), random);
  if (q) return { type: 'ask', q: q.id };
  return { type: 'guess', face: left.length ? left[Math.floor(random() * left.length)] : 0 };
}

// ---- Chinese checkers: the move that brings a marble furthest forward ----

export function chineseCheckersBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as StarView;
  if (v.result || v.order[v.turn] !== seat) return null;
  const m = ccBestMove(v, seat, random);
  return m ? { type: 'move', ...m } : null;
}
