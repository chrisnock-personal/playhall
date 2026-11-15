// Letterworks: a crossword tile game for 2-4 players. Build words on a shared
// 15 × 15 board from a private rack of seven tiles. Our own board layout,
// tile counts and values (docs/letterworks.md); "Scrabble" is Hasbro's and
// Mattel's name, and its layout and tile set are theirs.

import type { GameModule, GameResult, SeatId } from '../game';

export const SIZE = 15;
export const CENTRE = 7 * SIZE + 7;
export const RACK = 7;
export const ALL_TILES_BONUS = 40;
/** Scoreless turns in a row (by everyone) that end the game. */
export const SCORELESS_END = 6;

export const VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 3, H: 3, I: 1, J: 9, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 9, R: 1,
  S: 1, T: 1, U: 2, V: 5, W: 4, X: 8, Y: 4, Z: 9, '?': 0,
};
/** 98 letters and 2 blanks ('?'). A draft, to tune by simulation. */
export const COUNTS: Record<string, number> = {
  E: 11, A: 8, I: 8, O: 8, T: 7, N: 6, R: 6, S: 5, D: 5, L: 4, U: 3, C: 3, M: 3, H: 3, P: 2, G: 2, B: 2,
  F: 2, W: 2, Y: 2, K: 1, V: 1, J: 1, X: 1, Q: 1, Z: 1, '?': 2,
};

export type Bonus = '3W' | '2W' | '3L' | '2L';
/** Our own symmetric layout of bonus squares; the centre star doubles the word. */
export const BONUS: Record<number, Bonus> = (() => {
  const b: Record<number, Bonus> = {};
  const put = (t: Bonus, list: number[][]) => list.forEach(([r, c]) => { b[r * SIZE + c] = t; });
  put('3W', [[0, 3], [0, 11], [3, 0], [3, 14], [11, 0], [11, 14], [14, 3], [14, 11]]);
  put('2W', [[1, 6], [1, 8], [6, 1], [8, 1], [6, 13], [8, 13], [13, 6], [13, 8], [4, 4], [4, 10], [10, 4], [10, 10], [7, 7]]);
  put('3L', [[2, 5], [2, 9], [5, 2], [9, 2], [5, 12], [9, 12], [12, 5], [12, 9]]);
  put('2L', [[0, 7], [7, 0], [7, 14], [14, 7], [3, 7], [7, 3], [7, 11], [11, 7], [5, 5], [5, 9], [9, 5], [9, 9]]);
  return b;
})();

export interface Tile {
  letter: string;
  /** A blank played as `letter`: worth nothing. */
  blank: boolean;
  /** Which move put it down (index into `moves`). */
  move: number;
}

export interface Placement { cell: number; letter: string; blank?: boolean }

export interface Move {
  seat: SeatId;
  kind: 'play' | 'exchange' | 'pass' | 'resign';
  tiles?: Placement[];
  words?: { word: string; score: number }[];
  /** How many tiles were swapped, for an exchange (never which). */
  count?: number;
  score: number;
}

export interface LetterworksState {
  order: SeatId[];
  turn: number;
  board: (Tile | null)[];
  bag: string[];
  racks: Record<SeatId, string[]>;
  scores: Record<SeatId, number>;
  scoreless: number;
  resigned: SeatId[];
  moves: Move[];
  /** Rack adjustments at the end: + for going out, − for tiles left. */
  endBonus: Record<SeatId, number> | null;
  result: GameResult | null;
}

export type LetterworksAction =
  | { type: 'play'; tiles: Placement[] }
  | { type: 'exchange'; letters: string[] }
  | { type: 'pass' }
  | { type: 'resign' };

export interface LetterworksView {
  order: SeatId[];
  turn: SeatId | null;
  board: (Tile | null)[];
  /** Your own rack; null for watchers. */
  rack: string[] | null;
  rackCounts: Record<SeatId, number>;
  bag: number;
  scores: Record<SeatId, number>;
  resigned: SeatId[];
  moves: Move[];
  endBonus: Record<SeatId, number> | null;
  result: GameResult | null;
}

