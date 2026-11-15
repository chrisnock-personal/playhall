// Sea Battle: two players each hide a fleet on a 10×10 grid, then take turns
// firing at the other's waters. Hit every square of a ship to sink it; sink
// the whole fleet to win. The fleets are hidden information: each player's
// view has only their own ships and the results of the shots, and watchers
// see the shots alone until the game ends. (The generic pencil-and-paper
// game; "Battleship" is Hasbro's name for it.)

import type { GameModule, GameResult, SeatId } from '../game';

export const SIZE = 10;
export const FLEET: { name: string; size: number }[] = [
  { name: 'Carrier', size: 5 }, { name: 'Battleship', size: 4 }, { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 }, { name: 'Destroyer', size: 2 },
];
const SEATS = ['amber', 'teal'];

export interface Ship { name: string; cells: number[] }
export interface Shot { cell: number; hit: boolean; sunk?: string }

export interface SeaState {
  phase: 'placing' | 'firing';
  fleets: Record<SeatId, Ship[]>;
  ready: Record<SeatId, boolean>;
  /** Shots fired BY each seat, at the other. */
  shots: Record<SeatId, Shot[]>;
  turn: SeatId;
  result: GameResult | null;
}

export interface SeaView {
  phase: 'placing' | 'firing';
  you: SeatId | null;
  turn: SeatId | null;
  ready: Record<SeatId, boolean>;
  shots: Record<SeatId, Shot[]>;
  /** Fleets you may see: your own; everyone's once the game is over. */
  fleets: Partial<Record<SeatId, Ship[]>>;
  sunk: Record<SeatId, string[]>;
  result: GameResult | null;
}

const other = (s: SeatId) => (s === 'amber' ? 'teal' : 'amber');

export function randomFleet(random: () => number): Ship[] {
  for (;;) {
    const taken = new Set<number>();
    const ships: Ship[] = [];
    let ok = true;
    for (const { name, size } of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const across = random() < 0.5;
        const r = Math.floor(random() * (across ? SIZE : SIZE - size + 1));
        const c = Math.floor(random() * (across ? SIZE - size + 1 : SIZE));
        const cells = Array.from({ length: size }, (_, i) => (across ? r * SIZE + c + i : (r + i) * SIZE + c));
        if (cells.some((x) => taken.has(x))) continue;
        cells.forEach((x) => taken.add(x));
        ships.push({ name, cells });
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

function sunkShips(fleet: Ship[], shots: Shot[]): string[] {
  const hits = new Set(shots.filter((s) => s.hit).map((s) => s.cell));
  return fleet.filter((ship) => ship.cells.every((c) => hits.has(c))).map((s) => s.name);
}

function fire(state: SeaState, seat: SeatId, cell: number): SeaState {
  const target = state.fleets[other(seat)];
  const ship = target.find((s) => s.cells.includes(cell));
  const before = sunkShips(target, state.shots[seat]);
  const shot: Shot = { cell, hit: !!ship };
  const shots = { ...state.shots, [seat]: [...state.shots[seat], shot] };
  const after = sunkShips(target, shots[seat]);
  if (ship && after.length > before.length) shot.sunk = ship.name;
  const result: GameResult | null = after.length === FLEET.length ? { winner: seat, reason: 'sinking the whole fleet' } : null;
  return { ...state, shots, turn: result ? state.turn : other(seat), result };
}

export const seaBattle: GameModule<SeaState, Record<string, never>> = {
  id: 'seabattle',
  name: 'Sea Battle',
  description: 'Two players hide a fleet each on a 10×10 grid and take turns firing. Sink the whole fleet to win.',
  howToPlay: {
    goal: 'Find and sink all five of your opponent’s ships before they sink yours.',
    sections: [
      { title: 'Placing your fleet', points: [
        'Each player has a Carrier (5 squares), a Battleship (4), a Cruiser (3), a Submarine (3) and a Destroyer (2).',
        'Your fleet is laid out for you. Press Shuffle until you like where your ships are, then press Ready. Your opponent can’t see your fleet, and you can’t see theirs.',
        'Firing starts once both players are ready.',
      ] },
      { title: 'Firing', points: [
        'Amber fires first, then you take turns: click a square in the enemy’s waters.',
        'A hit shows as a red peg, a miss as a white one. When every square of a ship has been hit, it sinks and both players are told which ship it was.',
      ] },
      { title: 'How a game ends', points: [
        'Sink the whole fleet to win. You can resign at any time.',
        'If the room has a move timer and you run out of time, a shot is fired for you at a random square (or your fleet is readied as it is).',
        'People watching see the shots, and both fleets once the game is over.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Classic fleet, 10 × 10',

  create: (_c, _now, ctx) => ({
    phase: 'placing',
    fleets: { amber: randomFleet(ctx.random), teal: randomFleet(ctx.random) },
    ready: { amber: false, teal: false },
    shots: { amber: [], teal: [] },
    turn: 'amber',
    result: null,
  }),

  act(state, seat, raw, _now, ctx) {
    if (state.result) return { error: 'The game is over' };
    if (!SEATS.includes(seat)) return { error: 'Not a Sea Battle seat' };
    const action = raw as { type?: string; cell?: number };
    switch (action?.type) {
      case 'shuffle':
        if (state.phase !== 'placing' || state.ready[seat]) return { error: 'Your fleet is already set' };
        return { state: { ...state, fleets: { ...state.fleets, [seat]: randomFleet(ctx.random) } } };
      case 'ready': {
        if (state.phase !== 'placing') return { error: 'Firing has started' };
        const ready = { ...state.ready, [seat]: true };
        return { state: { ...state, ready, phase: ready.amber && ready.teal ? 'firing' : 'placing' } };
      }
      case 'fire': {
        if (state.phase !== 'firing') return { error: 'Wait until both fleets are ready' };
        if (state.turn !== seat) return { error: 'It isn’t your turn' };
        const cell = action.cell as number;
        if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return { error: 'No such square' };
        if (state.shots[seat].some((s) => s.cell === cell)) return { error: 'You’ve already fired there' };
        return { state: fire(state, seat, cell) };
      }
      case 'resign':
        return { state: { ...state, result: { winner: other(seat), reason: 'resignation' } } };
      default:
        return { error: 'Unknown move' };
    }
  },

  turn: (state) => (state.result ? [] : state.phase === 'placing' ? SEATS.filter((s) => !state.ready[s]) : [state.turn]),
  timeout(state, seat, _now, ctx) {
    if (state.phase === 'placing') {
      const ready = { ...state.ready, [seat]: true };
      return { ...state, ready, phase: ready.amber && ready.teal ? 'firing' : 'placing' };
    }
    const tried = new Set(state.shots[seat].map((s) => s.cell));
    const open = Array.from({ length: SIZE * SIZE }, (_, i) => i).filter((i) => !tried.has(i));
    return fire(state, seat, open[Math.floor(ctx.random() * open.length)]);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (state) => state.result,

  view(state, _now, viewer): SeaView {
    const fleets: SeaView['fleets'] = {};
    if (state.result) { fleets.amber = state.fleets.amber; fleets.teal = state.fleets.teal; }
    else if (viewer && SEATS.includes(viewer)) fleets[viewer] = state.fleets[viewer];
    return {
      phase: state.phase, you: viewer, turn: state.result ? null : state.turn, ready: state.ready, shots: state.shots, fleets,
      sunk: { amber: sunkShips(state.fleets.amber, state.shots.teal), teal: sunkShips(state.fleets.teal, state.shots.amber) },
      result: state.result,
    };
  },
};
