// Texas Hold'em, a sit-and-go for 2-4 players with play chips only (no real
// money, nothing to buy). Everyone starts with the same chips; the blinds
// double every few hands; whoever has every chip at the end wins, and the
// others are placed by when they went out. Standard rules: two private cards,
// five shared, four betting rounds, side pots for short stacks.

import type { GameResult, SeatId } from '../game';
import { randInt, withHistory, type GameHistory } from './history';
import type { Card } from './blackjack';

export const SEATS = ['amber', 'teal', 'violet', 'rose'];
export interface PokerConfig { startChips: number; blindEvery: number }
export type Street = 'preflop' | 'flop' | 'turn' | 'river';

// ---- hand ranking ------------------------------------------------------

const RANKS = '23456789TJQKA';
const CATEGORY = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

/** Rank five cards: [category, tie-breakers...], compared left to right. */
function rank5(cards: Card[]): number[] {
  const vals = cards.map((c) => RANKS.indexOf(c[0])).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join() === '12,3,2,1,0') straightHigh = 3; // A-2-3-4-5
  }
  const counts = uniq.map((v) => [vals.filter((x) => x === v).length, v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byCount = counts.map(([, v]) => v);
  if (straightHigh >= 0 && flush) return [8, straightHigh];
  if (counts[0][0] === 4) return [7, ...byCount];
  if (counts[0][0] === 3 && counts[1][0] === 2) return [6, ...byCount];
  if (flush) return [5, ...vals];
  if (straightHigh >= 0) return [4, straightHigh];
  if (counts[0][0] === 3) return [3, ...byCount];
  if (counts[0][0] === 2 && counts[1][0] === 2) return [2, ...byCount];
  if (counts[0][0] === 2) return [1, ...byCount];
  return [0, ...vals];
}

export function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) - (b[i] ?? -1);
  return 0;
}

/** The best five of up to seven cards. */
export function bestHand(cards: Card[]): { rank: number[]; name: string } {
  let best: number[] | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
    const r = rank5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    if (!best || compareRanks(r, best) > 0) best = r;
  }
  return { rank: best!, name: CATEGORY[best![0]] };
}

// ---- the game ----------------------------------------------------------

