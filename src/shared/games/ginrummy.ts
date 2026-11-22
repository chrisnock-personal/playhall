// Gin Rummy (#40) for two, with a 52-card deck. Ten cards each; on your turn
// take the top of the deck or the discard, then throw one away. Build melds:
// runs of three or more in a suit, or three or four of a kind; the rest is
// deadwood (aces 1, court cards 10). Knock when your deadwood is 10 or less:
// the other player lays off what they can on your melds, and the lower
// deadwood scores the difference. Gin (no deadwood) scores 25 more; if the
// other player has as little as the knocker, it's an undercut and they score
// 25 more. First to 100 wins. Melds are arranged, and cards laid off, for you.

import type { GameResult, SeatId } from '../game';
import type { Card } from './blackjack';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal'];
export const TARGET = 100;
export const GIN_BONUS = 25;
export const UNDERCUT_BONUS = 25;
const RANKS = 'A23456789TJQK';
export const rankOf = (c: Card) => RANKS.indexOf(c[0]);
export const suitOf = (c: Card) => c[1];
export const deadValue = (c: Card) => Math.min(10, rankOf(c) + 1);
const sorted = (cards: Card[]) => [...cards].sort((a, b) => 'SHDC'.indexOf(suitOf(a)) - 'SHDC'.indexOf(suitOf(b)) || rankOf(a) - rankOf(b));

/** Every meld that can be made from these cards. */
function allMelds(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  const byRank = new Map<number, Card[]>();
  for (const c of cards) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c]);
  for (const group of byRank.values()) {
    if (group.length >= 3) {
      if (group.length === 4) { out.push(group); for (let i = 0; i < 4; i++) out.push(group.filter((_, j) => j !== i)); }
      else out.push(group);
    }
  }
  for (const su of 'SHDC') {
    const ranks = cards.filter((c) => suitOf(c) === su).sort((a, b) => rankOf(a) - rankOf(b));
    for (let i = 0; i < ranks.length; i++) {
      let run = [ranks[i]];
      for (let j = i + 1; j < ranks.length && rankOf(ranks[j]) === rankOf(run[run.length - 1]) + 1; j++) {
        run = [...run, ranks[j]];
        if (run.length >= 3) out.push(run);
      }
    }
  }
  return out;
}

/** The arrangement with the least deadwood: melds, the cards left over, and their total. */
export function bestMelds(cards: Card[]): { melds: Card[][]; deadwood: Card[]; points: number } {
  const melds = allMelds(cards);
  let best = { melds: [] as Card[][], deadwood: cards, points: cards.reduce((n, c) => n + deadValue(c), 0) };
  const search = (from: number, used: Set<Card>, chosen: Card[][]) => {
    const dead = cards.filter((c) => !used.has(c));
    const points = dead.reduce((n, c) => n + deadValue(c), 0);
    if (points < best.points) best = { melds: chosen, deadwood: dead, points };
    for (let i = from; i < melds.length; i++) {
      if (melds[i].some((c) => used.has(c))) continue;
      const next = new Set(used);
      for (const c of melds[i]) next.add(c);
      search(i + 1, next, [...chosen, melds[i]]);
    }
  };
  search(0, new Set(), []);
  return { melds: best.melds, deadwood: sorted(best.deadwood), points: best.points };
}

/** Lay off as many of `deadwood` as possible onto `melds`; returns what was laid off and the melds after. */
export function layOff(melds: Card[][], deadwood: Card[]): { laid: Card[]; melds: Card[][]; left: Card[] } {
  let ms = melds.map((m) => [...m]);
  let left = [...deadwood];
  const laid: Card[] = [];
  for (let changed = true; changed;) {
    changed = false;
    // Highest first, so the costliest cards go when there's a choice.
    for (const c of [...left].sort((a, b) => deadValue(b) - deadValue(a))) {
      const k = ms.findIndex((m) => {
        const isSet = m.every((x) => rankOf(x) === rankOf(m[0]));
        if (isSet) return m.length < 4 && rankOf(c) === rankOf(m[0]);
        if (suitOf(c) !== suitOf(m[0])) return false;
        const rs = m.map(rankOf);
        return rankOf(c) === Math.min(...rs) - 1 || rankOf(c) === Math.max(...rs) + 1;
      });
      if (k < 0) continue;
      ms = ms.map((m, i) => (i === k ? [...m, c].sort((a, b) => rankOf(a) - rankOf(b)) : m));
      left = left.filter((x) => x !== c);
      laid.push(c);
      changed = true;
    }
  }
  return { laid, melds: ms, left };
}

/** A hand's outcome: who knocked, gin or undercut, and who scored what. */
export interface HandOutcome {
  knocker: SeatId | null;
  kind: 'gin' | 'knock' | 'undercut' | 'draw';
  winner: SeatId | null;
  points: number;
  shown: Record<SeatId, { melds: Card[][]; deadwood: Card[]; points: number; laid: Card[] }>;
}

