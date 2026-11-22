// Craps (#43) with play chips: 1-8 players take turns as the shooter, and
// everyone bets on each roll of two dice. A session of a set number of rolls
// from 1,000 chips each; most chips at the end wins.
//   Pass line (before the come-out roll): 7 or 11 wins, 2, 3 or 12 loses;
//     any other total sets the point, and then the point again wins, a 7 loses.
//   Don't pass: the opposite (2 or 3 wins, 12 is a push; after the point, a 7 wins).
//   Odds: behind a pass bet once the point is set, up to twice the pass bet,
//     paid at true odds (4 or 10 2:1, 5 or 9 3:2, 6 or 8 6:5).
//   Field (one roll): 2, 3, 4, 9, 10, 11 or 12 wins; 2 and 12 pay double.
// The shooter keeps the dice until they seven out.

import type { GameResult, SeatId } from '../game';
import { randInt, withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue', 'red', 'slate'];
export const START_CHIPS = 1000;
export const MIN_BET = 5;
export const ROLL_OPTIONS = [20, 30, 40];
export const BETS = ['pass', 'dontpass', 'odds', 'field'] as const;
export type Bet = (typeof BETS)[number];
export const BET_NAMES: Record<Bet, string> = { pass: 'Pass line', dontpass: 'Don’t pass', odds: 'Odds', field: 'Field' };

/** True odds on a point: what each chip wins. */
export const ODDS: Record<number, [number, number]> = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };

export interface CrapsConfig { rolls: number }
type Stakes = Record<Bet, number>;
const none = (): Stakes => ({ pass: 0, dontpass: 0, odds: 0, field: 0 });

export interface CrapsState {
  config: CrapsConfig;
  order: SeatId[];
  shooter: number;
  point: number | null;
  roll: number;
  chips: Record<SeatId, number>;
  bets: Record<SeatId, Stakes>;
  /** What each player has put down since the last roll (what Clear gives back). */
  fresh: Record<SeatId, Stakes>;
  ready: SeatId[];
  last: { dice: [number, number]; net: Record<SeatId, number>; words: string } | null;
  result: GameResult | null;
  history?: GameHistory;
}

export interface CrapsView extends Omit<CrapsState, 'history'> { you: SeatId | null }

const total = (b: Stakes) => b.pass + b.dontpass + b.odds + b.field;

/** Settle one roll for one player: chips back (stake included), and the bets left on the table. */
export function settle(bets: Stakes, point: number | null, t: number): { back: number; bets: Stakes } {
  let back = 0;
  const left = { ...bets, field: 0 };
  if (bets.field) {
    if ([2, 12].includes(t)) back += bets.field * 3;
    else if ([3, 4, 9, 10, 11].includes(t)) back += bets.field * 2;
  }
  if (point === null) {
    if (t === 7 || t === 11) { back += bets.pass * 2; left.pass = 0; back += 0; left.dontpass = 0; }
    else if (t === 2 || t === 3) { left.pass = 0; back += bets.dontpass * 2; left.dontpass = 0; }
    else if (t === 12) { left.pass = 0; back += bets.dontpass; left.dontpass = 0; }
  } else if (t === point) {
    const [num, den] = ODDS[point];
    back += bets.pass * 2 + bets.odds + Math.floor((bets.odds * num) / den);
    left.pass = 0; left.odds = 0; left.dontpass = 0;
  } else if (t === 7) {
    back += bets.dontpass * 2;
    left.pass = 0; left.odds = 0; left.dontpass = 0;
  }
  return { back, bets: left };
}

function rollWords(point: number | null, t: number): { words: string; point: number | null; sevenOut: boolean } {
  if (point === null) {
    if (t === 7 || t === 11) return { words: `${t}: a natural, pass wins`, point: null, sevenOut: false };
    if (t === 2 || t === 3 || t === 12) return { words: `${t}: craps, pass loses`, point: null, sevenOut: false };
    return { words: `${t}: the point is ${t}`, point: t, sevenOut: false };
  }
  if (t === point) return { words: `${t}: the point is made, pass wins`, point: null, sevenOut: false };
  if (t === 7) return { words: '7: seven out, don’t pass wins', point: null, sevenOut: true };
  return { words: `${t}: roll again for the ${point}`, point, sevenOut: false };
}

