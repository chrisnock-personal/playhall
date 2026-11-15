// Blackjack against the house, 1-4 players, with play chips only (no real
// money, nothing to buy). A game is a session of a set number of hands from
// 1,000 chips each; whoever has the most chips at the end wins. Each hand:
// everyone bets, two cards each and two for the dealer (one face down), then
// each player hits, stands or doubles; the dealer draws to 17 (standing on
// soft 17). A blackjack pays 3 to 2. Six decks, shuffled on the server.

import type { GameModule, GameResult, SeatId } from '../game';

export const SEATS = ['amber', 'teal', 'violet', 'rose'];
export const START_CHIPS = 1000;
export const MIN_BET = 10;
const DECKS = 6;

/** A card as rank + suit: 'AS', 'TD' (ten of diamonds), '9H', 'KC'. */
export type Card = string;
export interface BlackjackConfig { hands: number }
export type Finish = 'stand' | 'bust' | 'blackjack' | 'double';

export interface BlackjackState {
  config: BlackjackConfig;
  order: SeatId[];
  hand: number;
  phase: 'betting' | 'playing';
  chips: Record<SeatId, number>;
  bets: Record<SeatId, number | null>;
  cards: Record<SeatId, Card[]>;
  done: Record<SeatId, Finish | null>;
  dealer: Card[];
  turn: number;
  shoe: Card[];
  /** What happened to each player in the last hand. */
  last: { dealer: Card[]; deltas: Record<SeatId, number> } | null;
  result: GameResult | null;
}

export interface BlackjackView {
  hand: number;
  hands: number;
  phase: 'betting' | 'playing';
  order: SeatId[];
  chips: Record<SeatId, number>;
  bets: Record<SeatId, number | null>;
  cards: Record<SeatId, Card[]>;
  done: Record<SeatId, Finish | null>;
  /** The dealer's hole card is null until the dealer plays. */
  dealer: (Card | null)[];
  turn: SeatId | null;
  last: BlackjackState['last'];
  shoeLeft: number;
  result: GameResult | null;
}

export function newShoe(random: () => number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < DECKS; d++) for (const s of 'SHDC') for (const r of 'A23456789TJQK') cards.push(r + s);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

/** A hand's best total, and whether an ace is still counting as 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = c[0];
    if (r === 'A') { aces++; total += 11; } else total += 'TJQK'.includes(r) ? 10 : Number(r);
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;
const active = (s: BlackjackState) => s.order.filter((p) => s.chips[p] >= MIN_BET);

function draw(s: BlackjackState, random: () => number): [Card, Card[]] {
  const shoe = s.shoe.length ? s.shoe : newShoe(random);
  return [shoe[0], shoe.slice(1)];
}

function deal(s: BlackjackState, random: () => number): BlackjackState {
  let shoe = s.shoe.length < 52 ? newShoe(random) : s.shoe;
  const take = () => { const c = shoe[0]; shoe = shoe.slice(1); return c; };
  const players = active(s);
  const cards: Record<SeatId, Card[]> = Object.fromEntries(s.order.map((p) => [p, []]));
  for (let round = 0; round < 2; round++) for (const p of players) cards[p].push(take());
  const dealer = [take(), take()];
  const done: Record<SeatId, Finish | null> = Object.fromEntries(s.order.map((p) => [p, players.includes(p) ? (isBlackjack(cards[p]) ? 'blackjack' : null) : 'stand']));
  const next: BlackjackState = { ...s, phase: 'playing', cards, dealer, done, shoe, turn: -1 };
  if (isBlackjack(dealer)) return settle(next, random);
  return advance(next, random);
}

/** Move to the next player still to act; the dealer plays when nobody is. */
function advance(s: BlackjackState, random: () => number): BlackjackState {
  const i = s.order.findIndex((p, k) => k > s.turn && s.done[p] === null);
  if (i >= 0) return { ...s, turn: i };
  return settle(dealerPlays(s, random), random);
}

