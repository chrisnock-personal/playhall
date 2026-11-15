// Ludo, 2-4 players, four tokens each. Roll a 6 to bring a token out of the
// yard; a 6 also earns another roll (three 6s in a row and your turn ends).
// Land on an opponent and they go back to their yard, except on the safe
// squares (each start and each star). Tokens go once round the 52-square
// track, then up their own home column; reaching home needs an exact roll.
// The first with all four home wins; the others are placed by progress.

import type { GameModule, GameResult, SeatId } from '../game';

export const SEATS = ['amber', 'teal', 'violet', 'rose'];
/** Where each colour joins the track. */
export const START: Record<string, number> = { amber: 0, teal: 13, violet: 26, rose: 39 };
/** Starts and stars: no captures here. */
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
/** Progress: -1 in the yard, 0-50 on the track, 51-55 the home column, 56 home. */
export const HOME = 56;
const LAST_TRACK = 50;

export interface LudoState {
  order: SeatId[];
  tokens: Record<SeatId, number[]>;
  turn: number;
  /** The roll waiting for a token to be moved, if any. */
  roll: number | null;
  sixes: number;
  log: { seat: SeatId; roll: number; token: number | null; captured: SeatId[]; note?: string }[];
  result: GameResult | null;
}

export interface LudoView {
  order: SeatId[];
  tokens: Record<SeatId, number[]>;
  turn: SeatId | null;
  roll: number | null;
  /** Tokens the player to move may move with the current roll. */
  movable: number[];
  last: LudoState['log'][number] | null;
  log: LudoState['log'];
  result: GameResult | null;
}

/** The track square (0-51) a token is on, or null off the track. */
export function square(seat: SeatId, progress: number): number | null {
  return progress >= 0 && progress <= LAST_TRACK ? (START[seat] + progress) % 52 : null;
}

export function movable(state: LudoState, seat: SeatId, roll: number): number[] {
  return state.tokens[seat].flatMap((p, i) => (p === -1 ? (roll === 6 ? [i] : []) : p + roll <= HOME && p !== HOME ? [i] : []));
}

const progressScore = (t: number[]) => t.filter((p) => p === HOME).length * 1000 + t.reduce((n, p) => n + Math.max(p, 0), 0);

function next(state: LudoState, again: boolean): LudoState {
  return again ? { ...state, roll: null } : { ...state, roll: null, sixes: 0, turn: (state.turn + 1) % state.order.length };
}

function doRoll(state: LudoState, seat: SeatId, value: number): LudoState {
  const sixes = value === 6 ? state.sixes + 1 : 0;
  if (sixes === 3) {
    return next({ ...state, sixes: 0, log: [...state.log, { seat, roll: value, token: null, captured: [], note: 'three 6s: turn over' }].slice(-40) }, false);
  }
  const options = movable(state, seat, value);
  if (!options.length) {
    return next({ ...state, sixes, log: [...state.log, { seat, roll: value, token: null, captured: [], note: 'no move' }].slice(-40) }, value === 6);
  }
  return { ...state, roll: value, sixes };
}

function doMove(state: LudoState, seat: SeatId, token: number): LudoState {
  const roll = state.roll!;
  const tokens = Object.fromEntries(Object.entries(state.tokens).map(([s, t]) => [s, [...t]]));
  const from = tokens[seat][token];
  const to = from === -1 ? 0 : from + roll;
  tokens[seat][token] = to;
  const captured: SeatId[] = [];
  const sq = square(seat, to);
  if (sq !== null && !SAFE.has(sq)) {
    for (const other of state.order) {
      if (other === seat) continue;
      tokens[other] = tokens[other].map((p) => {
        if (square(other, p) === sq) { captured.push(other); return -1; }
        return p;
      });
    }
  }
  const log = [...state.log, { seat, roll, token, captured }].slice(-40);
  if (tokens[seat].every((p) => p === HOME)) {
    const rest = state.order.filter((s) => s !== seat);
    const scores = [...new Set(rest.map((s) => progressScore(tokens[s])))].sort((a, b) => b - a);
    return {
      ...state, tokens, log, roll: null,
      result: { winner: seat, reason: 'getting all four tokens home', placings: [[seat], ...scores.map((sc) => rest.filter((s) => progressScore(tokens[s]) === sc))] },
    };
  }
  return next({ ...state, tokens, log }, roll === 6);
}

