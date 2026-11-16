// Snakes and Ladders, 2-4 players. Roll the die (on the server) and move your
// token up the 10×10 board; a ladder's foot takes you up, a snake's head
// takes you down. You must land exactly on 100: roll too high and you bounce
// back the extra squares. The first to 100 wins; everyone else is placed by
// how far they got. The layout of snakes and ladders is our own.

import type { GameResult, SeatId } from '../game';
import { randInt, withHistory, type GameHistory } from './history';

export const LADDERS: Record<number, number> = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
export const SNAKES: Record<number, number> = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };
const SEATS = ['amber', 'teal', 'violet', 'rose'];

export interface SnakesRoll { seat: SeatId; value: number; from: number; to: number; via: 'ladder' | 'snake' | null; bounced: boolean }

export interface SnakesState {
  /** Players in turn order (the seats that were filled). */
  order: SeatId[];
  /** 0 = not on the board yet. */
  pos: Record<SeatId, number>;
  turn: number;
  rolls: SnakesRoll[];
  result: GameResult | null;
  /** For replays (see history.ts); missing in games saved before it. */
  history?: GameHistory;
}

export interface SnakesView {
  order: SeatId[];
  pos: Record<SeatId, number>;
  turn: SeatId | null;
  last: SnakesRoll | null;
  rolls: SnakesRoll[];
  result: GameResult | null;
}

/** Move from `from` by `roll`, with the bounce at 100 and any snake or ladder. */
export function step(from: number, roll: number): Omit<SnakesRoll, 'seat' | 'value'> {
  let to = from + roll;
  let bounced = false;
  if (to > 100) { to = 200 - to; bounced = true; }
  if (LADDERS[to]) return { from, to: LADDERS[to], via: 'ladder', bounced };
  if (SNAKES[to]) return { from, to: SNAKES[to], via: 'snake', bounced };
  return { from, to, via: null, bounced };
}

function roll(state: SnakesState, seat: SeatId, value: number): SnakesState {
  const moved = step(state.pos[seat], value);
  const pos = { ...state.pos, [seat]: moved.to };
  const rolls = [...state.rolls, { seat, value, ...moved }].slice(-30);
  let result: GameResult | null = null;
  if (moved.to === 100) {
    // Everyone else is placed by how far up the board they got.
    const rest = state.order.filter((s) => s !== seat);
    const heights = [...new Set(rest.map((s) => pos[s]))].sort((a, b) => b - a);
    result = { winner: seat, reason: 'reaching 100', placings: [[seat], ...heights.map((h) => rest.filter((s) => pos[s] === h))] };
  }
  return { ...state, pos, rolls, result, turn: result ? state.turn : (state.turn + 1) % state.order.length };
}

export const snakes = withHistory<SnakesState, Record<string, never>>({
  id: 'snakes',
  name: 'Snakes and Ladders',
  description: '2-4 players. Roll the die, climb the ladders, slide down the snakes; first to 100 wins.',
  howToPlay: {
    goal: 'Be the first to get your token to square 100.',
    sections: [
      { title: 'Taking turns', points: [
        'Players go in seat order: Amber, Teal, Violet, Rose. Everyone starts off the board.',
        'On your turn, press Roll. Your token moves that many squares along the board, which snakes back and forth from 1 at the bottom to 100 at the top.',
      ] },
      { title: 'Ladders and snakes', points: [
        'Land on the foot of a ladder and you climb to its top.',
        'Land on a snake’s head and you slide down to its tail.',
      ] },
      { title: 'Finishing', points: [
        'You must land exactly on 100. Roll too high and you bounce back by the extra squares.',
        'The first to 100 wins. Everyone else is placed by how far they got: second place earns a point.',
        'If the room has a move timer and you run out of time, the die is rolled for you.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Classic board',

  create: (_c, _now, ctx) => ({
    order: ctx.seats, pos: Object.fromEntries(ctx.seats.map((s) => [s, 0])), turn: 0, rolls: [], result: null,
  }),

  act(state, seat, raw, _now, ctx) {
    if (state.result) return { error: 'The game is over' };
    const action = raw as { type?: string };
    if (action?.type === 'resign') {
      // Resigning drops you to last place; the game goes on without you if two or more are left.
      const order = state.order.filter((s) => s !== seat);
      if (order.length === 1) return { state: { ...state, result: { winner: order[0], reason: 'everyone else resigning' } } };
      const current = state.order[state.turn];
      const turn = current === seat ? state.turn % order.length : order.indexOf(current);
      return { state: { ...state, order, turn } };
    }
    if (action?.type !== 'roll') return { error: 'Unknown move' };
    if (state.order[state.turn] !== seat) return { error: 'It isn’t your turn' };
    return { state: roll(state, seat, 1 + randInt(ctx.random, 6)) };
  },

  turn: (state) => (state.result ? [] : [state.order[state.turn]]),
  /** Out of time: the die is rolled for you. */
  timeout: (state, seat, _now, ctx) => roll(state, seat, 1 + randInt(ctx.random, 6)),
  tick: () => null,
  nextDeadline: () => null,
  result: (state) => state.result,

  view(state): SnakesView {
    return {
      order: state.order, pos: state.pos, turn: state.result ? null : state.order[state.turn],
      last: state.rolls[state.rolls.length - 1] ?? null, rolls: state.rolls.slice(-12), result: state.result,
    };
  },
}, { keys: [] });
