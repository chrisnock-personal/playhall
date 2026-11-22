// Thirty-One (#42), also called Scat: 2-8 players, a 52-card deck, three
// lives each. Three cards each; on your turn take the top of the deck or the
// discard, then throw one away, aiming for the highest total in one suit
// (aces 11, court cards 10; three of a kind counts 30½). Knock instead of
// drawing when you think you're ahead: everyone else has one more turn, then
// the lowest hand loses a life. Get 31 and everyone else loses a life at once.
// Run out of lives and you're out; the last player left wins.

import type { GameResult, SeatId } from '../game';
import type { Card } from './blackjack';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue', 'red', 'slate'];
export const LIVES = 3;
const RANKS = '23456789TJQKA';
export const rankOf = (c: Card) => RANKS.indexOf(c[0]);
export const suitOf = (c: Card) => c[1];
export const cardValue = (c: Card) => (c[0] === 'A' ? 11 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0]));

/** A hand's score: the best total in one suit, or 30.5 for three of a kind. */
export function handScore(cards: Card[]): number {
  if (cards.length === 3 && cards.every((c) => c[0] === cards[0][0])) return 30.5;
  let best = 0;
  for (const su of 'SHDC') best = Math.max(best, cards.filter((c) => suitOf(c) === su).reduce((n, c) => n + cardValue(c), 0));
  return best;
}
export const scoreWords = (n: number) => (n === 30.5 ? '30½' : `${n}`);