function placings(s: CrapsState): SeatId[][] {
  const amounts = [...new Set(s.order.map((p) => s.chips[p]))].sort((a, b) => b - a);
  return amounts.map((c) => s.order.filter((p) => s.chips[p] === c));
}

function rollDice(s: CrapsState, random: () => number): CrapsState {
  const dice: [number, number] = [randInt(random, 6) + 1, randInt(random, 6) + 1];
  const t = dice[0] + dice[1];
  const chips = { ...s.chips }, bets = { ...s.bets }, net: Record<SeatId, number> = {};
  for (const p of s.order) {
    const before = total(s.bets[p]);
    const r = settle(s.bets[p], s.point, t);
    chips[p] += r.back;
    bets[p] = r.bets;
    net[p] = r.back - (before - total(r.bets));
  }
  const w = rollWords(s.point, t);
  const shooter = w.sevenOut ? (s.shooter + 1) % s.order.length : s.shooter;
  let next: CrapsState = {
    ...s, chips, bets, point: w.point, shooter, roll: s.roll + 1, ready: [], last: { dice, net, words: w.words },
    fresh: Object.fromEntries(s.order.map((p) => [p, none()])),
  };
  if (next.roll > s.config.rolls) {
    // The session is over: bets still on the table come back.
    for (const p of s.order) { next.chips[p] += total(next.bets[p]); next.bets[p] = none(); }
    const pl = placings(next);
    return { ...next, roll: s.roll, result: { winner: pl[0].length === 1 ? pl[0][0] : null, placings: pl, reason: 'the most chips' } };
  }
  // Anyone who can't bet and has nothing riding is done at once.
  next = { ...next, ready: s.order.filter((p) => chips[p] < MIN_BET && !total(next.bets[p])) };
  if (s.order.every((p) => next.ready.includes(p))) {
    const pl = placings(next);
    return { ...next, result: { winner: pl[0].length === 1 ? pl[0][0] : null, placings: pl, reason: 'the most chips' } };
  }
  return next;
}

function markReady(s: CrapsState, seat: SeatId, random: () => number): CrapsState {
  const ready = s.ready.includes(seat) ? s.ready : [...s.ready, seat];
  const next = { ...s, ready };
  return s.order.every((p) => ready.includes(p)) ? rollDice(next, random) : next;
}

/** Why `seat` can't put `amount` on `bet` now, or null if they can. */
export function cantBet(s: Pick<CrapsState, 'point' | 'bets' | 'chips'>, seat: SeatId, bet: Bet, amount: number): string | null {
  if (!Number.isInteger(amount) || amount < MIN_BET) return `Bets are at least ${MIN_BET}`;
  if (amount > s.chips[seat]) return 'You don’t have enough chips';
  const b = s.bets[seat];
  if ((bet === 'pass' || bet === 'dontpass') && s.point !== null) return 'Pass and don’t pass go down before the come-out roll';
  if (bet === 'odds') {
    if (s.point === null) return 'Odds go down once there’s a point';
    if (!b.pass) return 'Odds go behind a pass line bet';
    if (b.odds + amount > b.pass * 2) return 'Odds can be up to twice your pass bet';
  }
  return null;
}

