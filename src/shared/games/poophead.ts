// Poophead (#36): the traditional shedding card game, also played as Palace,
// for 2-5 players with one 52-card deck. Each player has three cards face
// down, three face up on top of them and a hand of three. Play cards of one
// rank, equal to or higher than the top of the pile, and draw back up to
// three; can't play, pick up the pile. 2 resets the pile, 7 makes the next
// card 7 or lower, 10 burns the pile, and so do four of a kind. With hand and
// deck gone, play your face-up cards, then your face-down ones blind. The
// first out wins; the last left holding cards is the Poophead.

import type { GameResult, SeatId } from '../game';
import type { Card } from './blackjack';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime'];
const RANKS = '23456789TJQKA';
/** Ordinary order for "equal or higher": 3 lowest, ace highest; 2 and 10 are special. */
export const value = (c: Card) => RANKS.indexOf(c[0]);
export const rankOf = (c: Card) => c[0];
const RANK_WORD: Record<string, string> = { T: '10', J: 'jack', Q: 'queen', K: 'king', A: 'ace' };
export const rankName = (r: string) => RANK_WORD[r] ?? r;

export type Source = 'hand' | 'up' | 'down';

export interface PoopState {
  order: SeatId[];
  phase: 'swap' | 'play';
  deck: Card[];
  pile: Card[];
  burned: number;
  hand: Record<SeatId, Card[]>;
  up: Record<SeatId, Card[]>;
  down: Record<SeatId, Card[]>;
  ready: SeatId[];
  turn: number;
  /** Players out, in the order they went out. */
  out: SeatId[];
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface PoopView {
  order: SeatId[];
  phase: PoopState['phase'];
  you: SeatId | null;
  turn: SeatId | null;
  /** Your hand; everyone's hand size. */
  hand: Card[] | null;
  handCount: Record<SeatId, number>;
  up: Record<SeatId, Card[]>;
  downCount: Record<SeatId, number>;
  deckCount: number;
  pile: Card[];
  burned: number;
  ready: SeatId[];
  out: SeatId[];
  /** Where you play from now: hand, face-up or face-down. */
  from: Source | null;
  log: PoopState['log'];
  result: GameResult | null;
}

function newDeck(random: () => number): Card[] {
  const cards: Card[] = [];
  for (const s of 'SHDC') for (const r of RANKS) cards.push(r + s);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

/** The card that rules what can go on the pile (null: anything). */
function ruling(pile: Card[]): Card | null {
  const top = pile[pile.length - 1];
  return top && rankOf(top) !== '2' ? top : null;
}

/** Whether a card of this rank can go on the pile. */
export function canPlay(rank: string, pile: Card[]): boolean {
  if (rank === '2' || rank === 'T') return true;
  const top = ruling(pile);
  if (!top) return true;
  const v = RANKS.indexOf(rank);
  return rankOf(top) === '7' ? v <= value(top) : v >= value(top);
}

/** Where `seat` plays from now. */
export function sourceOf(s: { hand: Record<SeatId, Card[]>; up: Record<SeatId, Card[]>; down: Record<SeatId, Card[]> } | PoopState, seat: SeatId): Source | null {
  if (s.hand[seat].length) return 'hand';
  if (s.up[seat].length) return 'up';
  if (s.down[seat].length) return 'down';
  return null;
}

const playing = (s: PoopState) => s.order.filter((p) => !s.out.includes(p));
const log = (s: PoopState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-40);

function nextTurn(s: PoopState, from = s.turn): number {
  for (let k = 1; k <= s.order.length; k++) {
    const i = (from + k) % s.order.length;
    if (!s.out.includes(s.order[i])) return i;
  }
  return from;
}

/** After `seat` played: out if empty-handed, the game over if one is left. */
function settle(s: PoopState, seat: SeatId, again: boolean): PoopState {
  let next = s;
  if (!sourceOf(next, seat)) next = { ...next, out: [...next.out, seat], log: log(next, seat, 'is out!') };
  const left = playing(next);
  if (left.length <= 1) {
    const placings = [...next.out.map((p) => [p]), ...(left.length ? [left] : [])];
    return { ...next, result: { winner: next.out[0] ?? null, placings, reason: 'going out first' } };
  }
  // A burn: the same player goes again (unless they just went out).
  if (again && !next.out.includes(seat)) return next;
  return { ...next, turn: nextTurn(next) };
}

function pickUp(s: PoopState, seat: SeatId, extra: Card[] = []): PoopState {
  const taken = [...s.pile, ...extra];
  return { ...s, pile: [], hand: { ...s.hand, [seat]: [...s.hand[seat], ...taken] }, turn: nextTurn(s), log: log(s, seat, `picked up the pile (${taken.length} card${taken.length === 1 ? '' : 's'})`) };
}

/** Lay `cards` (one rank) from `from`; burn on a 10 or four of a kind. */
function lay(s: PoopState, seat: SeatId, cards: Card[], from: Source): PoopState {
  const remove = (xs: Card[]) => { const left = [...xs]; for (const c of cards) left.splice(left.indexOf(c), 1); return left; };
  let next: PoopState = { ...s, pile: [...s.pile, ...cards] };
  if (from === 'hand') next = { ...next, hand: { ...next.hand, [seat]: remove(next.hand[seat]) } };
  if (from === 'up') next = { ...next, up: { ...next.up, [seat]: remove(next.up[seat]) } };
  if (from === 'down') next = { ...next, down: { ...next.down, [seat]: remove(next.down[seat]) } };
  // Draw back up to three while the deck lasts.
  if (from === 'hand') {
    const need = Math.max(0, 3 - next.hand[seat].length);
    const drawn = next.deck.slice(0, need);
    next = { ...next, deck: next.deck.slice(need), hand: { ...next.hand, [seat]: [...next.hand[seat], ...drawn] } };
  }
  const r = rankOf(cards[0]);
  const top4 = next.pile.slice(-4);
  const burn = r === 'T' || (top4.length === 4 && top4.every((c) => rankOf(c) === r));
  const what = `${cards.length > 1 ? `${cards.length} ` : /^[a8]/.test(rankName(r)) ? 'an ' : 'a '}${rankName(r)}${cards.length > 1 ? 's' : ''}${from === 'down' ? ' (blind)' : ''}`;
  next = { ...next, log: log(next, seat, `played ${what}${burn ? ': burn!' : r === '2' ? ': the pile is reset' : r === '7' ? ': 7 or lower next' : ''}`) };
  if (burn) next = { ...next, burned: next.burned + next.pile.length, pile: [] };
  return settle(next, seat, burn);
}

export const poophead = withHistory<PoopState, Record<string, never>>({
  id: 'poophead',
  name: 'Poophead',
  description: '2-5 players. Get rid of your cards: hand, then face-up, then face-down blind. Don’t be the last one holding cards.',
  howToPlay: {
    goal: 'Get rid of all your cards. The last player still holding cards is the Poophead.',
    sections: [
      { title: 'The deal', points: [
        'Everyone gets three cards face down, three face up on top of them, and a hand of three.',
        'Before play starts, you can swap cards between your hand and your face-up cards: click a hand card, then the face-up card to swap it with. Press Ready when you’re happy.',
        'The player holding the lowest card starts.',
      ] },
      { title: 'A turn', points: [
        'Play one or more cards of the same rank that are equal to or higher than the top card of the pile (aces are high), then draw back up to three while the deck lasts.',
        'If you can’t play (or don’t want to), pick up the whole pile.',
        '2 can go on anything and resets the pile: anything can follow it. 7: the next card must be 7 or lower. 10 can go on anything and burns the pile, and so do four cards of the same rank in a row. After a burn you go again.',
      ] },
      { title: 'Face-up and face-down cards', points: [
        'Once the deck and your hand are gone, play your face-up cards.',
        'Then your face-down cards, blind: pick one and turn it over. If it can go on the pile it’s played; if not, you pick up the pile with it.',
        'The first player out wins. Everyone is placed in the order they went out, and the last one left is the Poophead.',
        'If the room has a move timer and you run out of time, your lowest card that can go is played for you (or you pick up the pile).',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'One deck, 2 burns',

  create(_c, _now, ctx) {
    let deck = newDeck(ctx.random);
    const take = (n: number) => { const c = deck.slice(0, n); deck = deck.slice(n); return c; };
    const down: Record<SeatId, Card[]> = {}, up: Record<SeatId, Card[]> = {}, hand: Record<SeatId, Card[]> = {};
    for (const p of ctx.seats) { down[p] = take(3); up[p] = take(3); hand[p] = take(3); }
    return { order: ctx.seats, phase: 'swap', deck, pile: [], burned: 0, hand, up, down, ready: [], turn: 0, out: [], log: [], result: null };
  },

  act(s, seat, raw) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; hand?: string; up?: string; cards?: string[]; index?: number };
    if (a?.type === 'resign') {
      const left = playing(s).filter((p) => p !== seat);
      const out = s.out;
      if (left.length <= 1) return { state: { ...s, result: { winner: out[0] ?? left[0] ?? null, placings: [...out.map((p) => [p]), ...left.map((p) => [p]), [seat]], reason: 'resignation' } } };
      const order = s.order.filter((p) => p !== seat);
      const current = s.order[s.turn];
      const turn = current === seat ? order.indexOf(s.order[nextTurn(s)]) : order.indexOf(current);
      return { state: { ...s, order, ready: s.ready.filter((p) => p !== seat), turn, log: log(s, seat, 'resigned') } };
    }
    if (s.phase === 'swap') {
      if (a?.type === 'swap') {
        if (s.ready.includes(seat)) return { error: 'You’re ready: no more swaps' };
        const hi = s.hand[seat].indexOf(a.hand as string), ui = s.up[seat].indexOf(a.up as string);
        if (hi < 0 || ui < 0) return { error: 'Pick a card from your hand and one of your face-up cards' };
        const hand = [...s.hand[seat]], up = [...s.up[seat]];
        [hand[hi], up[ui]] = [up[ui], hand[hi]];
        return { state: { ...s, hand: { ...s.hand, [seat]: hand }, up: { ...s.up, [seat]: up } } };
      }
      if (a?.type === 'ready') {
        if (s.ready.includes(seat)) return { error: 'You’re ready already' };
        const ready = [...s.ready, seat];
        if (ready.length < s.order.length) return { state: { ...s, ready } };
        // Everyone's ready: whoever holds the lowest ordinary card starts.
        const low = (p: SeatId) => Math.min(...s.hand[p].filter((c) => !'2T'.includes(c[0])).map(value), 99);
        const first = s.order.reduce((best, p, i) => (low(p) < low(s.order[best]) ? i : best), 0);
        return { state: { ...s, ready, phase: 'play', turn: first, log: log(s, s.order[first], 'starts, holding the lowest card') } };
      }
      return { error: 'Swap cards or press Ready first' };
    }
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    const from = sourceOf(s, seat);
    switch (a?.type) {
      case 'play': {
        const cards = a.cards;
        if (from === 'down') return { error: 'Turn over a face-down card' };
        if (!Array.isArray(cards) || !cards.length) return { error: 'Pick cards to play' };
        const have = [...(from === 'hand' ? s.hand[seat] : s.up[seat])];
        for (const c of cards) { const i = have.indexOf(c); if (i < 0) return { error: from === 'up' ? 'Play your face-up cards now' : 'You don’t have that card' }; have.splice(i, 1); }
        if (new Set(cards.map(rankOf)).size !== 1) return { error: 'Play cards of one rank' };
        if (!canPlay(rankOf(cards[0]), s.pile)) return { error: rankOf(s.pile[s.pile.length - 1] ?? '') === '7' ? 'After a 7, play 7 or lower' : 'Play equal or higher than the top card' };
        return { state: lay(s, seat, cards, from!) };
      }
      case 'blind': {
        if (from !== 'down') return { error: 'You still have cards to play first' };
        const i = a.index as number;
        if (!Number.isInteger(i) || i < 0 || i >= s.down[seat].length) return { error: 'Pick a face-down card' };
        const card = s.down[seat][i];
        if (canPlay(rankOf(card), s.pile)) return { state: lay(s, seat, [card], 'down') };
        const down = s.down[seat].filter((_, k) => k !== i);
        const flipped = { ...s, down: { ...s.down, [seat]: down }, log: log(s, seat, `turned over ${/^[a8]/.test(rankName(rankOf(card))) ? 'an' : 'a'} ${rankName(rankOf(card))}: no good`) };
        return { state: pickUp(flipped, seat, [card]) };
      }
      case 'pickup':
        if (!s.pile.length) return { error: 'The pile is empty' };
        return { state: pickUp(s, seat) };
      default:
        return { error: 'Unknown move' };
    }
  },

  turn: (s) => (s.result ? [] : s.phase === 'swap' ? s.order.filter((p) => !s.ready.includes(p)) : [s.order[s.turn]]),
  timeout(s, seat, now, ctx) {
    if (s.phase === 'swap') {
      const r = this.act(s, seat, { type: 'ready' }, now, ctx);
      return 'error' in r ? s : r.state;
    }
    const from = sourceOf(s, seat);
    const move = plainMove(s.phase, from, from === 'hand' ? s.hand[seat] : from === 'up' ? s.up[seat] : [], s.pile, s.down[seat].length, ctx.random);
    const r = this.act(s, seat, move, now, ctx);
    return 'error' in r ? (s.pile.length ? pickUp(s, seat) : s) : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): PoopView {
    const seated = !!viewer && s.order.includes(viewer);
    return {
      order: s.order, phase: s.phase, you: seated ? viewer : null,
      turn: s.result ? null : s.phase === 'swap' ? null : s.order[s.turn],
      hand: seated ? s.hand[viewer!] : null,
      handCount: Object.fromEntries(s.order.map((p) => [p, s.hand[p].length])),
      up: s.up, downCount: Object.fromEntries(s.order.map((p) => [p, s.down[p].length])),
      deckCount: s.deck.length, pile: s.pile, burned: s.burned, ready: s.ready, out: s.out,
      from: seated ? sourceOf(s, viewer!) : null, log: s.log, result: s.result,
    };
  },
}, { keys: ['hand', 'up', 'cards', 'index'] });

/** The plain move: the lowest ordinary rank that can go (2s and 10s kept back),
 *  all of that rank; a blind card from face-down; else pick up. */
export function plainMove(phase: PoopState['phase'], from: Source | null, cards: Card[], pile: Card[], downCount: number, random: () => number): unknown {
  if (phase === 'swap') return { type: 'ready' };
  if (from === 'down') return { type: 'blind', index: Math.floor(random() * downCount) };
  const ranks = [...new Set(cards.map(rankOf))].filter((r) => canPlay(r, pile));
  if (!ranks.length) return { type: 'pickup' };
  const ordinary = ranks.filter((r) => r !== '2' && r !== 'T').sort((a, b) => RANKS.indexOf(a) - RANKS.indexOf(b));
  const r = ordinary[0] ?? (ranks.includes('2') ? '2' : 'T');
  return { type: 'play', cards: cards.filter((c) => rankOf(c) === r) };
}
