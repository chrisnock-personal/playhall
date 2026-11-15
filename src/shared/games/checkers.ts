// Checkers (English draughts): 8×8, played on the dark squares. Black moves
// first. Men move one square diagonally forward; kings one square in any
// diagonal direction. Captures are compulsory, and a jumping piece must keep
// jumping while it can (any capturing sequence may be chosen, not
// necessarily the longest). A man reaching the far row is crowned, which
// ends its move. You lose when you have no pieces or no legal move.

import type { GameModule, GameResult, SeatId } from '../game';

export type CheckersSide = 'black' | 'white';
export interface Piece { side: CheckersSide; king: boolean }

export interface CheckersState {
  /** 64 squares, index = row * 8 + col; row 0 is Black's home row. */
  board: (Piece | null)[];
  turn: CheckersSide;
  /** Each move as the squares the piece visited. */
  moves: number[][];
  /** Moves since the last capture or man move (for the draw rule). */
  quiet: number;
  drawOfferBy: CheckersSide | null;
  result: GameResult | null;
}

export interface CheckersMove { path: number[]; captures: number[] }

export interface CheckersView {
  board: (Piece | null)[];
  turn: CheckersSide;
  lastMove: number[] | null;
  legal: CheckersMove[];
  moveCount: number;
  drawOfferBy: CheckersSide | null;
  result: GameResult | null;
  counts: Record<CheckersSide, number>;
}

export type CheckersAction =
  | { type: 'move'; path: number[] }
  | { type: 'resign' } | { type: 'offer_draw' } | { type: 'accept_draw' } | { type: 'decline_draw' };

/** 40 moves each without a capture or a man moving is a draw. */
const QUIET_LIMIT = 80;

const other = (s: CheckersSide): CheckersSide => (s === 'black' ? 'white' : 'black');
const rc = (i: number) => [Math.floor(i / 8), i % 8] as const;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function startBoard(): (Piece | null)[] {
  const b: (Piece | null)[] = Array(64).fill(null);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 !== 0) continue;   // dark squares only (a1 is dark)
    if (r < 3) b[r * 8 + c] = { side: 'black', king: false };
    if (r > 4) b[r * 8 + c] = { side: 'white', king: false };
  }
  return b;
}

function directions(p: Piece): [number, number][] {
  const fwd = p.side === 'black' ? 1 : -1;
  return p.king ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[fwd, 1], [fwd, -1]];
}

const crowns = (p: Piece, to: number) => !p.king && Math.floor(to / 8) === (p.side === 'black' ? 7 : 0);

/** Every capturing sequence from `from`, each run to its end. */
function jumps(board: (Piece | null)[], from: number, piece: Piece, path: number[], captured: number[]): CheckersMove[] {
  const out: CheckersMove[] = [];
  const [r, c] = rc(from);
  for (const [dr, dc] of directions(piece)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (!on(tr, tc)) continue;
    const mid = mr * 8 + mc, to = tr * 8 + tc;
    const victim = board[mid];
    if (!victim || victim.side === piece.side || captured.includes(mid) || board[to]) continue;
    const next = { path: [...path, to], captures: [...captured, mid] };
    if (crowns(piece, to)) { out.push(next); continue; }   // crowning ends the move
    const nb = [...board]; nb[from] = null; nb[to] = piece;
    const more = jumps(nb, to, piece, next.path, next.captures);
    out.push(...(more.length ? more : [next]));
  }
  return out;
}

export function legalMoves(board: (Piece | null)[], side: CheckersSide): CheckersMove[] {
  const captures: CheckersMove[] = [];
  const steps: CheckersMove[] = [];
  board.forEach((p, i) => {
    if (!p || p.side !== side) return;
    captures.push(...jumps(board, i, p, [i], []));
    const [r, c] = rc(i);
    for (const [dr, dc] of directions(p)) {
      if (on(r + dr, c + dc) && !board[(r + dr) * 8 + c + dc]) steps.push({ path: [i, (r + dr) * 8 + c + dc], captures: [] });
    }
  });
  return captures.length ? captures : steps;
}

const count = (board: (Piece | null)[], side: CheckersSide) => board.filter((p) => p?.side === side).length;

function end(state: CheckersState, result: GameResult): CheckersState {
  return { ...state, drawOfferBy: null, result };
}

