// Chinese checkers (#41): the star-board hopping race for 2, 3, 4 or 6.
// 121 holes in a six-pointed star; each player starts with ten marbles in one
// point and races them into the opposite point. On your turn move one marble
// one step, or hop it over a neighbouring marble (anyone's) into the empty
// hole beyond, and keep hopping as long as you like. Nothing is captured.
// The first to fill the opposite point wins (a marble that never left its own
// point there can't stop you); everyone else is placed by marbles home.
//
// Holes are cube coordinates (x, y, z with x + y + z = 0), written "x,z".
// The star is two big triangles: every coordinate at most 4, or every
// coordinate at least -4. Its six points are where one coordinate passes 4.

import type { GameResult, SeatId } from '../game';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue'];
/** The six points, round the star: a coordinate and a side. Opposite points are three apart. */
const POINTS: [0 | 1 | 2, 1 | -1][] = [[0, 1], [2, -1], [1, 1], [0, -1], [2, 1], [1, -1]];
/** Which points each player count uses (as indexes into POINTS). */
const LAYOUTS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
/** A safety net: after this many moves each, the game ends on marbles home. */
const MOVE_LIMIT = 200;

export type Hole = string;
const key = (x: number, z: number): Hole => `${x},${z}`;
export const cube = (h: Hole): [number, number, number] => { const [x, z] = h.split(',').map(Number); return [x, -x - z, z]; };

export const HOLES: Hole[] = (() => {
  const out: Hole[] = [];
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
    const c = [x, -x - z, z];
    if (c.every((v) => v <= 4) || c.every((v) => v >= -4)) out.push(key(x, z));
  }
  return out;
})();
const ON_BOARD = new Set(HOLES);

/** The ten holes of star point `i`. */
export function pointHoles(i: number): Hole[] {
  const [axis, side] = POINTS[i];
  return HOLES.filter((h) => cube(h)[axis] * side > 4);
}
/** The hole at the far tip of point `i`. */
const tipOf = (i: number) => pointHoles(i).reduce((a, b) => (cube(b)[POINTS[i][0]] * POINTS[i][1] > cube(a)[POINTS[i][0]] * POINTS[i][1] ? b : a));
export const distance = (a: Hole, b: Hole) => { const p = cube(a), q = cube(b); return Math.max(...p.map((v, i) => Math.abs(v - q[i]))); };

export interface CheckersState {
  order: SeatId[];
  /** Each player's start point (an index into the star's points). */
  home: Record<SeatId, number>;
  board: Record<Hole, SeatId>;
  /** Marbles that have left their start point at some time (by hole they're in now). */
  moved: Hole[];
  turn: number;
  moves: number;
  last: { seat: SeatId; from: Hole; to: Hole; path: Hole[] } | null;
  result: GameResult | null;
  history?: GameHistory;
}

export interface CheckersView extends Omit<CheckersState, 'history' | 'moved'> {
  you: SeatId | null;
  /** For you, on your turn: each of your marbles' reachable holes. */
  options: Record<Hole, Hole[]>;
  target: Record<SeatId, number>;
  homeCount: Record<SeatId, number>;
}

const targetOf = (s: { home: Record<SeatId, number> }, p: SeatId) => (s.home[p] + 3) % 6;

/** Where the marble at `from` can go: single steps, and every hole a chain of hops reaches (with the path). */
export function reachable(board: Record<Hole, SeatId>, from: Hole): Map<Hole, Hole[]> {
  const out = new Map<Hole, Hole[]>();
  const [x, , z] = cube(from);
  for (const [dx, , dz] of DIRS) {
    const n = key(x + dx, z + dz);
    if (ON_BOARD.has(n) && !board[n]) out.set(n, [from, n]);
  }
  const seen = new Set([from]);
  const queue: Hole[][] = [[from]];
  while (queue.length) {
    const path = queue.shift()!;
    const [hx, , hz] = cube(path[path.length - 1]);
    for (const [dx, , dz] of DIRS) {
      const over = key(hx + dx, hz + dz), land = key(hx + 2 * dx, hz + 2 * dz);
      if (!ON_BOARD.has(land) || !board[over] || over === from || (board[land] && land !== from) || seen.has(land)) continue;
      seen.add(land);
      const next = [...path, land];
      if (land !== from && !out.has(land)) out.set(land, next);
      queue.push(next);
    }
  }
  return out;
}

/** Holes of `p`'s target point holding their own marbles or a never-moved blocker. */
export function homeCount(s: { home: Record<SeatId, number>; board: Record<Hole, SeatId> }, p: SeatId): number {
  return pointHoles(targetOf(s, p)).filter((h) => s.board[h] === p).length;
}
/** Filled: the target point is full of your marbles, or of yours and others' that never left their start,
 *  once none of yours is left in your own start (so nobody can win while the race is still starting). */
function finished(s: CheckersState, p: SeatId): boolean {
  if (pointHoles(s.home[p]).some((h) => s.board[h] === p)) return false;
  return pointHoles(targetOf(s, p)).every((h) => s.board[h] === p || (s.board[h] && !s.moved.includes(h)));
}

function placings(s: CheckersState, first: SeatId | null): SeatId[][] {
  const rest = s.order.filter((p) => p !== first);
  const counts = [...new Set(rest.map((p) => homeCount(s, p)))].sort((a, b) => b - a);
  return [...(first ? [[first]] : []), ...counts.map((c) => rest.filter((p) => homeCount(s, p) === c))];
}