const d6 = (random: () => number) => 1 + Math.floor(random() * 6);

export const ludo: GameModule<LudoState, Record<string, never>> = {
  id: 'ludo',
  name: 'Ludo',
  description: '2-4 players, four tokens each. Roll a 6 to come out, send rivals back to their yard, get all four home.',
  howToPlay: {
    goal: 'Be the first to get all four of your tokens round the board and into your home in the middle.',
    sections: [
      { title: 'Taking turns', points: [
        'Players go in seat order: Amber, Teal, Violet, Rose. Press Roll, then click the token you want to move (the ones that can move are marked).',
        'Your tokens start in your yard. You need a 6 to bring one out onto your start square.',
        'Rolling a 6 gives you another roll. Three 6s in a row and your turn ends there.',
        'If no token can move, play passes on.',
      ] },
      { title: 'Capturing', points: [
        'Land on a square with an opponent’s token and it goes back to their yard.',
        'Start squares and squares with a star are safe: nobody can be captured there.',
        'Your own tokens can share a square.',
      ] },
      { title: 'Getting home', points: [
        'Each token goes once round the track, then turns up your own coloured home column.',
        'You must roll the exact number to reach home; a token that would go past can’t move.',
        'The first to get all four home wins. Everyone else is placed by how far they got: second place earns a point.',
        'If the room has a move timer and you run out of time, your roll or move is made for you.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Classic rules',

  create: (_c, _now, ctx) => ({
    order: ctx.seats, tokens: Object.fromEntries(ctx.seats.map((s) => [s, [-1, -1, -1, -1]])),
    turn: 0, roll: null, sixes: 0, log: [], result: null,
  }),

  act(state, seat, raw, _now, ctx) {
    if (state.result) return { error: 'The game is over' };
    const action = raw as { type?: string; token?: number };
    if (action?.type === 'resign') {
      const order = state.order.filter((s) => s !== seat);
      if (order.length === 1) return { state: { ...state, result: { winner: order[0], reason: 'everyone else resigning' } } };
      const current = state.order[state.turn];
      return { state: { ...state, order, roll: current === seat ? null : state.roll, sixes: current === seat ? 0 : state.sixes, turn: current === seat ? state.turn % order.length : order.indexOf(current) } };
    }
    if (state.order[state.turn] !== seat) return { error: 'It isn’t your turn' };
    if (action?.type === 'roll') {
      if (state.roll !== null) return { error: 'Move a token first' };
      return { state: doRoll(state, seat, d6(ctx.random)) };
    }
    if (action?.type === 'move') {
      if (state.roll === null) return { error: 'Roll first' };
      if (!movable(state, seat, state.roll).includes(action.token as number)) return { error: 'That token can’t move' };
      return { state: doMove(state, seat, action.token as number) };
    }
    return { error: 'Unknown move' };
  },

  turn: (state) => (state.result ? [] : [state.order[state.turn]]),
  /** Out of time: roll, or move the token furthest back that can move. */
  timeout(state, seat, _now, ctx) {
    if (state.roll === null) return doRoll(state, seat, d6(ctx.random));
    const options = movable(state, seat, state.roll);
    const pick = options.sort((a, b) => state.tokens[seat][a] - state.tokens[seat][b])[0];
    return doMove(state, seat, pick);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (state) => state.result,

  view(state): LudoView {
    const seat = state.order[state.turn];
    return {
      order: state.order, tokens: state.tokens, turn: state.result ? null : seat, roll: state.roll,
      movable: state.roll !== null && !state.result ? movable(state, seat, state.roll) : [],
      last: state.log[state.log.length - 1] ?? null, log: state.log.slice(-12), result: state.result,
    };
  },
};