export const craps = withHistory<CrapsState, CrapsConfig>({
  id: 'craps',
  name: 'Craps',
  description: 'Dice with play chips, for 1-8. Bet the pass line, back it with odds, or play the field; most chips at the end wins.',
  howToPlay: {
    goal: 'Have the most chips after the last roll. Everyone starts with 1,000 play chips (no real money).',
    sections: [
      { title: 'The rolls', points: [
        'Everyone bets, then presses Done; when all are done, the shooter’s dice roll.',
        'The come-out roll: 7 or 11 is a natural, and pass wins. 2, 3 or 12 is craps, and pass loses. Any other total becomes the point.',
        'With a point set, the dice roll until the point comes again (pass wins) or a 7 (seven out: pass loses, and the dice go to the next shooter).',
      ] },
      { title: 'The bets', points: [
        'Pass line (before the come-out): wins 1 to 1 as above.',
        'Don’t pass (before the come-out): the opposite. 2 or 3 wins, 12 is a push, 7 or 11 loses; after the point, a 7 wins and the point loses.',
        'Odds: once there’s a point, back your pass bet with up to twice as much again. Paid at true odds: 2 to 1 on 4 or 10, 3 to 2 on 5 or 9, 6 to 5 on 6 or 8.',
        'Field (any roll, one roll only): 3, 4, 9, 10 or 11 pay 1 to 1, 2 and 12 pay 2 to 1; 5, 6, 7 and 8 lose.',
      ] },
      { title: 'The session', points: [
        'The host chooses how many rolls. After the last one, bets still on the table come back, and the most chips wins.',
        'If the room has a move timer and you run out of time, you’re done for that roll with whatever you’ve bet.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 1,
  defaultConfig: { rolls: 20 },
  parseConfig: (raw) => {
    const n = Number((raw as Partial<CrapsConfig>)?.rolls);
    return { rolls: ROLL_OPTIONS.includes(n) ? n : 20 };
  },
  describeConfig: (c) => `${c.rolls} rolls`,

  create(config, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    return {
      config, order, shooter: 0, point: null, roll: 1, chips: Object.fromEntries(order.map((p) => [p, START_CHIPS])),
      bets: Object.fromEntries(order.map((p) => [p, none()])), fresh: Object.fromEntries(order.map((p) => [p, none()])),
      ready: [], last: null, result: null,
    };
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; bet?: string; amount?: number };
    if (a?.type === 'resign') {
      // They leave with their chips; bets on the table are lost, as at a real table.
      const order = s.order.filter((p) => p !== seat);
      if (!order.length) return { state: { ...s, result: { winner: seat, placings: [[seat]], reason: 'resignation' } } };
      const left: CrapsState = { ...s, order, ready: s.ready.filter((p) => p !== seat), shooter: s.shooter % order.length };
      return { state: order.every((p) => left.ready.includes(p)) ? rollDice(left, ctx.random) : left };
    }
    if (s.ready.includes(seat)) return { error: 'You’re done for this roll' };
    if (a?.type === 'bet') {
      const bet = a.bet as Bet;
      if (!BETS.includes(bet)) return { error: 'That isn’t a bet here' };
      const amount = Number(a.amount);
      const why = cantBet(s, seat, bet, amount);
      if (why) return { error: why };
      return { state: {
        ...s, chips: { ...s.chips, [seat]: s.chips[seat] - amount },
        bets: { ...s.bets, [seat]: { ...s.bets[seat], [bet]: s.bets[seat][bet] + amount } },
        fresh: { ...s.fresh, [seat]: { ...s.fresh[seat], [bet]: s.fresh[seat][bet] + amount } },
      } };
    }
    if (a?.type === 'clear') {
      const f = s.fresh[seat], b = s.bets[seat];
      return { state: {
        ...s, chips: { ...s.chips, [seat]: s.chips[seat] + total(f) },
        bets: { ...s.bets, [seat]: { pass: b.pass - f.pass, dontpass: b.dontpass - f.dontpass, odds: b.odds - f.odds, field: b.field - f.field } },
        fresh: { ...s.fresh, [seat]: none() },
      } };
    }
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

  view(s, _now, viewer): CrapsView {
    const { history: _h, ...rest } = s;
    return { ...rest, you: viewer && s.order.includes(viewer) ? viewer : null };
  },
}, { keys: ['bet', 'amount'] });
