// Four in a Row: two players drop discs into a 7×6 frame; four of yours in a
// line (across, up or diagonal) wins; a full frame is a draw. Amber moves
// first. (The generic game: "Connect 4" is Hasbro's name for it.)

import type { GameModule, GameResult } from '../game';

export type FourSeat = 'amber' | 'teal';
export const COLS = 7;
export const ROWS = 6;

export interface FourState {
  /** Row 0 is the bottom: cell = row * COLS + col. */
  grid: (FourSeat | null)[];
  /** Columns played, in order. */
  moves: number[];
  winLine: number[] | null;
  result: GameResult | null;
}

export type FourAction = { type: 'drop'; col: number } | { type: 'resign' };

export interface FourView {
  grid: (FourSeat | null)[];
  cols: number;
  rows: number;
  turn: FourSeat;
  moves: number[];
  /** The cell of the last disc dropped. */
  lastCell: number | null;
  winLine: number[] | null;
  result: GameResult | null;
}

const other = (s: FourSeat): FourSeat => (s === 'amber' ? 'teal' : 'amber');
const turnOf = (state: FourState): FourSeat => (state.moves.length % 2 === 0 ? 'amber' : 'teal');

/** The four-or-more line through `cell` for `who`, if there is one. */
export function lineThrough(grid: (FourSeat | null)[], cell: number, who: FourSeat): number[] | null {
  const r0 = Math.floor(cell / COLS), c0 = cell % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [cell];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign, c = c0 + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r * COLS + c] === who) {
        line.push(r * COLS + c);
        r += dr * sign; c += dc * sign;
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b);
  }
  return null;
}

/** The cell a disc dropped in `col` lands in, or -1 if the column is full. */
export function landing(grid: (FourSeat | null)[], col: number): number {
  for (let r = 0; r < ROWS; r++) if (!grid[r * COLS + col]) return r * COLS + col;
  return -1;
}

function lastCell(state: FourState): number | null {
  if (!state.moves.length) return null;
  const col = state.moves[state.moves.length - 1];
  for (let r = ROWS - 1; r >= 0; r--) if (state.grid[r * COLS + col]) return r * COLS + col;
  return null;
}

export const fourInARow: GameModule<FourState, Record<string, never>> = {
  id: 'fourinarow',
  name: 'Four in a Row',
  description: 'Two players drop discs into a 7×6 frame. Four in a line wins.',
  howToPlay: {
    goal: 'Be the first to line up four of your discs: across, up and down, or diagonally.',
    sections: [
      { title: 'Taking turns', points: [
        'Amber goes first; then you take turns.',
        'Click a column to drop a disc into it. It falls to the lowest empty space. Hovering over a column shows where it would land.',
        'A full column can\u2019t take any more discs.',
      ] },
      { title: 'How a game ends', points: [
        'Four of your discs in a line wins; the four are ringed.',
        'If the frame fills up with no four in a line, it\u2019s a draw.',
        'You can resign at any time.',
      ] },
      { title: 'Tips', points: [
        'The middle column is part of more possible lines than any other.',
        'Watch for a threat that can be completed two ways: your opponent can only block one.',
      ] },
    ],
  },
  seats: [
    { id: 'amber', label: 'Amber' },
    { id: 'teal', label: 'Teal' },
  ],
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Classic 7 × 6',

  create: () => ({ grid: Array(COLS * ROWS).fill(null), moves: [], winLine: null, result: null }),

  act(state, seat, raw) {
    if (state.result) return { error: 'The game is over' };
    if (seat !== 'amber' && seat !== 'teal') return { error: 'Not a Four in a Row seat' };
    const action = raw as FourAction;
    if (action?.type === 'resign') {
      return { state: { ...state, result: { winner: other(seat), reason: 'resignation' } } };
    }
    if (action?.type !== 'drop') return { error: 'Unknown move' };
    if (turnOf(state) !== seat) return { error: 'It isn’t your turn' };
    const col = action.col;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return { error: 'No such column' };
    const cell = landing(state.grid, col);
    if (cell < 0) return { error: 'That column is full' };
    const grid = [...state.grid];
    grid[cell] = seat;
    const moves = [...state.moves, col];
    const winLine = lineThrough(grid, cell, seat);
    const result: GameResult | null = winLine
      ? { winner: seat, reason: 'four in a row' }
      : moves.length === COLS * ROWS ? { winner: null, reason: 'a full board' } : null;
    return { state: { grid, moves, winLine, result } };
  },

  turn: (state) => (state.result ? [] : [turnOf(state)]),
  tick: () => null,
  nextDeadline: () => null,
  result: (state) => state.result,

  replay(state) {
    const frames: unknown[] = [];
    let s = this.create({}, 0, { seats: ['amber', 'teal'], random: Math.random });
    frames.push(this.view(s, 0, null));
    for (const col of state.moves) {
      const r = this.act(s, turnOf(s), { type: 'drop', col }, 0, { seats: ['amber', 'teal'], random: Math.random });
      if ('error' in r) break;
      s = r.state;
      frames.push(this.view(s, 0, null));
    }
    // A resignation doesn't show in the moves: end on the real result.
    if (state.result && frames.length) frames[frames.length - 1] = this.view({ ...s, result: state.result }, 0, null);
    return frames;
  },

  view(state): FourView {
    return {
      grid: state.grid, cols: COLS, rows: ROWS, turn: turnOf(state), moves: state.moves,
      lastCell: lastCell(state), winLine: state.winLine, result: state.result,
    };
  },
};