const SEATS = ['amber', 'teal', 'violet', 'rose'];
const at = (r: number, c: number) => r * SIZE + c;

export function newBag(random: () => number): string[] {
  const bag = Object.entries(COUNTS).flatMap(([l, n]) => Array<string>(n).fill(l));
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

export interface Scored { words: { word: string; score: number; cells: number[] }[]; score: number }

/** Check a placement against the board's shape rules and score it. Doesn't
 *  look at the rack or the word list. Returns an error in plain words. */
export function scorePlacement(board: (Tile | null)[], tiles: Placement[]): Scored | string {
  if (!tiles.length) return 'Place at least one tile';
  if (tiles.length > RACK) return `At most ${RACK} tiles`;
  const placed = new Map<number, Placement>();
  for (const t of tiles) {
    if (!Number.isInteger(t.cell) || t.cell < 0 || t.cell >= SIZE * SIZE) return 'That square isn’t on the board';
    if (!/^[A-Z]$/.test(t.letter ?? '')) return 'Each tile needs a letter';
    if (board[t.cell] || placed.has(t.cell)) return 'That square is taken';
    placed.set(t.cell, t);
  }
  const rows = new Set(tiles.map((t) => Math.floor(t.cell / SIZE)));
  const cols = new Set(tiles.map((t) => t.cell % SIZE));
  if (rows.size > 1 && cols.size > 1) return 'Tiles must be in one straight line';
  const first = board.every((t) => !t);
  if (first && !placed.has(CENTRE)) return 'The first word must cover the centre star';
  const letterAt = (cell: number) => placed.get(cell)?.letter ?? board[cell]?.letter;
  // The word through `cell` along (dr, dc): its cells, start to end.
  const span = (cell: number, dr: number, dc: number) => {
    let r = Math.floor(cell / SIZE), c = cell % SIZE;
    while (r - dr >= 0 && c - dc >= 0 && letterAt(at(r - dr, c - dc))) { r -= dr; c -= dc; }
    const cells: number[] = [];
    while (r < SIZE && c < SIZE && letterAt(at(r, c))) { cells.push(at(r, c)); r += dr; c += dc; }
    return cells;
  };
  // Main direction: along the line, or for one tile whichever way makes a word.
  const across = rows.size === 1 && (tiles.length > 1 || span(tiles[0].cell, 0, 1).length > 1);
  const [dr, dc] = across ? [0, 1] : [1, 0];
  const main = span(tiles[0].cell, dr, dc);
  if (!tiles.every((t) => main.includes(t.cell))) return 'Tiles must make one word with no gaps';
  const words = [main, ...tiles.map((t) => span(t.cell, dc, dr))].filter((w) => w.length > 1);
  if (!words.length) return 'Make a word of at least two letters';
  if (!first && !words.some((w) => w.some((cell) => board[cell]))) return 'Your word must join the tiles already down';
  const scored = words.map((cells) => {
    let sum = 0, mult = 1;
    for (const cell of cells) {
      const p = placed.get(cell);
      const v = p ? (p.blank ? 0 : VALUES[p.letter]) : board[cell]!.blank ? 0 : VALUES[board[cell]!.letter];
      const b = p ? BONUS[cell] : undefined;
      sum += v * (b === '3L' ? 3 : b === '2L' ? 2 : 1);
      if (b === '3W') mult *= 3; else if (b === '2W') mult *= 2;
    }
    return { word: cells.map(letterAt).join(''), score: sum * mult, cells };
  });
  const score = scored.reduce((n, w) => n + w.score, 0) + (tiles.length === RACK ? ALL_TILES_BONUS : 0);
  return { words: scored, score };
}

const rackValue = (rack: string[]) => rack.reduce((n, l) => n + VALUES[l], 0);
const active = (s: LetterworksState) => s.order.filter((p) => !s.resigned.includes(p));

function nextTurn(s: LetterworksState): LetterworksState {
  let t = s.turn;
  do { t = (t + 1) % s.order.length; } while (s.resigned.includes(s.order[t]));
  return { ...s, turn: t };
}

/** End the game: settle the racks and place everyone by score. */
function finish(s: LetterworksState, outSeat: SeatId | null, reason: string): LetterworksState {
  const players = active(s);
  const endBonus: Record<SeatId, number> = Object.fromEntries(players.map((p) => [p, -rackValue(s.racks[p])]));
  if (outSeat) endBonus[outSeat] = players.filter((p) => p !== outSeat).reduce((n, p) => n + rackValue(s.racks[p]), 0);
  const scores = { ...s.scores };
  for (const p of players) scores[p] += endBonus[p];
  const levels = [...new Set(players.map((p) => scores[p]))].sort((a, b) => b - a);
  const placings = [...levels.map((lv) => players.filter((p) => scores[p] === lv)), ...[...s.resigned].reverse().map((p) => [p])];
  const top = placings[0];
  return { ...s, scores, endBonus, result: { winner: top.length === 1 ? top[0] : null, reason, placings } };
}

function play(s: LetterworksState, seat: SeatId, tiles: Placement[], isWord?: (w: string) => boolean): LetterworksState | string {
  const rack = [...s.racks[seat]];
  for (const t of tiles) {
    const i = rack.indexOf(t.blank ? '?' : t.letter);
    if (i < 0) return t.blank ? 'You have no blank tile' : `You have no ${t.letter}`;
    rack.splice(i, 1);
  }
  const scored = scorePlacement(s.board, tiles);
  if (typeof scored === 'string') return scored;
  const bad = isWord ? scored.words.filter((w) => !isWord(w.word)).map((w) => w.word) : [];
  if (bad.length) return `${bad.join(', ')} ${bad.length > 1 ? 'aren’t words' : 'isn’t a word'} in the word list`;
  const move = s.moves.length;
  const board = [...s.board];
  for (const t of tiles) board[t.cell] = { letter: t.letter, blank: !!t.blank, move };
  const draw = s.bag.slice(0, RACK - rack.length);
  const next: LetterworksState = {
    ...s, board, bag: s.bag.slice(draw.length), racks: { ...s.racks, [seat]: [...rack, ...draw] },
    scores: { ...s.scores, [seat]: s.scores[seat] + scored.score },
    scoreless: scored.score > 0 ? 0 : s.scoreless + 1,
    moves: [...s.moves, { seat, kind: 'play', tiles: tiles.map((t) => ({ cell: t.cell, letter: t.letter, ...(t.blank ? { blank: true } : {}) })), words: scored.words.map(({ word, score }) => ({ word, score })), score: scored.score }],
  };
  if (!next.racks[seat].length) return finish(next, seat, 'using every tile');
  return endIfStuck(nextTurn(next));
}

function endIfStuck(s: LetterworksState): LetterworksState {
  return s.scoreless >= SCORELESS_END ? finish(s, null, `${SCORELESS_END} scoreless turns in a row`) : s;
}

export const letterworks: GameModule<LetterworksState, Record<string, never>> = {
  id: 'letterworks',
  name: 'Letterworks',
  description: '2-4 players. Build crossing words from your rack of seven tiles; bonus squares and long words score big.',
  howToPlay: {
    goal: 'Score the most points by making words on the board, crossword style, from the seven letter tiles on your rack.',
    sections: [
      { title: 'Your turn', points: [
        'Place tiles in one straight line, across or down, so they make a word joined to the tiles already on the board. The first word covers the centre star.',
        'Every word your tiles make, both ways, has to be in the word list. Playhall checks before anything is placed: a word that isn’t allowed costs you nothing, just try again.',
        'Or swap any of your tiles for new ones from the bag (while it holds at least seven), or pass.',
        'After you play, you draw back up to seven tiles.',
      ] },
      { title: 'Scoring', points: [
        'A word scores the values on its tiles. A blank can be any letter and is worth 0.',
        'Bonus squares count only on the turn a tile first covers them: 2L and 3L multiply that letter, 2W and 3W (and the centre star, 2W) the whole word.',
        'Every word you make in a turn scores. Using all seven tiles in one turn: +40.',
      ] },
      { title: 'The end', points: [
        'When the bag is empty and someone plays their last tile, the game ends: they gain the value of everyone else’s tiles, and the others lose the value of their own.',
        `It also ends after ${SCORELESS_END} scoreless turns in a row; then everyone loses the value of their tiles.`,
        'Highest score wins (3 points); second place earns 1 in games of three or more.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Standard',

  create(_c, _now, ctx) {
    let bag = newBag(ctx.random);
    const racks: Record<SeatId, string[]> = {};
    for (const p of ctx.seats) { racks[p] = bag.slice(0, RACK); bag = bag.slice(RACK); }
    return {
      order: ctx.seats, turn: 0, board: Array(SIZE * SIZE).fill(null), bag, racks,
      scores: Object.fromEntries(ctx.seats.map((p) => [p, 0])), scoreless: 0, resigned: [], moves: [], endBonus: null, result: null,
    };
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    const action = raw as Partial<LetterworksAction> & Record<string, unknown>;
    if (action?.type === 'resign') {
      const resigned = [...s.resigned, seat];
      const left = s.order.filter((p) => !resigned.includes(p));
      let next: LetterworksState = { ...s, resigned, moves: [...s.moves, { seat, kind: 'resign', score: 0 }] };
      if (left.length === 1) return { state: { ...next, result: { winner: left[0], reason: 'everyone else resigning', placings: [[left[0]], ...[...resigned].reverse().map((p) => [p])] } } };
      if (s.order[s.turn] === seat) next = nextTurn(next);
      return { state: next };
    }
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    if (action?.type === 'play') {
      const tiles = Array.isArray(action.tiles) ? (action.tiles as Placement[]).map((t) => ({ cell: Number(t?.cell), letter: String(t?.letter ?? '').toUpperCase(), blank: !!t?.blank })) : [];
      const r = play(s, seat, tiles, ctx.isWord);
      return typeof r === 'string' ? { error: r } : { state: r };
    }
    if (action?.type === 'exchange') {
      if (s.bag.length < RACK) return { error: `You can only swap while the bag has at least ${RACK} tiles` };
      const letters = Array.isArray(action.letters) ? (action.letters as unknown[]).map((l) => String(l).toUpperCase()) : [];
      if (!letters.length) return { error: 'Choose tiles to swap' };
      const rack = [...s.racks[seat]];
      for (const l of letters) { const i = rack.indexOf(l); if (i < 0) return { error: `You have no ${l === '?' ? 'blank' : l}` }; rack.splice(i, 1); }
      // Draw first, then the swapped tiles go back into the bag at random.
      const drawn = s.bag.slice(0, letters.length);
      const bag = [...s.bag.slice(letters.length)];
      for (const l of letters) bag.splice(Math.floor(ctx.random() * (bag.length + 1)), 0, l);
      const next = { ...s, bag, racks: { ...s.racks, [seat]: [...rack, ...drawn] }, scoreless: s.scoreless + 1, moves: [...s.moves, { seat, kind: 'exchange' as const, count: letters.length, score: 0 }] };
      return { state: endIfStuck(nextTurn(next)) };
    }
    if (action?.type === 'pass') {
      return { state: endIfStuck(nextTurn({ ...s, scoreless: s.scoreless + 1, moves: [...s.moves, { seat, kind: 'pass', score: 0 }] })) };
    }
    return { error: 'Unknown move' };
  },

  turn: (s) => (s.result ? [] : [s.order[s.turn]]),
  /** Out of time: the turn passes. */
  timeout: (s, seat) => (s.result || s.order[s.turn] !== seat ? s : endIfStuck(nextTurn({ ...s, scoreless: s.scoreless + 1, moves: [...s.moves, { seat, kind: 'pass', score: 0 }] }))),
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): LetterworksView {
    return {
      order: s.order, turn: s.result ? null : s.order[s.turn], board: s.board,
      rack: viewer && s.racks[viewer] ? s.racks[viewer] : null,
      rackCounts: Object.fromEntries(s.order.map((p) => [p, s.racks[p].length])),
      bag: s.bag.length, scores: s.scores, resigned: s.resigned, moves: s.moves, endBonus: s.endBonus, result: s.result,
    };
  },
};