export const chineseCheckers = withHistory<CheckersState, Record<string, never>>({
  id: 'chinesecheckers',
  name: 'Chinese checkers',
  description: 'For 2, 3, 4 or 6. Race your ten marbles across the star, hopping over anyone’s.',
  howToPlay: {
    goal: 'Be the first to move all ten of your marbles into the point of the star opposite your own.',
    sections: [
      { title: 'Moving', points: [
        'On your turn, move one marble: either one step to an empty neighbouring hole, or a hop.',
        'A hop jumps over a neighbouring marble (yours or anyone’s) into the empty hole straight beyond it. From there you can hop again, as many times as you can, in any direction. Nothing is captured.',
        'Tap a marble to see everywhere it can go, then tap where it should end up.',
      ] },
      { title: 'Winning', points: [
        'The first to fill the opposite point wins. A marble that has never left its own point can’t block you: once all of yours are out of your own point, it counts as filled.',
        'Everyone else is placed by how many marbles they have home.',
        'Two players use opposite points; three use every other point; four use two pairs of opposite points; six use them all.',
        'If the room has a move timer and you run out of time, a move is made for you.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'The star board',

  create(_c, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    const layout = LAYOUTS[order.length] ?? (order.length === 5 ? LAYOUTS[6] : undefined);
    if (!layout) throw new Error('Chinese checkers is for 2, 3, 4 or 6 players');
    const home = Object.fromEntries(order.map((p, i) => [p, layout[i]]));
    const board: Record<Hole, SeatId> = {};
    for (const p of order) for (const h of pointHoles(home[p])) board[h] = p;
    return { order, home, board, moved: [], turn: 0, moves: 0, last: null, result: null };
  },

  act(s, seat, raw) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; from?: string; to?: string };
    if (a?.type === 'resign') {
      const rest = s.order.filter((p) => p !== seat);
      if (rest.length === 1) return { state: { ...s, result: { winner: rest[0], placings: [rest, [seat]], reason: 'resignation' } } };
      // Their marbles stay put as obstacles; they just don't move any more.
      const order = rest;
      const turn = s.order[s.turn] === seat ? order.indexOf(s.order[(s.turn + 1) % s.order.length]) : order.indexOf(s.order[s.turn]);
      return { state: { ...s, order, turn: Math.max(0, turn) } };
    }
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    if (a?.type !== 'move' || typeof a.from !== 'string' || typeof a.to !== 'string') return { error: 'Move a marble' };
    if (s.board[a.from] !== seat) return { error: 'That isn’t your marble' };
    const path = reachable(s.board, a.from).get(a.to);
    if (!path) return { error: 'It can’t get there' };
    const board = { ...s.board };
    delete board[a.from];
    board[a.to] = seat;
    const inStart = pointHoles(s.home[seat]).includes(a.to);
    const moved = [...s.moved.filter((h) => h !== a.from), ...(inStart && !s.moved.includes(a.from) ? [] : [a.to])];
    const next: CheckersState = { ...s, board, moved, moves: s.moves + 1, last: { seat, from: a.from, to: a.to, path }, turn: (s.turn + 1) % s.order.length };
    if (finished(next, seat)) return { state: { ...next, result: { winner: seat, placings: placings(next, seat), reason: 'filled the opposite point' } } };
    if (next.moves >= MOVE_LIMIT * s.order.length) {
      const pl = placings(next, null);
      return { state: { ...next, result: { winner: pl[0].length === 1 ? pl[0][0] : null, placings: pl, reason: 'the most marbles home when the moves ran out' } } };
    }
    return { state: next };
  },

  turn: (s) => (s.result ? [] : [s.order[s.turn]]),
  timeout(s, seat, now, ctx) {
    const m = bestMove(s, seat);
    if (!m) return { ...s, turn: (s.turn + 1) % s.order.length };
    const r = this.act(s, seat, { type: 'move', ...m }, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): CheckersView {
    const seated = !!viewer && s.order.includes(viewer);
    const mine = seated && !s.result && s.order[s.turn] === viewer;
    const options: Record<Hole, Hole[]> = {};
    if (mine) for (const h of Object.keys(s.board)) if (s.board[h] === viewer) {
      const r = [...reachable(s.board, h).keys()];
      if (r.length) options[h] = r;
    }
    return {
      order: s.order, home: s.home, board: s.board, turn: s.turn, moves: s.moves, last: s.last, result: s.result,
      you: seated ? viewer : null, options,
      target: Object.fromEntries(s.order.map((p) => [p, targetOf(s, p)])),
      homeCount: Object.fromEntries(s.order.map((p) => [p, homeCount(s, p)])),
    };
  },
}, { keys: ['from', 'to'] });

/** The move that brings `seat`'s marbles furthest forward (towards the far tip), deepest first. */
export function bestMove(s: { home: Record<SeatId, number>; board: Record<Hole, SeatId> }, seat: SeatId, random: () => number = Math.random): { from: Hole; to: Hole } | null {
  const target = targetOf(s, seat);
  const tip = tipOf(target);
  const goal = new Set(pointHoles(target));
  let best: { from: Hole; to: Hole; score: number } | null = null;
  for (const from of Object.keys(s.board)) {
    if (s.board[from] !== seat) continue;
    for (const to of reachable(s.board, from).keys()) {
      // Forward progress, a nudge for getting stragglers moving, and never leaving home once there.
      let score = distance(from, tip) - distance(to, tip);
      if (goal.has(from) && !goal.has(to)) score -= 5;
      if (!goal.has(from) && goal.has(to)) score += 0.5;
      score += distance(from, tip) * 0.05 + random() * 0.01;
      if (!best || score > best.score) best = { from, to, score };
    }
  }
  return best && { from: best.from, to: best.to };
}
