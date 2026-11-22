// Bingo (#45): 90-ball, for any number of players (up to eight seats) with
// watchers looking on. Each player has a ticket (or two) of three rows of five
// numbers. The server calls the numbers on a timer, with the traditional
// calls; players mark them (or turn on auto-mark). The first to mark a whole
// row wins "one line", then "two lines", then the full house ends the game.
// Players who finish a prize on the same call share it.

import type { GameModule, GameResult, SeatId } from '../game';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue', 'red', 'slate'];
export const STAGES = ['one line', 'two lines', 'full house'] as const;
export type Stage = (typeof STAGES)[number];
export const SPEEDS = [4, 6, 8];
const LEAD_IN_MS = 5000;

/** A ticket: three rows of nine columns, null where there's no number. */
export type Ticket = (number | null)[][];

export interface BingoConfig { speed: number; tickets: number }

export interface BingoState {
  order: SeatId[];
  config: BingoConfig;
  tickets: Record<SeatId, Ticket[]>;
  /** Every number, in the order it will be called (secret until called). */
  calls: number[];
  called: number;
  nextAt: number;
  marked: Record<SeatId, number[]>;
  auto: Record<SeatId, boolean>;
  prizes: { stage: Stage; winners: SeatId[]; at: number }[];
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
}

export interface BingoView {
  order: SeatId[];
  you: SeatId | null;
  config: BingoConfig;
  tickets: Ticket[] | null;
  marked: number[];
  auto: boolean;
  called: number[];
  nextAt: number | null;
  /** The prize being played for now. */
  stage: Stage | null;
  prizes: BingoState['prizes'];
  /** How many numbers each player still needs for the full house. */
  toGo: Record<SeatId, number>;
  log: BingoState['log'];
  result: GameResult | null;
}

const CALLS: Record<number, string> = {
  1: 'Kelly’s eye', 2: 'One little duck', 3: 'Cup of tea', 4: 'Knock at the door', 5: 'Man alive', 7: 'Lucky seven', 8: 'Garden gate',
  9: 'Doctor’s orders', 11: 'Legs eleven', 12: 'One dozen', 13: 'Unlucky for some', 16: 'Sweet sixteen', 21: 'Key of the door',
  22: 'Two little ducks', 26: 'Pick and mix', 27: 'Gateway to heaven', 31: 'Get up and run', 44: 'Droopy drawers', 45: 'Halfway there',
  48: 'Four dozen', 50: 'Half a century', 52: 'Deck of cards', 59: 'The Brighton line', 66: 'Clickety click', 76: 'Trombones',
  77: 'Sunset strip', 80: 'Eight and blank', 85: 'Staying alive', 86: 'Between the sticks', 88: 'Two fat ladies', 89: 'Nearly there', 90: 'Top of the shop',
};
/** The caller's words: "Two little ducks, 22", or "On its own, 6". */
export function callWords(n: number): string {
  if (CALLS[n]) return `${CALLS[n]}, ${n}`;
  if (n < 10) return `On its own, number ${n}`;
  return `${String(n)[0]} and ${String(n)[1]}, ${n}`;
}