export interface GinState {
  order: SeatId[];
  hand: number;
  dealer: SeatId;
  phase: 'draw' | 'discard';
  hands: Record<SeatId, Card[]>;
  deck: Card[];
  discard: Card[];
  turn: SeatId;
  took: Card | null;
  scores: Record<SeatId, number>;
  handsWon: Record<SeatId, number>;
  lastHand: HandOutcome | null;
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface GinView {
  order: SeatId[];
  you: SeatId | null;
  hand: number;
  dealer: SeatId;
  phase: GinState['phase'];
  cards: Card[] | null;
  /** Your cards arranged: melds, then deadwood. */
  melds: Card[][];
  deadwood: Card[];
  deadwoodPoints: number;
  /** Cards you could throw away and knock with (deadwood 10 or less after). */
  knockWith: Card[];
  counts: Record<SeatId, number>;
  deckCount: number;
  discardTop: Card | null;
  turn: SeatId | null;
  took: Card | null;
  scores: Record<SeatId, number>;
  handsWon: Record<SeatId, number>;
  lastHand: HandOutcome | null;
  log: GinState['log'];
  result: GameResult | null;
}

const log = (s: GinState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-40);
const other = (s: { order: SeatId[] }, p: SeatId) => s.order.find((x) => x !== p)!;

function deal(s: Omit<GinState, 'phase' | 'hands' | 'deck' | 'discard' | 'turn' | 'took'>, random: () => number): GinState {
  const deck: Card[] = [];
  for (const su of 'SHDC') for (const r of RANKS) deck.push(r + su);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = Object.fromEntries(s.order.map((p) => [p, sorted(deck.splice(0, 10))]));
  return { ...s, phase: 'draw', hands, discard: [deck.shift()!], deck, turn: other(s, s.dealer), took: null };
}

/** Cards that could be thrown away from 11 to knock. */
export function knockCards(hand: Card[], took: Card | null): Card[] {
  return hand.filter((c) => c !== took && bestMelds(hand.filter((x) => x !== c)).points <= 10);
}

function score(s: GinState, knocker: SeatId, random: () => number): GinState {
  const def = other(s, knocker);
  const k = bestMelds(s.hands[knocker]);
  const d = bestMelds(s.hands[def]);
  const gin = k.points === 0;
  const lay = gin ? { laid: [], melds: k.melds, left: d.deadwood } : layOff(k.melds, d.deadwood);
  const dPoints = lay.left.reduce((n, c) => n + deadValue(c), 0);
  let outcome: HandOutcome;
  const shown = {
    [knocker]: { melds: lay.melds, deadwood: k.deadwood, points: k.points, laid: [] as Card[] },
    [def]: { melds: d.melds, deadwood: lay.left, points: dPoints, laid: lay.laid },
  };
  if (gin) outcome = { knocker, kind: 'gin', winner: knocker, points: GIN_BONUS + dPoints, shown };
  else if (dPoints <= k.points) outcome = { knocker, kind: 'undercut', winner: def, points: UNDERCUT_BONUS + k.points - dPoints, shown };
  else outcome = { knocker, kind: 'knock', winner: knocker, points: dPoints - k.points, shown };
  const w = outcome.winner!;
  const scores = { ...s.scores, [w]: s.scores[w] + outcome.points };
  const handsWon = { ...s.handsWon, [w]: s.handsWon[w] + 1 };
  let next: GinState = { ...s, scores, handsWon, lastHand: outcome };
  const words = outcome.kind === 'gin' ? `went gin! +${outcome.points}` : outcome.kind === 'undercut' ? `undercut the knock! +${outcome.points}` : `won the hand on a knock, +${outcome.points}`;
  next = { ...next, log: log(next, w, words) };
  if (scores[w] >= TARGET) {
    const l = other(s, w);
    return { ...next, result: { winner: w, placings: [[w], [l]], reason: `first to ${TARGET}` } };
  }
  // The loser of the hand deals the next.
  return deal({ ...next, hand: s.hand + 1, dealer: other(s, w) }, random);
}

export const ginRummy = withHistory<GinState, Record<string, never>>({
  id: 'ginrummy',
  name: 'Gin Rummy',
  description: 'Two players. Build runs and sets, knock when your deadwood is low, go gin for a bonus. First to 100 wins.',
  howToPlay: {
    goal: 'Be first to 100 points by finishing hands with less deadwood than the other player.',
    sections: [
      { title: 'Melds and deadwood', points: [
        'You have ten cards. Group them into melds: runs of three or more in one suit (A-2-3 up to J-Q-K; aces are low), or three or four of a kind.',
        'Cards not in a meld are deadwood: aces count 1, court cards 10, the rest their number. Your melds are arranged for you to leave the least deadwood.',
      ] },
      { title: 'Your turn', points: [
        'Take the top card of the deck or of the discard pile, then throw one away. You can’t throw back the card you just took from the discard pile.',
        'Knock instead of just throwing away, when your deadwood would be 10 or less: pick the card to throw and press Knock.',
        'If the deck gets down to two cards with nobody knocking, the hand is a draw and is dealt again.',
      ] },
      { title: 'Scoring', points: [
        'After a knock, the other player lays off what deadwood they can on the knocker’s melds (done for you).',
        'The knocker scores the difference between the two deadwood totals.',
        'Gin, knocking with no deadwood at all: 25 more, and nothing can be laid off.',
        'Undercut: if the other player has as little deadwood as the knocker, or less, they score the difference and 25 more.',
        'First to 100 wins. The loser of each hand deals the next.',
        'If the room has a move timer and you run out of time, you take from the deck and throw away your worst card.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => `To ${TARGET} points`,

  create(_c, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    const zero = Object.fromEntries(order.map((p) => [p, 0]));
    return deal({ order, hand: 1, dealer: order[1], scores: zero, handsWon: { ...zero }, lastHand: null, log: [], result: null }, ctx.random);
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; from?: string; card?: string; knock?: boolean };
    if (a?.type === 'resign') {
      const w = other(s, seat);
      return { state: { ...s, result: { winner: w, placings: [[w], [seat]], reason: 'resignation' } } };
    }
    if (s.turn !== seat) return { error: 'It isn’t your turn' };
    if (s.phase === 'draw') {
      if (a?.type !== 'draw' || (a.from !== 'deck' && a.from !== 'discard')) return { error: 'Take a card from the deck or the discard pile' };
      if (a.from === 'discard') {
        const card = s.discard[s.discard.length - 1];
        if (!card) return { error: 'The discard pile is empty' };
        return { state: { ...s, discard: s.discard.slice(0, -1), hands: { ...s.hands, [seat]: sorted([...s.hands[seat], card]) }, phase: 'discard', took: card } };
      }
      const [card, ...deck] = s.deck;
      return { state: { ...s, deck, hands: { ...s.hands, [seat]: sorted([...s.hands[seat], card]) }, phase: 'discard', took: null } };
    }
    if (a?.type !== 'discard') return { error: 'Throw one card away' };
    const card = a.card as string;
    if (!s.hands[seat].includes(card)) return { error: 'You don’t have that card' };
    if (card === s.took) return { error: 'You can’t throw back the card you just took' };
    const hand = s.hands[seat].filter((c) => c !== card);
    const next: GinState = { ...s, hands: { ...s.hands, [seat]: hand }, discard: [...s.discard, card], took: null };
    if (a.knock) {
      if (bestMelds(hand).points > 10) return { error: 'You need 10 or less deadwood to knock' };
      return { state: score({ ...next, log: log(next, seat, bestMelds(hand).points === 0 ? 'went gin' : 'knocked') }, seat, ctx.random) };
    }
    if (next.deck.length <= 2) {
      const drawn: GinState = { ...next, lastHand: { knocker: null, kind: 'draw', winner: null, points: 0, shown: {} }, log: log(next, seat, 'The deck ran low: the hand is a draw') };
      return { state: deal({ ...drawn, hand: s.hand + 1 }, ctx.random) };
    }
    return { state: { ...next, turn: other(s, seat), phase: 'draw' } };
  },

  turn: (s) => (s.result ? [] : [s.turn]),
  timeout(s, seat, now, ctx) {
    const move = s.phase === 'draw' ? { type: 'draw', from: 'deck' } : { type: 'discard', card: worstDiscard(s.hands[seat], s.took) };
    const r = this.act(s, seat, move, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): GinView {
    const seated = !!viewer && s.order.includes(viewer);
    const mine = seated ? s.hands[viewer!] : null;
    const arranged = mine ? bestMelds(mine) : { melds: [], deadwood: [], points: 0 };
    return {
      order: s.order, you: seated ? viewer : null, hand: s.hand, dealer: s.dealer, phase: s.phase,
      cards: mine, melds: arranged.melds, deadwood: arranged.deadwood, deadwoodPoints: arranged.points,
      knockWith: mine && s.turn === viewer && s.phase === 'discard' && !s.result ? knockCards(mine, s.took) : [],
      counts: Object.fromEntries(s.order.map((p) => [p, s.hands[p].length])),
      deckCount: s.deck.length, discardTop: s.discard[s.discard.length - 1] ?? null,
      turn: s.result ? null : s.turn, took: seated && s.turn === viewer ? s.took : null,
      scores: s.scores, handsWon: s.handsWon, lastHand: s.lastHand, log: s.log, result: s.result,
    };
  },
}, { keys: ['from', 'card', 'knock'] });

/** The card to throw away: the one that leaves the least deadwood (the highest, on a tie). */
export function worstDiscard(hand: Card[], took: Card | null): Card {
  let best: Card | null = null, bestPts = Infinity;
  for (const c of hand) {
    if (c === took) continue;
    const pts = bestMelds(hand.filter((x) => x !== c)).points;
    if (pts < bestPts || (pts === bestPts && best && deadValue(c) > deadValue(best))) { best = c; bestPts = pts; }
  }
  return best!;
}