function dealerPlays(s: BlackjackState, random: () => number): BlackjackState {
  // The dealer only draws if someone is still in with a hand that didn't bust.
  const live = active(s).some((p) => s.done[p] !== 'bust' && s.done[p] !== 'blackjack');
  let dealer = s.dealer, next = s;
  while (live && handValue(dealer).total < 17) {
    const [c, shoe] = draw(next, random);
    dealer = [...dealer, c];
    next = { ...next, shoe };
  }
  return { ...next, dealer };
}

function settle(s: BlackjackState, random: () => number): BlackjackState {
  const dealer = handValue(s.dealer).total;
  const dealerBJ = isBlackjack(s.dealer);
  const deltas: Record<SeatId, number> = {};
  const chips = { ...s.chips };
  for (const p of active(s)) {
    const bet = s.bets[p] ?? 0;
    const mine = handValue(s.cards[p]).total;
    const bj = isBlackjack(s.cards[p]);
    let delta: number;
    if (s.done[p] === 'bust') delta = -bet;
    else if (bj && !dealerBJ) delta = Math.floor(bet * 1.5);
    else if (dealerBJ) delta = bj ? 0 : -bet;
    else if (dealer > 21 || mine > dealer) delta = bet;
    else if (mine === dealer) delta = 0;
    else delta = -bet;
    deltas[p] = delta;
    chips[p] += delta;
  }
  const settled: BlackjackState = { ...s, chips, last: { dealer: s.dealer, deltas } };
  const stillIn = s.order.filter((p) => chips[p] >= MIN_BET);
  if (s.hand >= s.config.hands || !stillIn.length) return finish(settled);
  return {
    ...settled, hand: s.hand + 1, phase: 'betting',
    bets: Object.fromEntries(s.order.map((p) => [p, null])),
    cards: Object.fromEntries(s.order.map((p) => [p, []])),
    done: Object.fromEntries(s.order.map((p) => [p, null])),
    dealer: [], turn: -1, shoe: settled.shoe.length ? settled.shoe : newShoe(random),
  };
}

function finish(s: BlackjackState): BlackjackState {
  const levels = [...new Set(s.order.map((p) => s.chips[p]))].sort((a, b) => b - a);
  const placings = levels.map((v) => s.order.filter((p) => s.chips[p] === v));
  return { ...s, result: { winner: placings[0].length === 1 ? placings[0][0] : null, reason: 'the most chips', placings } };
}