const colOf = (n: number) => (n === 90 ? 8 : Math.floor(n / 10));
const shuffle = <T,>(xs: T[], random: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** A 90-ball ticket: each row five numbers, each column one to three, column c holding c0-c9 (1-9, 80-90 at the ends). */
export function makeTicket(random: () => number): Ticket {
  for (;;) {
    const counts = Array(9).fill(1);
    for (let k = 0; k < 6;) { const c = Math.floor(random() * 9); if (counts[c] < 3) { counts[c]++; k++; } }
    // Place each column's numbers in rows, keeping every row to five.
    const rows = [0, 0, 0];
    const grid: boolean[][] = [[], [], []];
    let ok = true;
    const cols = shuffle([...Array(9).keys()], random).sort((a, b) => counts[b] - counts[a]);
    for (const c of cols) {
      const choice = [0, 1, 2].filter((r) => rows[r] < 5).sort((a, b) => rows[a] - rows[b] || random() - 0.5).slice(0, counts[c]);
      if (choice.length < counts[c]) { ok = false; break; }
      for (const r of choice) { grid[r][c] = true; rows[r]++; }
    }
    if (!ok || rows.some((n) => n !== 5)) continue;
    const ticket: Ticket = [[], [], []].map(() => Array(9).fill(null));
    for (let c = 0; c < 9; c++) {
      const pool = [...Array(91).keys()].slice(1).filter((n) => colOf(n) === c);
      const used = [0, 1, 2].filter((r) => grid[r][c]);
      const nums = shuffle(pool, random).slice(0, used.length).sort((a, b) => a - b);
      used.forEach((r, i) => { ticket[r][c] = nums[i]; });
    }
    return ticket;
  }
}

/** Full rows on a player's best ticket, given what they've marked. */
export function rowsDone(tickets: Ticket[], marked: number[]): number {
  const m = new Set(marked);
  return Math.max(...tickets.map((t) => t.filter((row) => row.every((n) => n === null || m.has(n))).length));
}
const numbersOf = (tickets: Ticket[]) => tickets.flatMap((t) => t.flat().filter((n): n is number => n !== null));

const stageOf = (s: BingoState): Stage | null => (s.result ? null : STAGES[s.prizes.length] ?? null);
const need = (stage: Stage) => STAGES.indexOf(stage) + 1;

/** Award whatever prize is now won, and end the game on a full house. */
function award(s: BingoState): BingoState {
  const stage = stageOf(s);
  if (!stage) return s;
  const winners = s.order.filter((p) => rowsDone(s.tickets[p], s.marked[p]) >= need(stage));
  if (!winners.length) return s;
  const prizes = [...s.prizes, { stage, winners, at: s.called }];
  const log = [...s.log, { seat: winners[0], text: `${winners.length > 1 ? 'shared' : 'won'} ${stage}` }].slice(-40);
  const next = { ...s, prizes, log };
  if (stage !== 'full house') return award(next);
  // Placed by the best prize each player won, then everyone else.
  const best = (p: SeatId) => Math.max(-1, ...prizes.filter((x) => x.winners.includes(p)).map((x) => STAGES.indexOf(x.stage)));
  const groups = [2, 1, 0, -1].map((k) => s.order.filter((p) => best(p) === k)).filter((g) => g.length);
  return { ...next, result: { winner: winners.length === 1 ? winners[0] : null, placings: groups, reason: 'full house' } };
}

function withAuto(s: BingoState): BingoState {
  const called = new Set(s.calls.slice(0, s.called));
  const marked = { ...s.marked };
  for (const p of s.order) if (s.auto[p]) marked[p] = numbersOf(s.tickets[p]).filter((n) => called.has(n));
  return { ...s, marked };
}

// No replays: the calls come from the clock, which a replay of the moves can't follow.
export const bingo: GameModule<BingoState, BingoConfig> = {
  id: 'bingo',
  name: 'Bingo',
  description: '90-ball bingo for up to eight, with the traditional calls. One line, two lines, then a full house.',
  howToPlay: {
    goal: 'Mark off every number on your ticket before anyone else: the full house. One line and two lines win prizes on the way.',
    sections: [
      { title: 'Your ticket', points: [
        'Your ticket has three rows of five numbers between 1 and 90. Each column holds one group of ten (1-9, 10-19… up to 80-90).',
        'The host can give everyone two tickets; your best ticket counts.',
      ] },
      { title: 'The calls', points: [
        'Numbers are called every few seconds, with the traditional calls (“Two little ducks, 22”). The board shows every number called so far.',
        'Tap a called number on your ticket to mark it. Or turn on auto-mark and they’re marked for you.',
      ] },
      { title: 'Prizes', points: [
        'One line: the first to mark a whole row. Two lines: the first with two whole rows on one ticket. Full house: all fifteen numbers, which ends the game.',
        'A prize goes to whoever has it marked when a number is called, so keep up! Players who finish on the same call share it.',
        'Everyone is placed by the best prize they won.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 1,
  defaultConfig: { speed: 6, tickets: 1 },
  parseConfig: (raw) => {
    const c = (raw ?? {}) as Partial<BingoConfig>;
    return { speed: SPEEDS.includes(Number(c.speed)) ? Number(c.speed) : 6, tickets: Number(c.tickets) === 2 ? 2 : 1 };
  },
  describeConfig: (c) => `90-ball · a call every ${c.speed} s${c.tickets === 2 ? ' · two tickets each' : ''}`,

  create(config, now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    const none = <T,>(v: T) => Object.fromEntries(order.map((p) => [p, v])) as Record<SeatId, T>;
    return {
      order, config, tickets: Object.fromEntries(order.map((p) => [p, Array.from({ length: config.tickets }, () => makeTicket(ctx.random))])),
      calls: shuffle([...Array(91).keys()].slice(1), ctx.random), called: 0, nextAt: now + LEAD_IN_MS,
      marked: none<number[]>([]), auto: none(false), prizes: [], log: [], result: null,
    };
  },

  act(s, seat, raw) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; n?: number; on?: boolean };
    if (a?.type === 'resign') {
      const order = s.order.filter((p) => p !== seat);
      if (!order.length) return { state: { ...s, result: { winner: null, placings: [[seat]], reason: 'resignation', aborted: true } } };
      return { state: { ...s, order, log: [...s.log, { seat, text: 'left the game' }].slice(-40) } };
    }
    if (a?.type === 'auto') return { state: award(withAuto({ ...s, auto: { ...s.auto, [seat]: !!a.on } })) };
    if (a?.type !== 'mark') return { error: 'Mark a number' };
    const n = Number(a.n);
    if (!numbersOf(s.tickets[seat]).includes(n)) return { error: 'That number isn’t on your ticket' };
    if (!s.calls.slice(0, s.called).includes(n)) return { error: 'That number hasn’t been called' };
    const mine = s.marked[seat];
    const marked = mine.includes(n) ? mine.filter((x) => x !== n) : [...mine, n];
    return { state: award({ ...s, marked: { ...s.marked, [seat]: marked } }) };
  },

  // No turns: the calls come on a timer. Computer players only need to turn auto-mark on.
  noTurns: true,
  waitingFor: (s) => (s.result ? [] : s.order.filter((p) => !s.auto[p])),
  tick(s, now) {
    if (s.result || now < s.nextAt || s.called >= s.calls.length) return null;
    const n = s.calls[s.called];
    const next = withAuto({ ...s, called: s.called + 1, nextAt: now + s.config.speed * 1000, log: [...s.log, { seat: s.order[0], text: callWords(n) }].slice(-40) });
    return award(next);
  },
  nextDeadline: (s) => (s.result ? null : s.nextAt),
  result: (s) => s.result,

  view(s, _now, viewer): BingoView {
    const seated = !!viewer && s.order.includes(viewer);
    return {
      order: s.order, you: seated ? viewer : null, config: s.config,
      tickets: seated ? s.tickets[viewer!] : null, marked: seated ? s.marked[viewer!] : [], auto: seated ? s.auto[viewer!] : false,
      called: s.calls.slice(0, s.called), nextAt: s.result ? null : s.nextAt, stage: stageOf(s), prizes: s.prizes,
      toGo: Object.fromEntries(s.order.map((p) => [p, Math.min(...s.tickets[p].map((t) => t.flat().filter((n) => n !== null && !s.marked[p].includes(n)).length))])),
      log: s.log, result: s.result,
    };
  },
};
