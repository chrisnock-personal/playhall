// Spades (#39): the partnership trick-taking game for four, with a 52-card
// deck. Partners sit across (Amber with Violet, Teal with Rose). Each hand,
// everyone bids how many tricks they'll take, or nil (none at all); partners'
// bids add up to the pair's contract. Spades are always trumps and can't be
// led until one has been played. Make the contract: 10 a trick bid, 1 for each
// extra trick (a bag), and every 10 bags cost 100. Miss it: lose 10 a trick
// bid. Nil scores 100 if made, loses 100 if not. First pair to 500 wins.

import type { GameResult, SeatId } from '../game';
import type { Card } from './blackjack';
import { withHistory, type GameHistory } from './history';
import { cardWords } from './hearts';

export const SEATS = ['amber', 'teal', 'violet', 'rose'];
/** The two pairs: partners sit across from each other. */
export const PAIRS: [SeatId, SeatId][] = [['amber', 'violet'], ['teal', 'rose']];
const RANKS = '23456789TJQKA';
export const TARGET = 500;
export const rankOf = (c: Card) => RANKS.indexOf(c[0]);
export const suitOf = (c: Card) => c[1];

export interface SpadesState {
  order: SeatId[];
  /** The pairs actually playing (from the seats taken). */
  pairs: [SeatId, SeatId][];
  hand: number;
  /** Who dealt this hand (an index into order); the one after bids and leads first. */
  dealer: number;
  phase: 'bid' | 'play';
  hands: Record<SeatId, Card[]>;
  /** Each player's bid this hand: tricks, 0 for nil, null until they bid. */
  bids: Record<SeatId, number | null>;
  tricks: Record<SeatId, number>;
  trick: { seat: SeatId; card: Card }[];
  /** Whose turn it is (an index into order), to bid or to play. */
  turn: number;
  broken: boolean;
  tricksPlayed: number;
  /** Points and bags for each pair, by the pair's first seat. */
  scores: Record<SeatId, number>;
  bags: Record<SeatId, number>;
  lastTrick: { cards: { seat: SeatId; card: Card }[]; winner: SeatId } | null;
  /** The last hand's points for each pair, with what happened, for the score table. */
  lastHand: { points: Record<SeatId, number>; notes: Record<SeatId, string> } | null;
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface SpadesView {
  order: SeatId[];
  pairs: [SeatId, SeatId][];
  you: SeatId | null;
  partner: SeatId | null;
  hand: number;
  dealer: SeatId;
  phase: SpadesState['phase'];
  cards: Card[] | null;
  counts: Record<SeatId, number>;
  bids: SpadesState['bids'];
  tricks: SpadesState['tricks'];
  trick: SpadesState['trick'];
  turn: SeatId | null;
  legal: Card[];
  broken: boolean;
  scores: SpadesState['scores'];
  bags: SpadesState['bags'];
  lastTrick: SpadesState['lastTrick'];
  lastHand: SpadesState['lastHand'];
  log: SpadesState['log'];
  result: GameResult | null;
}

const sorted = (cards: Card[]) => [...cards].sort((a, b) => 'CDHS'.indexOf(suitOf(a)) - 'CDHS'.indexOf(suitOf(b)) || rankOf(a) - rankOf(b));
const log = (s: SpadesState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-40);
export const pairOf = (pairs: [SeatId, SeatId][], seat: SeatId) => pairs.find((p) => p.includes(seat))!;
export const partnerOf = (pairs: [SeatId, SeatId][], seat: SeatId) => pairOf(pairs, seat).find((p) => p !== seat)!;
/** The pair's key in scores and bags: its first seat. */
export const pairKey = (pairs: [SeatId, SeatId][], seat: SeatId) => pairOf(pairs, seat)[0];
export const bidWords = (b: number) => (b === 0 ? 'nil' : `${b}`);

type Base = Pick<SpadesState, 'order' | 'pairs' | 'hand' | 'dealer' | 'scores' | 'bags' | 'lastTrick' | 'lastHand' | 'log' | 'result' | 'history'>;
function deal(s: Base, random: () => number): SpadesState {
  const deck: Card[] = [];
  for (const su of 'SHDC') for (const r of RANKS) deck.push(r + su);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const none = <T,>(v: T) => Object.fromEntries(s.order.map((p) => [p, v])) as Record<SeatId, T>;
  return {
    ...s, phase: 'bid', hands: Object.fromEntries(s.order.map((p, i) => [p, sorted(deck.slice(i * 13, i * 13 + 13))])),
    bids: none<number | null>(null), tricks: none(0), trick: [], turn: (s.dealer + 1) % s.order.length, broken: false, tricksPlayed: 0,
  };
}

/** The cards `seat` may play now. */
export function legalPlays(s: { hands: Record<SeatId, Card[]>; trick: SpadesState['trick']; broken: boolean }, seat: SeatId): Card[] {
  const hand = s.hands[seat];
  if (!s.trick.length) {
    const others = hand.filter((c) => suitOf(c) !== 'S');
    return s.broken || !others.length ? hand : others;
  }
  const follow = hand.filter((c) => suitOf(c) === suitOf(s.trick[0].card));
  return follow.length ? follow : hand;
}

/** Who takes a trick: the highest spade, or else the highest card of the suit led. */
export function trickWinner(trick: SpadesState['trick']): SeatId {
  const spades = trick.filter((t) => suitOf(t.card) === 'S');
  const pool = spades.length ? spades : trick.filter((t) => suitOf(t.card) === suitOf(trick[0].card));
  return pool.reduce((a, b) => (rankOf(b.card) > rankOf(a.card) ? b : a)).seat;
}

/** One pair's score for a hand: points, bags taken and words for the log. */
export function scorePair(bids: [number, number], tricks: [number, number]): { points: number; bags: number; note: string } {
  let points = 0, bags = 0;
  const notes: string[] = [];
  const contract = bids.reduce((n, b) => n + b, 0);
  const counted = bids.reduce((n, b, i) => n + (b ? tricks[i] : 0), 0);
  bids.forEach((b, i) => {
    if (b !== 0) return;
    if (tricks[i] === 0) { points += 100; notes.push('nil made +100'); }
    else { points -= 100; bags += tricks[i]; notes.push('nil broken −100'); }
  });
  if (contract > 0) {
    if (counted >= contract) {
      points += contract * 10 + (counted - contract);
      bags += counted - contract;
      notes.push(`made ${contract}${counted > contract ? ` with ${counted - contract} bag${counted - contract === 1 ? '' : 's'}` : ''}`);
    } else {
      points -= contract * 10;
      notes.push(`set: ${counted} of ${contract}`);
    }
  }
  return { points, bags, note: notes.join(', ') };
}

function endHand(s: SpadesState, random: () => number): SpadesState {
  const scores = { ...s.scores }, bags = { ...s.bags }, pts: Record<SeatId, number> = {}, notes: Record<SeatId, string> = {};
  for (const pair of s.pairs) {
    const k = pair[0];
    const r = scorePair([s.bids[pair[0]] ?? 0, s.bids[pair[1]] ?? 0], [s.tricks[pair[0]], s.tricks[pair[1]]]);
    let p = r.points;
    bags[k] += r.bags;
    while (bags[k] >= 10) { p -= 100; bags[k] -= 10; r.note += ', 10 bags −100'; }
    scores[k] += p; pts[k] = p; notes[k] = r.note;
  }
  let next: SpadesState = { ...s, scores, bags, lastHand: { points: pts, notes } };
  next = { ...next, log: log(next, s.pairs[0][0], `Hand ${s.hand}: ${s.pairs.map((p) => `${pts[p[0]] >= 0 ? '+' : ''}${pts[p[0]]}`).join(' / ')}`) };
  const keys = s.pairs.map((p) => p[0]);
  const best = Math.max(...keys.map((k) => scores[k]));
  const leaders = keys.filter((k) => scores[k] === best);
  if (best >= TARGET && leaders.length === 1) {
    const win = pairOf(s.pairs, leaders[0]);
    const lose = s.pairs.filter((p) => p !== win).flat();
    return { ...next, result: { winner: null, placings: [[...win], lose], reason: `the first pair to ${TARGET}`, teamWin: true } };
  }
  return deal({ ...next, hand: s.hand + 1, dealer: (s.dealer + 1) % s.order.length }, random);
}

function play(s: SpadesState, seat: SeatId, card: Card, random: () => number): SpadesState {
  const hands = { ...s.hands, [seat]: s.hands[seat].filter((c) => c !== card) };
  const trick = [...s.trick, { seat, card }];
  const next: SpadesState = { ...s, hands, trick, broken: s.broken || suitOf(card) === 'S' };
  if (trick.length < s.order.length) return { ...next, turn: (s.turn + 1) % s.order.length };
  const win = trickWinner(trick);
  const done: SpadesState = {
    ...next, trick: [], tricksPlayed: s.tricksPlayed + 1, turn: s.order.indexOf(win),
    tricks: { ...s.tricks, [win]: s.tricks[win] + 1 }, lastTrick: { cards: trick, winner: win },
  };
  return done.tricksPlayed < 13 ? done : endHand(done, random);
}

/** A sensible bid for a hand: aces, guarded kings, and spades beyond three. */
export function estimateBid(cards: Card[]): number {
  let n = 0;
  for (const su of 'CDHS') {
    const suit = cards.filter((c) => suitOf(c) === su);
    if (su === 'S') { n += suit.filter((c) => rankOf(c) >= rankOf('QS')).length + Math.max(0, suit.length - 3 - suit.filter((c) => rankOf(c) >= rankOf('QS')).length); continue; }
    if (suit.some((c) => c[0] === 'A')) n += 1;
    if (suit.some((c) => c[0] === 'K') && suit.length >= 2) n += 1;
  }
  return Math.max(1, Math.min(13, n));
}

export const spades = withHistory<SpadesState, Record<string, never>>({
  id: 'spades',
  name: 'Spades',
  description: 'Four players in two pairs. Bid your tricks, spades are trumps, make your contract. First pair to 500 wins.',
  howToPlay: {
    goal: 'With your partner (sitting across from you), be the first pair to 500 points by making the tricks you bid.',
    sections: [
      { title: 'Bidding', points: [
        'Everyone gets 13 cards. Starting after the dealer, each player bids how many tricks they think they’ll take.',
        'You and your partner’s bids add up to your pair’s contract.',
        'Or bid nil: you promise to take no tricks at all. Your partner’s bid is then the pair’s contract on its own.',
      ] },
      { title: 'Tricks', points: [
        'The player after the dealer leads first; whoever takes a trick leads the next.',
        'Follow the suit led if you can; if you can’t, play anything, including a spade.',
        'Spades are always trumps: the highest spade takes the trick, or else the highest card of the suit led.',
        'Spades can’t be led until one has been played on a trick (or you have nothing else).',
      ] },
      { title: 'Scoring', points: [
        'Make your contract: 10 points for each trick bid, and 1 for each extra trick (a bag).',
        'Every 10 bags your pair collects costs 100 points, so don’t take too many more than you bid.',
        'Miss your contract (you’re set): lose 10 points for each trick bid.',
        'Nil: 100 points if you take no tricks, lose 100 if you take any.',
        'The first pair to 500 wins, and both partners score the win. If both pairs pass 500, the higher score wins.',
        'If the room has a move timer and you run out of time, a bid is made for you from your cards, or your lowest card that can go is played.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => `Pairs, to ${TARGET} points`,

  create(_c, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    const pairs = PAIRS.filter((p) => p.every((x) => order.includes(x)));
    const zero = Object.fromEntries(pairs.map((p) => [p[0], 0]));
    return deal({ order, pairs, hand: 1, dealer: 0, scores: zero, bags: { ...zero }, lastTrick: null, lastHand: null, log: [], result: null }, ctx.random);
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; bid?: number; card?: string };
    if (a?.type === 'resign') {
      const lose = pairOf(s.pairs, seat);
      const win = s.pairs.filter((p) => p !== lose).flat();
      return { state: { ...s, result: { winner: null, placings: [win, [...lose]], reason: 'resignation', teamWin: true } } };
    }
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    if (s.phase === 'bid') {
      if (a?.type !== 'bid') return { error: 'Make your bid' };
      const bid = a.bid;
      if (typeof bid !== 'number' || !Number.isInteger(bid) || bid < 0 || bid > 13) return { error: 'Bid from nil to 13' };
      const bids = { ...s.bids, [seat]: bid };
      const next: SpadesState = { ...s, bids, log: log(s, seat, `bid ${bidWords(bid)}`) };
      if (s.order.some((p) => bids[p] === null)) return { state: { ...next, turn: (s.turn + 1) % s.order.length } };
      return { state: { ...next, phase: 'play', turn: (s.dealer + 1) % s.order.length } };
    }
    if (a?.type !== 'play') return { error: 'Play a card' };
    const card = a.card as string;
    if (!s.hands[seat].includes(card)) return { error: 'You don’t have that card' };
    if (!legalPlays(s, seat).includes(card)) {
      if (s.trick.length) return { error: 'Follow the suit led' };
      return { error: 'Spades aren’t broken yet' };
    }
    return { state: play(s, seat, card, ctx.random) };
  },

  turn: (s) => (s.result ? [] : [s.order[s.turn]]),
  timeout(s, seat, now, ctx) {
    const move = s.phase === 'bid'
      ? { type: 'bid', bid: estimateBid(s.hands[seat]) }
      : { type: 'play', card: [...legalPlays(s, seat)].sort((a, b) => rankOf(a) - rankOf(b))[0] };
    const r = this.act(s, seat, move, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): SpadesView {
    const seated = !!viewer && s.order.includes(viewer);
    const turn = s.result ? null : s.order[s.turn];
    return {
      order: s.order, pairs: s.pairs, you: seated ? viewer : null, partner: seated ? partnerOf(s.pairs, viewer!) : null,
      hand: s.hand, dealer: s.order[s.dealer], phase: s.phase,
      cards: seated ? s.hands[viewer!] : null,
      counts: Object.fromEntries(s.order.map((p) => [p, s.hands[p].length])),
      bids: s.bids, tricks: s.tricks, trick: s.trick, turn,
      legal: seated && s.phase === 'play' && turn === viewer ? legalPlays(s, viewer!) : [],
      broken: s.broken, scores: s.scores, bags: s.bags, lastTrick: s.lastTrick, lastHand: s.lastHand, log: s.log, result: s.result,
    };
  },
}, { keys: ['card', 'bid'] });

export { cardWords };
