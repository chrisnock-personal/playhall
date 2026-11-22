// Roulette (#44) with play chips: a European wheel (single zero), 1-8
// players, a session of a set number of spins from 1,000 chips each. Each
// round everyone places bets, then says they're done; when all are, the wheel
// spins. Straight up on a number pays 35 to 1; red or black, odd or even,
// low or high 1 to 1; dozens and columns 2 to 1. Zero loses every outside
// bet. Most chips at the end wins.

import type { GameResult, SeatId } from '../game';
import { randInt, withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue', 'red', 'slate'];
export const START_CHIPS = 1000;
export const MIN_BET = 5;
export const SPIN_OPTIONS = [10, 15, 20];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** The numbers round a European wheel, from zero clockwise. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

/** A place to bet: 'n17' (a number), 'red', 'black', 'odd', 'even', 'low', 'high', 'd1'-'d3' (dozens), 'c1'-'c3' (columns). */
export type Spot = string;
export const OUTSIDE = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3'];
export const isSpot = (s: string) => OUTSIDE.includes(s) || (/^n\d{1,2}$/.test(s) && Number(s.slice(1)) <= 36);

/** What a spot pays for each chip bet if it wins (not counting the stake), or 0 if it loses. */
export function payout(spot: Spot, n: number): number {
  if (spot[0] === 'n') return Number(spot.slice(1)) === n ? 35 : 0;
  if (n === 0) return 0;
  switch (spot) {
    case 'red': return REDS.has(n) ? 1 : 0;
    case 'black': return REDS.has(n) ? 0 : 1;
    case 'odd': return n % 2 ? 1 : 0;
    case 'even': return n % 2 ? 0 : 1;
    case 'low': return n <= 18 ? 1 : 0;
    case 'high': return n >= 19 ? 1 : 0;
  }
  if (spot[0] === 'd') return Math.ceil(n / 12) === Number(spot[1]) ? 2 : 0;
  if (spot[0] === 'c') return ((n - 1) % 3) + 1 === Number(spot[1]) ? 2 : 0;
  return 0;
}
export const spotWords = (spot: Spot) => (spot[0] === 'n' ? spot.slice(1) : spot[0] === 'd' ? `dozen ${spot[1]}` : spot[0] === 'c' ? `column ${spot[1]}` : spot);
export const colourOf = (n: number) => (n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black');

export interface RouletteConfig { spins: number }

export interface RouletteState {
  config: RouletteConfig;
  order: SeatId[];
  spin: number;
  chips: Record<SeatId, number>;
  bets: Record<SeatId, Record<Spot, number>>;
  ready: SeatId[];
  /** Winning numbers so far, newest last. */
  numbers: number[];
  /** The last spin: each player's chips won back (stake included) and net. */
  last: { number: number; back: Record<SeatId, number>; net: Record<SeatId, number> } | null;
  result: GameResult | null;
  history?: GameHistory;
}

export interface RouletteView extends Omit<RouletteState, 'history'> { you: SeatId | null }

const staked = (bets: Record<Spot, number>) => Object.values(bets).reduce((a, b) => a + b, 0);

function placings(s: RouletteState): SeatId[][] {
  const amounts = [...new Set(s.order.map((p) => s.chips[p]))].sort((a, b) => b - a);
  return amounts.map((c) => s.order.filter((p) => s.chips[p] === c));
}

function spinWheel(s: RouletteState, random: () => number): RouletteState {
  const n = randInt(random, 37);
  const back: Record<SeatId, number> = {}, net: Record<SeatId, number> = {};
  const chips = { ...s.chips };
  for (const p of s.order) {
    const bets = s.bets[p];
    back[p] = Object.entries(bets).reduce((sum, [spot, amt]) => sum + (payout(spot, n) ? amt * (payout(spot, n) + 1) : 0), 0);
    net[p] = back[p] - staked(bets);
    chips[p] += back[p];
  }
  const next: RouletteState = {
    ...s, chips, numbers: [...s.numbers, n].slice(-20), last: { number: n, back, net },
    bets: Object.fromEntries(s.order.map((p) => [p, {}])), ready: [], spin: s.spin + 1,
  };
  // Players with too few chips to bet just watch the wheel; the session ends after the last spin, or when nobody can bet.
  if (next.spin > s.config.spins || s.order.every((p) => chips[p] < MIN_BET)) {
    const pl = placings(next);
    return { ...next, spin: s.spin, result: { winner: pl[0].length === 1 ? pl[0][0] : null, placings: pl, reason: 'the most chips' } };
  }
  return { ...next, ready: s.order.filter((p) => chips[p] < MIN_BET) };
}

function markReady(s: RouletteState, seat: SeatId, random: () => number): RouletteState {
  const ready = s.ready.includes(seat) ? s.ready : [...s.ready, seat];
  const next = { ...s, ready };
  return s.order.every((p) => ready.includes(p)) ? spinWheel(next, random) : next;
}

export const roulette = withHistory<RouletteState, RouletteConfig>({
  id: 'roulette',
  name: 'Roulette',
  description: 'The wheel with play chips, for 1-8. Bet on numbers, colours and dozens; most chips after the last spin wins.',
  howToPlay: {
    goal: 'Have the most chips after the last spin. Everyone starts with 1,000 play chips (no real money).',
    sections: [
      { title: 'Betting', points: [
        `Pick a chip value, then tap places on the table to bet (at least ${MIN_BET} a bet). Tap Clear to take your bets back before the spin.`,
        'When you’re happy, press Done. The wheel spins when everyone is done.',
      ] },
      { title: 'What pays', points: [
        'A single number (straight up): 35 to 1.',
        'Red or black, odd or even, low (1-18) or high (19-36): 1 to 1.',
        'A dozen (1-12, 13-24, 25-36) or a column: 2 to 1.',
        'The wheel has one zero. When zero comes up, every bet except one on 0 itself loses.',
      ] },
      { title: 'The session', points: [
        'The host chooses how many spins. After the last one, the most chips wins.',
        'If the room has a move timer and you run out of time, you’re done for that spin with whatever you’ve bet.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 1,
  defaultConfig: { spins: 10 },
  parseConfig: (raw) => {
    const n = Number((raw as Partial<RouletteConfig>)?.spins);
    return { spins: SPIN_OPTIONS.includes(n) ? n : 10 };
  },
  describeConfig: (c) => `${c.spins} spins`,

  create(config, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    return {
      config, order, spin: 1, chips: Object.fromEntries(order.map((p) => [p, START_CHIPS])),
      bets: Object.fromEntries(order.map((p) => [p, {}])), ready: [], numbers: [], last: null, result: null,
    };
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; spot?: string; amount?: number };
    if (a?.type === 'resign') {
      // They leave the table with what they have; their bets this spin come back.
      const chips = { ...s.chips, [seat]: s.chips[seat] + staked(s.bets[seat]) };
      const order = s.order.filter((p) => p !== seat);
      const gone: RouletteState = { ...s, chips, bets: { ...s.bets, [seat]: {} } };
      if (!order.length) return { state: { ...gone, result: { winner: seat, placings: [[seat]], reason: 'resignation' } } };
      const left: RouletteState = { ...gone, order, ready: s.ready.filter((p) => p !== seat) };
      return { state: order.every((p) => left.ready.includes(p)) ? spinWheel(left, ctx.random) : left };
    }
    if (s.ready.includes(seat)) return { error: 'You’re done for this spin' };
    if (a?.type === 'bet') {
      const spot = String(a.spot ?? '');
      const amount = Number(a.amount);
      if (!isSpot(spot)) return { error: 'That isn’t a place to bet' };
      if (!Number.isInteger(amount) || amount < MIN_BET) return { error: `Bets are at least ${MIN_BET}` };
      if (amount > s.chips[seat]) return { error: 'You don’t have enough chips' };
      const mine = s.bets[seat];
      return { state: { ...s, chips: { ...s.chips, [seat]: s.chips[seat] - amount }, bets: { ...s.bets, [seat]: { ...mine, [spot]: (mine[spot] ?? 0) + amount } } } };
    }
    if (a?.type === 'clear') return { state: { ...s, chips: { ...s.chips, [seat]: s.chips[seat] + staked(s.bets[seat]) }, bets: { ...s.bets, [seat]: {} } } };
    if (a?.type === 'done') return { state: markReady(s, seat, ctx.random) };
    return { error: 'Bet, or say you’re done' };
  },

  turn: (s) => (s.result ? [] : s.order.filter((p) => !s.ready.includes(p))),
  timeout(s, seat, _now, ctx) {
    return s.ready.includes(seat) ? s : markReady(s, seat, ctx.random);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): RouletteView {
    const { history: _h, ...rest } = s;
    return { ...rest, you: viewer && s.order.includes(viewer) ? viewer : null };
  },
}, { keys: ['spot', 'amount'] });
