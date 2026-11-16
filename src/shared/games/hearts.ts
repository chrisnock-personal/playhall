// Hearts (#38): the trick-avoiding card game for four, with a 52-card deck.
// Before each hand, pass three cards (left, right, across, then none, in
// turn). The 2 of clubs leads; follow suit if you can; the highest card of
// the suit led takes the trick. Each heart taken costs 1 point and the queen
// of spades 13, unless one player takes them all (shooting the moon), when
// everyone else gets 26. No hearts or queen of spades on the first trick, and
// hearts can't be led until one has been played. First to 100 ends it; the
// lowest score wins.

import type { GameResult, SeatId } from '../game';
import type { Card } from './blackjack';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose'];
const RANKS = '23456789TJQKA';
export const TARGET = 100;
export const rankOf = (c: Card) => RANKS.indexOf(c[0]);
export const suitOf = (c: Card) => c[1];
export const points = (c: Card) => (suitOf(c) === 'H' ? 1 : c === 'QS' ? 13 : 0);
/** Pass directions, in turn: left, right, across, none. */
export const PASSES = ['left', 'right', 'across', 'none'] as const;
export type Pass = (typeof PASSES)[number];

export interface HeartsState {
  order: SeatId[];
  /** The hand being played, from 1. */
  hand: number;
  phase: 'pass' | 'play';
  hands: Record<SeatId, Card[]>;
  /** The three cards each player has chosen to pass (pass phase). */
  passing: Record<SeatId, Card[] | null>;
  trick: { seat: SeatId; card: Card }[];
  /** Who leads the current trick (an index into order). */
  turn: number;
  /** Cards each player has taken this hand. */
  taken: Record<SeatId, Card[]>;
  broken: boolean;
  tricksPlayed: number;
  scores: Record<SeatId, number>;
  lastTrick: { cards: { seat: SeatId; card: Card }[]; winner: SeatId } | null;
  /** The last hand's points, for the score table. */
  lastHand: { points: Record<SeatId, number>; moon: SeatId | null } | null;
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface HeartsView {
  order: SeatId[];
  you: SeatId | null;
  hand: number;
  pass: Pass;
  phase: HeartsState['phase'];
  /** Your cards. */
  cards: Card[] | null;
  counts: Record<SeatId, number>;
  /** Who has chosen their three to pass (not which). */
  passed: SeatId[];
  yourPass: Card[] | null;
  trick: HeartsState['trick'];
  turn: SeatId | null;
  /** The cards you may play now. */
  legal: Card[];
  broken: boolean;
  handPoints: Record<SeatId, number>;
  scores: Record<SeatId, number>;
  lastTrick: HeartsState['lastTrick'];
  lastHand: HeartsState['lastHand'];
  log: HeartsState['log'];
  result: GameResult | null;
}

const passOf = (hand: number): Pass => PASSES[(hand - 1) % 4];
const sorted = (cards: Card[]) => [...cards].sort((a, b) => 'CDSH'.indexOf(suitOf(a)) - 'CDSH'.indexOf(suitOf(b)) || rankOf(a) - rankOf(b));
const log = (s: HeartsState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-40);
const SUIT_WORD: Record<string, string> = { C: 'clubs', D: 'diamonds', S: 'spades', H: 'hearts' };
const RANK_WORD: Record<string, string> = { T: '10', J: 'jack', Q: 'queen', K: 'king', A: 'ace' };
export const cardWords = (c: Card) => `the ${RANK_WORD[c[0]] ?? c[0]} of ${SUIT_WORD[c[1]]}`;

function deal(s: Omit<HeartsState, 'hands' | 'passing' | 'phase' | 'turn' | 'taken' | 'trick' | 'broken' | 'tricksPlayed'>, random: () => number): HeartsState {
  const deck: Card[] = [];
  for (const su of 'SHDC') for (const r of RANKS) deck.push(r + su);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = Object.fromEntries(s.order.map((p, i) => [p, sorted(deck.slice(i * 13, i * 13 + 13))]));
  const base: HeartsState = {
    ...s, hands, phase: 'pass', passing: Object.fromEntries(s.order.map((p) => [p, null])), trick: [], turn: 0,
    taken: Object.fromEntries(s.order.map((p) => [p, []])), broken: false, tricksPlayed: 0,
  };
  return passOf(s.hand) === 'none' ? startPlay(base) : base;
}

function startPlay(s: HeartsState): HeartsState {
  const first = s.order.findIndex((p) => s.hands[p].includes('2C'));
  return { ...s, phase: 'play', turn: first, trick: [] };
}

/** Where `seat` passes to this hand. */
export function passTarget(order: SeatId[], seat: SeatId, pass: Pass): SeatId {
  const i = order.indexOf(seat);
  const k = pass === 'left' ? 1 : pass === 'right' ? 3 : pass === 'across' ? 2 : 0;
  return order[(i + k) % order.length];
}

/** The cards `seat` may play now. */
export function legalPlays(s: { hands: Record<SeatId, Card[]>; trick: HeartsState['trick']; broken: boolean; tricksPlayed: number }, seat: SeatId): Card[] {
  const hand = s.hands[seat];
  const first = s.tricksPlayed === 0;
  if (!s.trick.length) {
    if (first) return hand.includes('2C') ? ['2C'] : hand;
    const nonHearts = hand.filter((c) => suitOf(c) !== 'H');
    return s.broken || !nonHearts.length ? hand : nonHearts;
  }
  const led = suitOf(s.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) return follow;
  if (first) {
    const clean = hand.filter((c) => !points(c));
    return clean.length ? clean : hand;
  }
  return hand;
}

function endHand(s: HeartsState): HeartsState {
  const pts = Object.fromEntries(s.order.map((p) => [p, s.taken[p].reduce((n, c) => n + points(c), 0)]));
  const moon = s.order.find((p) => pts[p] === 26) ?? null;
  const add = moon ? Object.fromEntries(s.order.map((p) => [p, p === moon ? 0 : 26])) : pts;
  const scores = Object.fromEntries(s.order.map((p) => [p, s.scores[p] + add[p]]));
  let next: HeartsState = { ...s, scores, lastHand: { points: add, moon } };
  next = { ...next, log: log(next, moon ?? s.order[0], moon ? 'shot the moon! Everyone else takes 26' : `Hand ${s.hand}: ${s.order.map((p) => `${add[p]}`).join(' / ')}`) };
  if (Object.values(scores).some((v) => v >= TARGET)) {
    const distinct = [...new Set(Object.values(scores))].sort((a, b) => a - b);
    const placings = distinct.map((v) => s.order.filter((p) => scores[p] === v));
    return { ...next, result: { winner: placings[0].length === 1 ? placings[0][0] : null, placings, reason: `the lowest score when someone reached ${TARGET}` } };
  }
  return next;
}

function play(s: HeartsState, seat: SeatId, card: Card, random: () => number): HeartsState {
  const hands = { ...s.hands, [seat]: s.hands[seat].filter((c) => c !== card) };
  const trick = [...s.trick, { seat, card }];
  let next: HeartsState = { ...s, hands, trick, broken: s.broken || suitOf(card) === 'H' };
  if (trick.length < s.order.length) return { ...next, turn: (s.turn + 1) % s.order.length };
  const led = suitOf(trick[0].card);
  const win = trick.filter((t) => suitOf(t.card) === led).reduce((a, b) => (rankOf(b.card) > rankOf(a.card) ? b : a));
  const got = trick.map((t) => t.card);
  const pts = got.reduce((n, c) => n + points(c), 0);
  next = {
    ...next, trick: [], tricksPlayed: s.tricksPlayed + 1, turn: s.order.indexOf(win.seat),
    taken: { ...next.taken, [win.seat]: [...next.taken[win.seat], ...got] },
    lastTrick: { cards: trick, winner: win.seat },
    log: log(next, win.seat, `took the trick${pts ? ` (${pts} point${pts === 1 ? '' : 's'}${got.includes('QS') ? ', with the queen of spades' : ''})` : ''}`),
  };
  if (next.tricksPlayed < 13) return next;
  const ended = endHand(next);
  return ended.result ? ended : deal({ ...ended, hand: s.hand + 1 }, random);
}

export const hearts = withHistory<HeartsState, Record<string, never>>({
  id: 'hearts',
  name: 'Hearts',
  description: 'Four players. Avoid taking hearts and the queen of spades, or take them all. Lowest score when someone reaches 100 wins.',
  howToPlay: {
    goal: 'Have the lowest score when someone reaches 100. Each heart you take costs 1 point; the queen of spades costs 13.',
    sections: [
      { title: 'Passing', points: [
        'Everyone gets 13 cards. Before each hand you pass three cards: to the left, then the right, then across, then no pass, in turn.',
        'Pass what you don’t want: high hearts, the queen, king and ace of spades.',
      ] },
      { title: 'Tricks', points: [
        'The 2 of clubs leads the first trick. Then whoever takes a trick leads the next.',
        'Follow the suit led if you can; if you can’t, play anything. The highest card of the suit led takes the trick.',
        'No hearts or queen of spades on the first trick (unless that’s all you have). Hearts can’t be led until one has been played on a trick, or you have nothing else.',
      ] },
      { title: 'Scoring', points: [
        'After 13 tricks, each heart you took costs 1 point and the queen of spades 13.',
        'Shooting the moon: take every heart and the queen of spades, and everyone else gets 26 instead.',
        'When someone reaches 100, the lowest score wins, and everyone is placed by score.',
        'If the room has a move timer and you run out of time, your three highest cards are passed, or your lowest card that can go is played.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => `To ${TARGET} points`,

  create(_c, _now, ctx) {
    return deal({ order: ctx.seats, hand: 1, scores: Object.fromEntries(ctx.seats.map((p) => [p, 0])), lastTrick: null, lastHand: null, log: [], result: null }, ctx.random);
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; cards?: string[]; card?: string };
    if (a?.type === 'resign') {
      // Four are needed: the game stops, the one who resigned last.
      const others = s.order.filter((p) => p !== seat);
      const distinct = [...new Set(others.map((p) => s.scores[p]))].sort((x, y) => x - y);
      const placings = [...distinct.map((v) => others.filter((p) => s.scores[p] === v)), [seat]];
      return { state: { ...s, result: { winner: placings[0].length === 1 ? placings[0][0] : null, placings, reason: 'resignation' } } };
    }
    if (s.phase === 'pass') {
      if (a?.type !== 'pass') return { error: 'Choose three cards to pass' };
      if (s.passing[seat]) return { error: 'You’ve passed already' };
      const cards = a.cards;
      if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3 || !cards.every((c) => s.hands[seat].includes(c))) return { error: 'Pick three of your cards' };
      const passing = { ...s.passing, [seat]: cards };
      if (s.order.some((p) => !passing[p])) return { state: { ...s, passing } };
      const pass = passOf(s.hand);
      const hands = Object.fromEntries(s.order.map((p) => [p, s.hands[p].filter((c) => !passing[p]!.includes(c))]));
      for (const p of s.order) hands[passTarget(s.order, p, pass)].push(...passing[p]!);
      for (const p of s.order) hands[p] = sorted(hands[p]);
      return { state: startPlay({ ...s, passing, hands, log: log(s, seat, `Cards passed ${pass}`) }) };
    }
    if (a?.type !== 'play') return { error: 'Play a card' };
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    const card = a.card as string;
    if (!s.hands[seat].includes(card)) return { error: 'You don’t have that card' };
    if (!legalPlays(s, seat).includes(card)) {
      if (s.trick.length && s.hands[seat].some((c) => suitOf(c) === suitOf(s.trick[0].card))) return { error: 'Follow the suit led' };
      if (s.tricksPlayed === 0 && !s.trick.length) return { error: 'The 2 of clubs leads the first trick' };
      if (s.tricksPlayed === 0) return { error: 'No points on the first trick' };
      return { error: 'Hearts aren’t broken yet' };
    }
    return { state: play(s, seat, card, ctx.random) };
  },

  turn: (s) => (s.result ? [] : s.phase === 'pass' ? s.order.filter((p) => !s.passing[p]) : [s.order[s.turn]]),
  timeout(s, seat, now, ctx) {
    const move = s.phase === 'pass'
      ? { type: 'pass', cards: [...s.hands[seat]].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 3) }
      : { type: 'play', card: [...legalPlays(s, seat)].sort((a, b) => rankOf(a) - rankOf(b))[0] };
    const r = this.act(s, seat, move, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): HeartsView {
    const seated = !!viewer && s.order.includes(viewer);
    return {
      order: s.order, you: seated ? viewer : null, hand: s.hand, pass: passOf(s.hand), phase: s.phase,
      cards: seated ? s.hands[viewer!] : null,
      counts: Object.fromEntries(s.order.map((p) => [p, s.hands[p].length])),
      passed: s.order.filter((p) => !!s.passing[p]),
      yourPass: seated && s.phase === 'pass' ? s.passing[viewer!] : null,
      trick: s.trick, turn: s.result || s.phase !== 'play' ? null : s.order[s.turn],
      legal: seated && s.phase === 'play' && s.order[s.turn] === viewer && !s.result ? legalPlays(s, viewer!) : [],
      broken: s.broken,
      handPoints: Object.fromEntries(s.order.map((p) => [p, s.taken[p].reduce((n, c) => n + points(c), 0)])),
      scores: s.scores, lastTrick: s.lastTrick, lastHand: s.lastHand, log: s.log, result: s.result,
    };
  },
}, { keys: ['cards', 'card'] });