/** One shuffled 52-card deck (Hold'em uses a single deck). */
export function newDeck(random: () => number): Card[] {
  const cards: Card[] = [];
  for (const suit of 'SHDC') for (const r of RANKS) cards.push(r + suit);
  for (let i = cards.length - 1; i > 0; i--) { const j = randInt(random, i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

export interface PokerState {
  config: PokerConfig;
  order: SeatId[];
  chips: Record<SeatId, number>;
  dealer: number;
  hand: number;
  deck: Card[];
  hole: Record<SeatId, Card[]>;
  board: Card[];
  street: Street;
  /** Put in this betting round, and in the whole hand. */
  bet: Record<SeatId, number>;
  total: Record<SeatId, number>;
  folded: Record<SeatId, boolean>;
  /** Who still has to act in this round (since the last bet or raise). */
  pending: SeatId[];
  toAct: SeatId | null;
  currentBet: number;
  minRaise: number;
  /** Who has acted since the last full bet or raise this round. */
  acted?: SeatId[];
  /** Who may only call or fold: they had acted when a short all-in raised less than a full raise. */
  capped?: SeatId[];
  blinds: [number, number];
  /** Players knocked out, in the order they went (ties grouped). */
  out: SeatId[][];
  last: { winners: { seat: SeatId; amount: number; hand: string | null }[]; shown: Record<SeatId, Card[]>; board: Card[] } | null;
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
  /** For replays (see history.ts); missing in games saved before it. */
  history?: GameHistory;
}

export interface PokerView {
  order: SeatId[];
  chips: Record<SeatId, number>;
  dealer: SeatId;
  hand: number;
  blinds: [number, number];
  /** Your own hole cards; other players' only at a showdown (in `last`). */
  hole: Card[] | null;
  board: Card[];
  street: Street;
  bet: Record<SeatId, number>;
  pot: number;
  folded: Record<SeatId, boolean>;
  inHand: Record<SeatId, boolean>;
  toAct: SeatId | null;
  toCall: number;
  minRaiseTo: number;
  /** False when the player to act may only call or fold (after a short all-in). */
  canRaise: boolean;
  out: SeatId[];
  last: PokerState['last'];
  log: PokerState['log'];
  result: GameResult | null;
}

const live = (s: PokerState) => s.order.filter((p) => s.hole[p]?.length && !s.folded[p]);
const canAct = (s: PokerState) => live(s).filter((p) => s.chips[p] > 0);
const logIt = (s: PokerState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-30);

/** Seats after `from` (exclusive) in table order, from a list. */
function after(s: PokerState, from: SeatId, among: SeatId[]): SeatId[] {
  const i = s.order.indexOf(from);
  const ring = [...s.order.slice(i + 1), ...s.order.slice(0, i + 1)];
  return ring.filter((p) => among.includes(p));
}

function startHand(s: PokerState, random: () => number): PokerState {
  const players = s.order.filter((p) => s.chips[p] > 0);
  // Move the button to the next player with chips.
  let dealer = s.dealer;
  do { dealer = (dealer + 1) % s.order.length; } while (s.chips[s.order[dealer]] <= 0);
  const level = Math.floor((s.hand) / s.config.blindEvery);
  const bb = 20 * 2 ** level, sb = bb / 2;
  let deck = newDeck(random);
  const hole: Record<SeatId, Card[]> = Object.fromEntries(s.order.map((p) => [p, []]));
  for (let r = 0; r < 2; r++) for (const p of players) { hole[p].push(deck[0]); deck = deck.slice(1); }
  const base: PokerState = {
    ...s, dealer, hand: s.hand + 1, deck, hole, board: [], street: 'preflop', blinds: [sb, bb],
    bet: Object.fromEntries(s.order.map((p) => [p, 0])), total: Object.fromEntries(s.order.map((p) => [p, 0])),
    folded: Object.fromEntries(s.order.map((p) => [p, false])), currentBet: 0, minRaise: bb, pending: [], toAct: null, acted: [], capped: [],
  };
  const button = s.order[dealer];
  // Heads up, the button posts the small blind and acts first before the flop.
  const [sbSeat, bbSeat] = players.length === 2 ? [button, after(base, button, players)[0]] : after(base, button, players).slice(0, 2);
  let next = post(post(base, sbSeat, sb), bbSeat, bb);
  next = { ...next, currentBet: bb, minRaise: bb, log: logIt(next, button, `deals hand ${next.hand} (blinds ${sb}/${bb})`) };
  const order = after(next, bbSeat, players).filter((p) => next.chips[p] > 0);
  return advance({ ...next, pending: order, toAct: null }, random);
}

function post(s: PokerState, seat: SeatId, amount: number): PokerState {
  const pay = Math.min(amount, s.chips[seat]);
  return { ...s, chips: { ...s.chips, [seat]: s.chips[seat] - pay }, bet: { ...s.bet, [seat]: s.bet[seat] + pay }, total: { ...s.total, [seat]: s.total[seat] + pay } };
}

/** Whose turn next, or the next street, or the showdown. */
function advance(s: PokerState, random: () => number): PokerState {
  if (live(s).length === 1) return award(s, false, random);
  // The round goes on while someone still has to act: anyone who can, when
  // two or more can still bet, or a lone player who still owes chips.
  const actors = canAct(s);
  const pending = s.pending.filter((p) => actors.includes(p));
  if (pending.length && (actors.length > 1 || s.bet[pending[0]] < s.currentBet)) {
    return { ...s, pending, toAct: pending[0] };
  }
  // Betting round over: deal the next street (or run the board out if nobody can bet).
  const streets: Street[] = ['preflop', 'flop', 'turn', 'river'];
  const i = streets.indexOf(s.street);
  if (i === 3) return award(s, true, random);
  const n = i === 0 ? 3 : 1;
  const next: PokerState = {
    ...s, street: streets[i + 1], board: [...s.board, ...s.deck.slice(0, n)], deck: s.deck.slice(n),
    bet: Object.fromEntries(s.order.map((p) => [p, 0])), currentBet: 0, minRaise: s.blinds[1], acted: [], capped: [],
  };
  const nextActors = canAct(next);
  if (nextActors.length <= 1) return advance({ ...next, pending: [] }, random);
  return advance({ ...next, pending: after(next, next.order[next.dealer], nextActors) }, random);
}

/** Pay out the pot(s): to the last player in, or at a showdown. */
function award(s: PokerState, showdown: boolean, random: () => number): PokerState {
  let board = s.board, deck = s.deck;
  if (showdown && board.length < 5) { board = [...board, ...deck.slice(0, 5 - board.length)]; deck = deck.slice(5 - s.board.length); }
  const contenders = live(s);
  const chips = { ...s.chips };
  const won: Record<SeatId, number> = {};
  const names: Record<SeatId, string> = {};
  if (contenders.length === 1) {
    const pot = Object.values(s.total).reduce((a, b) => a + b, 0);
    chips[contenders[0]] += pot;
    won[contenders[0]] = pot;
  } else {
    const ranks = Object.fromEntries(contenders.map((p) => { const h = bestHand([...s.hole[p], ...board]); names[p] = h.name; return [p, h.rank]; }));
    // Side pots: each contribution level is a pot for those who reached it.
    const levels = [...new Set(Object.values(s.total).filter((v) => v > 0))].sort((a, b) => a - b);
    let prev = 0;
    for (const level of levels) {
      const size = s.order.reduce((sum, p) => sum + Math.max(0, Math.min(s.total[p], level) - prev), 0);
      // Nobody still in reached this level (someone left): it goes back to those who put it in.
      const reached = contenders.filter((p) => s.total[p] >= level);
      const eligible = reached.length ? reached : s.order.filter((p) => s.total[p] >= level);
      prev = level;
      if (!eligible.length || !size) continue;
      const ranked = eligible.filter((p) => ranks[p]);
      const best = ranked.length ? ranked.reduce((b, p) => (compareRanks(ranks[p], ranks[b]) > 0 ? p : b)) : null;
      const winners = best ? ranked.filter((p) => compareRanks(ranks[p], ranks[best]) === 0) : eligible;
      const share = Math.floor(size / winners.length);
      let odd = size - share * winners.length;
      for (const w of after(s, s.order[s.dealer], winners)) {
        const amt = share + (odd-- > 0 ? 1 : 0);
        chips[w] += amt;
        won[w] = (won[w] ?? 0) + amt;
      }
    }
  }
  const shown = showdown ? Object.fromEntries(contenders.map((p) => [p, s.hole[p]])) : {};
  const winners = Object.entries(won).map(([seat, amount]) => ({ seat, amount, hand: names[seat] ?? null }));
  let next: PokerState = {
    ...s, chips, board, deck, toAct: null, pending: [],
    last: { winners, shown, board },
    log: [...s.log, ...winners.map((w) => ({ seat: w.seat, text: `wins ${w.amount}${w.hand ? ` with ${w.hand.toLowerCase()}` : ''}` }))].slice(-30),
  };
  // Knock-outs: anyone left with nothing goes out now (together if more than one).
  const busted = s.order.filter((p) => chips[p] === 0 && !s.out.flat().includes(p) && s.hole[p]?.length);
  if (busted.length) next = { ...next, out: [...next.out, busted] };
  const remaining = s.order.filter((p) => chips[p] > 0);
  if (remaining.length <= 1) {
    const placings = [remaining, ...[...next.out].reverse()].filter((g) => g.length);
    return { ...next, total: Object.fromEntries(s.order.map((p) => [p, 0])), result: { winner: remaining[0] ?? null, reason: 'taking every chip', placings } };
  }
  return startHand({ ...next, total: Object.fromEntries(s.order.map((p) => [p, 0])) }, random);
}

function act(s: PokerState, seat: SeatId, kind: string, to: number | undefined, random: () => number): PokerState | string {
  const owe = s.currentBet - s.bet[seat];
  let next = s;
  let text = '';
  const acted = [...(s.acted ?? []).filter((p) => p !== seat), seat];
  const reopen = (raiseTo: number) => {
    // A bet or raise: everyone else still able to act must respond. A full
    // raise reopens the betting for all; a short all-in (less than a full
    // raise) doesn't: those who had already acted may only call or fold.
    const full = raiseTo - s.currentBet >= s.minRaise;
    next = {
      ...next, minRaise: Math.max(s.minRaise, raiseTo - s.currentBet), currentBet: raiseTo,
      pending: after(next, seat, canAct(next).filter((p) => p !== seat)),
      acted: full ? [seat] : acted,
      capped: full ? [] : [...new Set([...(s.capped ?? []), ...(s.acted ?? [])])].filter((p) => p !== seat),
    };
  };
  switch (kind) {
    case 'fold':
      next = { ...s, folded: { ...s.folded, [seat]: true } }; text = 'folds'; break;
    case 'check':
      if (owe > 0) return `You need to call ${owe} or fold`;
      text = 'checks'; break;
    case 'call': {
      if (owe <= 0) return 'Nothing to call: check instead';
      next = post(s, seat, owe); text = next.chips[seat] === 0 ? `calls ${s.chips[seat]} (all in)` : `calls ${owe}`; break;
    }
    case 'raise': case 'allin': {
      const max = s.bet[seat] + s.chips[seat];
      // All in for no more than the bet is a call (for less, if it's short).
      if (kind === 'allin' && max <= s.currentBet) {
        next = post(s, seat, s.chips[seat]);
        text = `calls ${s.chips[seat]} (all in)`;
        break;
      }
      if ((s.capped ?? []).includes(seat)) return 'A short all-in doesn’t reopen the betting: you can call or fold';
      const target = kind === 'allin' ? max : Math.floor(Number(to));
      const minTo = s.currentBet + s.minRaise;
      if (!(target > s.currentBet)) return `Raise to more than ${s.currentBet}`;
      if (target > max) return `You only have ${max}`;
      if (target < minTo && target < max) return `The smallest raise is to ${minTo}`;
      next = post(s, seat, target - s.bet[seat]);
      text = target === max ? `goes all in (${target})` : s.currentBet ? `raises to ${target}` : `bets ${target}`;
      if (target > s.currentBet) reopen(target);
      break;
    }
    default:
      return 'Unknown move';
  }
  const raised = next.currentBet > s.currentBet;
  const pending = raised ? next.pending : next.pending.filter((p) => p !== seat);
  return advance({ ...next, pending, acted: raised ? next.acted : acted, log: logIt(next, seat, text) }, random);
}

export const poker = withHistory<PokerState, PokerConfig>({
  id: 'poker',
  name: 'Texas Hold’em',
  description: '2-4 players, a sit-and-go with play chips. Rising blinds; the last player with chips wins.',
  howToPlay: {
    goal: 'Win every chip at the table. Each hand, win the pot with the best five-card poker hand, or by making everyone else fold.',
    sections: [
      { title: 'A hand', points: [
        'Everyone starts with the same play chips (no real money, nothing to buy). The two players after the dealer button put in the small and big blinds.',
        'You get two private cards. Five shared cards come in stages: three (the flop), one (the turn), one (the river), with a round of betting before each and after the last.',
        'On your turn: fold (give up the hand), check (if nobody has bet), call (match the bet), bet or raise, or go all in.',
        'Your hand is the best five cards from your two and the five shared ones.',
      ] },
      { title: 'Hands, best first', points: [
        'Straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.',
        'If you go all in and others keep betting, side pots are made: you can only win what you put in from each player.',
        'Equal hands split the pot.',
      ] },
      { title: 'The game', points: [
        'The blinds double every few hands (every 5 unless the host chose otherwise), so the game always comes to an end.',
        'Run out of chips and you’re out. The last player with chips wins; everyone else is placed by when they went out, and second place earns a point.',
        'Your cards are hidden from everyone, watchers included, until a showdown.',
        'If the room has a move timer and you run out of time, you check if you can, or fold.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: { startChips: 1500, blindEvery: 5 },
  parseConfig: (raw) => {
    const r = (raw ?? {}) as Partial<PokerConfig>;
    return {
      startChips: [1000, 1500, 3000].includes(Number(r.startChips)) ? Number(r.startChips) : 1500,
      blindEvery: [3, 5, 8].includes(Number(r.blindEvery)) ? Number(r.blindEvery) : 5,
    };
  },
  describeConfig: (c) => `${c.startChips.toLocaleString()} chips, blinds up every ${c.blindEvery} hands`,

  create(config, _now, ctx) {
    const base: PokerState = {
      config, order: ctx.seats, chips: Object.fromEntries(ctx.seats.map((p) => [p, config.startChips])), dealer: -1, hand: 0,
      deck: [], hole: {}, board: [], street: 'preflop', bet: {}, total: {}, folded: {}, pending: [], toAct: null,
      currentBet: 0, minRaise: 20, blinds: [10, 20], out: [], last: null, log: [], result: null,
    };
    return startHand({ ...base, dealer: randInt(ctx.random, ctx.seats.length) - 1 }, ctx.random);
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    const action = raw as { type?: string; to?: number };
    if (action?.type === 'resign') {
      // Resigning: you fold now and you're out of the game.
      const folded = { ...s.folded, [seat]: true };
      const chips = { ...s.chips, [seat]: 0 };
      const out = [...s.out, [seat]];
      const remaining = s.order.filter((p) => chips[p] > 0 || (s.total[p] > 0 && !folded[p]));
      if (remaining.length <= 1) {
        const w = s.order.filter((p) => p !== seat && !s.out.flat().includes(p));
        return { state: { ...s, chips, folded, out, result: { winner: w[0] ?? null, reason: 'everyone else leaving', placings: [w, ...[...out].reverse()] } } };
      }
      return { state: advance({ ...s, chips, folded, out, pending: s.pending.filter((p) => p !== seat) }, ctx.random) };
    }
    if (s.toAct !== seat) return { error: 'It isn’t your turn' };
    const r = act(s, seat, action?.type ?? '', action.to, ctx.random);
    return typeof r === 'string' ? { error: r } : { state: r };
  },

  turn: (s) => (s.result || !s.toAct ? [] : [s.toAct]),
  timeout(s, seat, _now, ctx) {
    const r = act(s, seat, s.currentBet - s.bet[seat] > 0 ? 'fold' : 'check', undefined, ctx.random);
    return typeof r === 'string' ? s : r;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): PokerView {
    const toCall = s.toAct ? Math.max(0, s.currentBet - s.bet[s.toAct]) : 0;
    return {
      order: s.order, chips: s.chips, dealer: s.order[s.dealer], hand: s.hand, blinds: s.blinds,
      hole: viewer && s.hole[viewer]?.length ? s.hole[viewer] : null,
      board: s.board, street: s.street, bet: s.bet,
      pot: Object.values(s.total).reduce((a, b) => a + b, 0),
      folded: s.folded, inHand: Object.fromEntries(s.order.map((p) => [p, !!s.hole[p]?.length && !s.folded[p]])),
      toAct: s.result ? null : s.toAct, toCall, minRaiseTo: s.currentBet + s.minRaise,
      canRaise: !!s.toAct && !(s.capped ?? []).includes(s.toAct),
      out: s.out.flat(), last: s.last, log: s.log.slice(-12), result: s.result,
    };
  },
}, { keys: ['to'] });