export const blackjack: GameModule<BlackjackState, BlackjackConfig> = {
  id: 'blackjack',
  name: 'Blackjack',
  description: '1-4 players against the house, with play chips only. Most chips after the last hand wins.',
  howToPlay: {
    goal: 'Finish the session with more chips than anyone else at the table. Each hand, beat the dealer by getting closer to 21 without going over.',
    sections: [
      { title: 'A hand', points: [
        'Everyone starts with 1,000 play chips (no real money, nothing to buy). First, everyone places a bet of at least 10.',
        'You get two cards face up; the dealer gets one face up and one face down.',
        'Cards 2-10 count their number, picture cards count 10, and an ace counts 1 or 11, whichever is better.',
        'On your turn: Hit for another card, Stand to stop, or Double (on your first two cards) to double your bet and take exactly one more card.',
        'Go over 21 and you bust: you lose your bet straight away.',
      ] },
      { title: 'The dealer and the payout', points: [
        'When everyone has finished, the dealer turns over their hidden card and draws until they have 17 or more.',
        'Beat the dealer (or the dealer busts) and you win your bet. A tie gives your bet back.',
        'A blackjack (an ace and a 10-value card as your first two) pays 3 to 2, unless the dealer has one too.',
      ] },
      { title: 'The session', points: [
        'A game is a set number of hands (10 unless the host chose otherwise). The most chips at the end wins; second place earns a point.',
        'If you run out of chips you sit out the rest of the session.',
        'A game with only one player is practice: it doesn’t count for the leaderboards.',
        'If the room has a move timer and you run out of time, you bet the minimum or stand.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 1,
  defaultConfig: { hands: 10 },
  parseConfig: (raw) => {
    const h = Number((raw as Partial<BlackjackConfig>)?.hands);
    return { hands: [5, 10, 20].includes(h) ? h : 10 };
  },
  describeConfig: (c) => `${c.hands} hands`,

  create: (config, _now, ctx) => ({
    config, order: ctx.seats, hand: 1, phase: 'betting',
    chips: Object.fromEntries(ctx.seats.map((p) => [p, START_CHIPS])),
    bets: Object.fromEntries(ctx.seats.map((p) => [p, null])),
    cards: Object.fromEntries(ctx.seats.map((p) => [p, []])),
    done: Object.fromEntries(ctx.seats.map((p) => [p, null])),
    dealer: [], turn: -1, shoe: newShoe(ctx.random), last: null, result: null,
  }),

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this game' };
    const action = raw as { type?: string; amount?: number };
    if (action?.type === 'resign') {
      const chips = { ...s.chips, [seat]: 0 };
      const next = { ...s, chips, done: { ...s.done, [seat]: 'bust' as Finish } };
      if (!next.order.some((p) => chips[p] >= MIN_BET)) return { state: finish(next) };
      if (s.phase === 'betting') return { state: next.order.filter((p) => chips[p] >= MIN_BET).every((p) => next.bets[p] !== null) ? deal(next, ctx.random) : next };
      return { state: s.order[s.turn] === seat ? advance(next, ctx.random) : next };
    }
    if (s.phase === 'betting') {
      if (action?.type !== 'bet') return { error: 'Place your bet first' };
      if (s.chips[seat] < MIN_BET) return { error: 'You’re out of chips' };
      if (s.bets[seat] !== null) return { error: 'You’ve already bet' };
      const amount = Math.floor(Number(action.amount));
      if (!(amount >= MIN_BET && amount <= s.chips[seat])) return { error: `Bet between ${MIN_BET} and ${s.chips[seat]}` };
      const next = { ...s, bets: { ...s.bets, [seat]: amount } };
      return { state: active(next).every((p) => next.bets[p] !== null) ? deal(next, ctx.random) : next };
    }
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    const mine = s.cards[seat];
    switch (action?.type) {
      case 'hit': {
        const [c, shoe] = draw(s, ctx.random);
        const cards = [...mine, c];
        const total = handValue(cards).total;
        const done: Finish | null = total > 21 ? 'bust' : total === 21 ? 'stand' : null;
        const next = { ...s, shoe, cards: { ...s.cards, [seat]: cards }, done: { ...s.done, [seat]: done } };
        return { state: done ? advance(next, ctx.random) : next };
      }
      case 'stand':
        return { state: advance({ ...s, done: { ...s.done, [seat]: 'stand' } }, ctx.random) };
      case 'double': {
        const bet = s.bets[seat] ?? 0;
        if (mine.length !== 2) return { error: 'You can only double on your first two cards' };
        if (s.chips[seat] < bet * 2) return { error: 'Not enough chips to double' };
        const [c, shoe] = draw(s, ctx.random);
        const cards = [...mine, c];
        const done: Finish = handValue(cards).total > 21 ? 'bust' : 'double';
        return { state: advance({ ...s, shoe, bets: { ...s.bets, [seat]: bet * 2 }, cards: { ...s.cards, [seat]: cards }, done: { ...s.done, [seat]: done } }, ctx.random) };
      }
      default:
        return { error: 'Unknown move' };
    }
  },

  turn: (s) => (s.result ? [] : s.phase === 'betting' ? active(s).filter((p) => s.bets[p] === null) : [s.order[s.turn]]),
  timeout(s, seat, now, ctx) {
    const r = this.act(s, seat, s.phase === 'betting' ? { type: 'bet', amount: MIN_BET } : { type: 'stand' }, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s): BlackjackView {
    return {
      hand: s.hand, hands: s.config.hands, phase: s.phase, order: s.order, chips: s.chips, bets: s.bets,
      cards: s.cards, done: s.done,
      dealer: s.phase === 'playing' && !s.result ? s.dealer.map((c, i) => (i === 1 ? null : c)) : s.dealer,
      turn: s.result || s.phase !== 'playing' ? null : s.order[s.turn] ?? null,
      last: s.last, shoeLeft: s.shoe.length, result: s.result,
    };
  },
};