export const checkers: GameModule<CheckersState, Record<string, never>> = {
  id: 'checkers',
  name: 'Checkers',
  description: 'Two players, English draughts on an 8×8 board. Captures are compulsory; reach the far row to be crowned.',
  howToPlay: {
    goal: 'Capture all of your opponent’s pieces, or leave them with no move they can make.',
    sections: [
      { title: 'Taking turns', points: [
        'Black moves first. Pieces only ever stand on the dark squares.',
        'A piece (a "man") moves one square diagonally forward. Click it, then click where it goes; the board marks the squares you can reach.',
      ] },
      { title: 'Capturing', points: [
        'Jump diagonally over an opponent’s piece next to you, onto the empty square beyond, to capture it.',
        'If you can capture, you must. If the same piece can then jump again, it must keep going: click each landing square in turn.',
        'When there is more than one capture, you may choose any of them; it doesn’t have to be the longest.',
      ] },
      { title: 'Kings', points: [
        'A man that reaches the far row is crowned a king (shown with a crown). Being crowned ends that move.',
        'Kings move and capture one square diagonally in any direction, backwards too.',
      ] },
      { title: 'How a game ends', points: [
        'You win when your opponent has no pieces left or no legal move.',
        'A draw: offered and accepted, or 40 moves each with no capture and no man moving.',
        'You can resign at any time.',
      ] },
    ],
  },
  seats: [
    { id: 'black', label: 'Black' },
    { id: 'white', label: 'White' },
  ],
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'English draughts',

  create: () => ({ board: startBoard(), turn: 'black', moves: [], quiet: 0, drawOfferBy: null, result: null }),

  act(state, seat, raw) {
    if (state.result) return { error: 'The game is over' };
    if (seat !== 'black' && seat !== 'white') return { error: 'Not a checkers seat' };
    const me = seat as CheckersSide;
    const action = raw as CheckersAction;
    switch (action?.type) {
      case 'move': {
        if (state.turn !== me) return { error: 'It isn’t your turn' };
        const path = Array.isArray(action.path) ? action.path : [];
        const move = legalMoves(state.board, me).find((m) => m.path.length === path.length && m.path.every((s, i) => s === path[i]));
        if (!move) return { error: 'That move isn’t allowed (captures are compulsory)' };
        const board = [...state.board];
        const piece = { ...board[move.path[0]]! };
        const to = move.path[move.path.length - 1];
        board[move.path[0]] = null;
        for (const cap of move.captures) board[cap] = null;
        const manMoved = !piece.king;
        if (crowns(piece, to)) piece.king = true;
        board[to] = piece;
        const quiet = move.captures.length || manMoved ? 0 : state.quiet + 1;
        const next: CheckersState = {
          ...state, board, turn: other(me), moves: [...state.moves, move.path], quiet,
          drawOfferBy: state.drawOfferBy === me ? me : null,
        };
        if (!legalMoves(board, other(me)).length) {
          return { state: end(next, { winner: me, reason: count(board, other(me)) ? 'leaving no moves' : 'capturing every piece' }) };
        }
        if (quiet >= QUIET_LIMIT) return { state: end(next, { winner: null, reason: '40 moves without progress' }) };
        return { state: next };
      }
      case 'resign':
        return { state: end(state, { winner: other(me), reason: 'resignation' }) };
      case 'offer_draw':
        if (state.drawOfferBy === other(me)) return { state: end(state, { winner: null, reason: 'agreement' }) };
        return { state: { ...state, drawOfferBy: me } };
      case 'accept_draw':
        if (state.drawOfferBy !== other(me)) return { error: 'There’s no draw offer to accept' };
        return { state: end(state, { winner: null, reason: 'agreement' }) };
      case 'decline_draw':
        if (state.drawOfferBy !== other(me)) return { error: 'There’s no draw offer to decline' };
        return { state: { ...state, drawOfferBy: null } };
      default:
        return { error: 'Unknown move' };
    }
  },

  turn: (state) => (state.result ? [] : [state.turn as SeatId]),
  tick: () => null,
  nextDeadline: () => null,
  result: (state) => state.result,

  replay(state) {
    const ctx = { seats: ['black', 'white'], random: Math.random };
    let s = this.create({}, 0, ctx);
    const frames: unknown[] = [this.view(s, 0, null)];
    for (const path of state.moves) {
      const r = this.act(s, s.turn, { type: 'move', path }, 0, ctx);
      if ('error' in r) break;
      s = r.state;
      frames.push(this.view(s, 0, null));
    }
    if (state.result && frames.length) frames[frames.length - 1] = this.view({ ...s, result: state.result }, 0, null);
    return frames;
  },

  view(state): CheckersView {
    return {
      board: state.board, turn: state.turn,
      lastMove: state.moves[state.moves.length - 1] ?? null,
      legal: state.result ? [] : legalMoves(state.board, state.turn),
      moveCount: state.moves.length, drawOfferBy: state.drawOfferBy, result: state.result,
      counts: { black: count(state.board, 'black'), white: count(state.board, 'white') },
    };
  },
};