export interface ThirtyOneState {
  order: SeatId[];
  lives: Record<SeatId, number>;
  /** Players out of the game, in the order they went out (ties together). */
  out: SeatId[][];
  round: number;
  dealer: SeatId;
  phase: 'draw' | 'discard';
  hands: Record<SeatId, Card[]>;
  deck: Card[];
  discard: Card[];
  turn: SeatId;
  /** The card just taken from the discard pile, which can't go straight back. */
  took: Card | null;
  /** Turns taken this round (no knocking on the very first). */
  turns: number;
  knocker: SeatId | null;
  /** Who still has their last turn after a knock. */
  lastTurns: SeatId[];
  /** The last round's showdown, for everyone to see. */
  lastRound: { hands: Record<SeatId, Card[]>; scores: Record<SeatId, number>; losers: SeatId[]; why: string } | null;
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface ThirtyOneView {
  order: SeatId[];
  you: SeatId | null;
  lives: Record<SeatId, number>;
  out: SeatId[][];
  round: number;
  dealer: SeatId;
  phase: ThirtyOneState['phase'];
  cards: Card[] | null;
  yourScore: number | null;
  counts: Record<SeatId, number>;
  deckCount: number;
  discardTop: Card | null;
  turn: SeatId | null;
  took: Card | null;
  canKnock: boolean;
  knocker: SeatId | null;
  lastTurns: SeatId[];
  lastRound: ThirtyOneState['lastRound'];
  log: ThirtyOneState['log'];
  result: GameResult | null;
}

const log = (s: ThirtyOneState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-40);
export const alive = (s: { order: SeatId[]; lives: Record<SeatId, number> }) => s.order.filter((p) => s.lives[p] > 0);
const nextAlive = (s: ThirtyOneState, from: SeatId) => {
  const live = alive(s);
  const i = s.order.indexOf(from);
  for (let k = 1; k <= s.order.length; k++) { const p = s.order[(i + k) % s.order.length]; if (live.includes(p)) return p; }
  return from;
};

function shuffled(random: () => number): Card[] {
  const deck: Card[] = [];
  for (const su of 'SHDC') for (const r of RANKS) deck.push(r + su);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function deal(s: ThirtyOneState, random: () => number): ThirtyOneState {
  const deck = shuffled(random);
  const hands: Record<SeatId, Card[]> = Object.fromEntries(s.order.map((p) => [p, []]));
  for (const p of alive(s)) hands[p] = deck.splice(0, 3);
  const next: ThirtyOneState = {
    ...s, phase: 'draw', hands, discard: [deck.shift()!], deck, turn: nextAlive(s, s.dealer), took: null, turns: 0, knocker: null, lastTurns: [],
  };
  // Dealt 31: it counts at once.
  const blitz = alive(next).find((p) => handScore(hands[p]) === 31);
  return blitz ? endRound(next, random, blitz) : next;
}

/** End the round: on a 31 (`blitz`) everyone else loses a life, else the lowest hand does. */
function endRound(s: ThirtyOneState, random: () => number, blitz?: SeatId): ThirtyOneState {
  const live = alive(s);
  const scores = Object.fromEntries(live.map((p) => [p, handScore(s.hands[p])]));
  const low = Math.min(...live.map((p) => scores[p]));
  const losers = blitz ? live.filter((p) => p !== blitz) : live.filter((p) => scores[p] === low);
  const lives = { ...s.lives };
  for (const p of losers) lives[p] -= 1;
  const gone = losers.filter((p) => lives[p] === 0);
  const why = blitz ? `31! Everyone else loses a life` : `Lowest hand (${scoreWords(low)}) loses a life`;
  let next: ThirtyOneState = {
    ...s, lives, out: gone.length ? [...s.out, gone] : s.out,
    lastRound: { hands: Object.fromEntries(live.map((p) => [p, s.hands[p]])), scores, losers, why },
  };
  next = { ...next, log: log(next, blitz ?? losers[0], blitz ? 'got 31! Everyone else loses a life' : `${losers.length > 1 ? 'tied lowest' : 'had the lowest hand'} (${scoreWords(low)}) and loses a life`) };
  const left = alive(next);
  if (left.length <= 1) {
    // The last one standing wins; if everyone left went out together, they share first.
    const placings = left.length ? [left, ...[...next.out].reverse()] : [...next.out].reverse();
    const winner = placings[0].length === 1 ? placings[0][0] : null;
    return { ...next, result: { winner, placings, reason: left.length ? 'the last player with lives left' : 'the last players went out together' } };
  }
  return deal({ ...next, round: s.round + 1, dealer: nextAlive(next, s.dealer) }, random);
}

/** After a player's turn ends: the next player, or the showdown after a knock. */
function passTurn(s: ThirtyOneState, random: () => number): ThirtyOneState {
  if (s.knocker) {
    const lastTurns = s.lastTurns.filter((p) => p !== s.turn);
    if (!lastTurns.length) return endRound({ ...s, lastTurns }, random);
    return { ...s, lastTurns, turn: lastTurns[0], phase: 'draw', took: null, turns: s.turns + 1 };
  }
  return { ...s, turn: nextAlive(s, s.turn), phase: 'draw', took: null, turns: s.turns + 1 };
}

export const thirtyOne = withHistory<ThirtyOneState, Record<string, never>>({
  id: 'thirtyone',
  name: 'Thirty-One',
  description: '2-8 players, three lives each. Collect the highest total in one suit, knock when you’re ahead, and don’t be lowest.',
  howToPlay: {
    goal: 'Be the last player with lives left. Each round, don’t have the lowest hand.',
    sections: [
      { title: 'Your hand', points: [
        'You have three cards. Your score is the total of your cards in one suit: aces are 11, kings, queens, jacks and 10s are 10, the rest their number.',
        'Three of a kind counts 30½. The best hand is 31: an ace and two 10-point cards of one suit.',
      ] },
      { title: 'Your turn', points: [
        'Take the top card of the deck or of the discard pile, then throw one card away. You can’t throw back the card you just took from the discard pile.',
        'Or knock instead of taking a card, if you think you’re ahead (not on the round’s very first turn). Everyone else has one more turn, then everyone shows their hand.',
      ] },
      { title: 'Losing lives', points: [
        'After a knock, the lowest hand loses a life. If players tie for lowest, they all do.',
        'If you get 31 at any point, show it: everyone else loses a life at once.',
        'Everyone starts with three lives. With none left you’re out; the last player left wins, and everyone else is placed by when they went out.',
        'If the room has a move timer and you run out of time, you take from the deck and throw away your least useful card.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => `${LIVES} lives each`,

  create(_c, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    const s: ThirtyOneState = {
      order, lives: Object.fromEntries(order.map((p) => [p, LIVES])), out: [], round: 1, dealer: order[order.length - 1],
      phase: 'draw', hands: {}, deck: [], discard: [], turn: order[0], took: null, turns: 0, knocker: null, lastTurns: [],
      lastRound: null, log: [], result: null,
    };
    return deal(s, ctx.random);
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!alive(s).includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; from?: string; card?: string };
    if (a?.type === 'resign') {
      const lives = { ...s.lives, [seat]: 0 };
      const next: ThirtyOneState = { ...s, lives, out: [...s.out, [seat]], log: log(s, seat, 'resigned') };
      const left = alive(next);
      if (left.length <= 1) return { state: { ...next, result: { winner: left[0] ?? null, placings: [left, ...[...next.out].reverse()].filter((g) => g.length), reason: 'resignation' } } };
      // The round can't go on fairly without them: deal a fresh one.
      return { state: deal({ ...next, round: s.round + 1, dealer: nextAlive(next, s.dealer) }, ctx.random) };
    }
    if (s.turn !== seat) return { error: 'It isn’t your turn' };
    if (s.phase === 'draw') {
      if (a?.type === 'knock') {
        if (s.knocker) return { error: 'Someone has knocked already' };
        if (s.turns === 0) return { error: 'You can’t knock on the round’s first turn' };
        const live = alive(s);
        const i = live.indexOf(seat);
        const lastTurns = [...live.slice(i + 1), ...live.slice(0, i)];
        return { state: passTurn({ ...s, knocker: seat, lastTurns: [seat, ...lastTurns], log: log(s, seat, 'knocked') }, ctx.random) };
      }
      if (a?.type !== 'draw' || (a.from !== 'deck' && a.from !== 'discard')) return { error: 'Take a card from the deck or the discard pile' };
      let deck = s.deck, discard = s.discard;
      let card: Card;
      if (a.from === 'discard') {
        if (!discard.length) return { error: 'The discard pile is empty' };
        card = discard[discard.length - 1];
        discard = discard.slice(0, -1);
      } else {
        if (!deck.length) {
          // Shuffle the discards (all but the top) back in.
          const top = discard[discard.length - 1];
          const rest = discard.slice(0, -1);
          for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(ctx.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
          deck = rest; discard = top ? [top] : [];
        }
        card = deck[0];
        deck = deck.slice(1);
      }
      return { state: { ...s, deck, discard, hands: { ...s.hands, [seat]: [...s.hands[seat], card] }, phase: 'discard', took: a.from === 'discard' ? card : null } };
    }
    if (a?.type !== 'discard') return { error: 'Throw one card away' };
    const card = a.card as string;
    if (!s.hands[seat].includes(card)) return { error: 'You don’t have that card' };
    if (card === s.took) return { error: 'You can’t throw back the card you just took' };
    const hand = s.hands[seat].filter((c) => c !== card);
    const next: ThirtyOneState = { ...s, hands: { ...s.hands, [seat]: hand }, discard: [...s.discard, card], took: null };
    if (handScore(hand) === 31) return { state: endRound(next, ctx.random, seat) };
    return { state: passTurn(next, ctx.random) };
  },

  turn: (s) => (s.result ? [] : [s.turn]),
  timeout(s, seat, now, ctx) {
    const move = s.phase === 'draw' ? { type: 'draw', from: 'deck' } : { type: 'discard', card: worstCard(s.hands[seat], s.took) };
    const r = this.act(s, seat, move, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): ThirtyOneView {
    const seated = !!viewer && alive(s).includes(viewer);
    return {
      order: s.order, you: viewer && s.order.includes(viewer) ? viewer : null, lives: s.lives, out: s.out, round: s.round, dealer: s.dealer, phase: s.phase,
      cards: seated ? s.hands[viewer!] : null, yourScore: seated ? handScore(s.hands[viewer!]) : null,
      counts: Object.fromEntries(s.order.map((p) => [p, s.hands[p]?.length ?? 0])),
      deckCount: s.deck.length, discardTop: s.discard[s.discard.length - 1] ?? null,
      turn: s.result ? null : s.turn, took: seated && s.turn === viewer ? s.took : null,
      canKnock: seated && s.turn === viewer && s.phase === 'draw' && !s.knocker && s.turns > 0,
      knocker: s.knocker, lastTurns: s.lastTurns, lastRound: s.lastRound, log: s.log, result: s.result,
    };
  },
}, { keys: ['from', 'card'] });

/** The card to throw away from four: the one whose loss leaves the best hand. */
export function worstCard(hand: Card[], took: Card | null): Card {
  const options = hand.filter((c) => c !== took);
  return options.reduce((best, c) => {
    const keep = handScore(hand.filter((x) => x !== c));
    const bestKeep = handScore(hand.filter((x) => x !== best));
    return keep > bestKeep || (keep === bestKeep && cardValue(c) < cardValue(best)) ? c : best;
  });
}
