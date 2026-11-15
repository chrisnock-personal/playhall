// Colour Clash: a shedding card game for 2-4 players with Playhall's own
// deck in the four player colours (amber, teal, violet, rose). Match the top
// card by colour or symbol, or play a wild; first to empty their hand wins,
// everyone else is placed by how few cards they have left. The generic
// matching game: "Uno" is Mattel's name for its own version.

import type { GameModule, GameResult, SeatId } from '../game';

export const COLOURS = ['amber', 'teal', 'violet', 'rose'] as const;
export type Colour = (typeof COLOURS)[number];
export type Value = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export interface ClashCard { id: number; colour: Colour | 'wild'; value: Value }

export interface ClashState {
  order: SeatId[];
  hands: Record<SeatId, ClashCard[]>;
  draw: ClashCard[];
  discard: ClashCard[];
  /** The colour in play (a wild sets it). */
  colour: Colour;
  dir: 1 | -1;
  turn: number;
  /** The card just drawn this turn, which may be played or kept. */
  drawn: number | null;
  log: { seat: SeatId; text: string }[];
  result: GameResult | null;
}

export interface ClashView {
  order: SeatId[];
  /** Only your own hand; everyone's counts. */
  hand: ClashCard[] | null;
  counts: Record<SeatId, number>;
  top: ClashCard | null;
  colour: Colour;
  dir: 1 | -1;
  turn: SeatId | null;
  drawn: number | null;
  drawLeft: number;
  log: ClashState['log'];
  result: GameResult | null;
}

export function newDeck(random: () => number): ClashCard[] {
  const cards: ClashCard[] = [];
  let id = 0;
  for (const colour of COLOURS) {
    cards.push({ id: id++, colour, value: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'] as Value[]) {
      cards.push({ id: id++, colour, value: v }, { id: id++, colour, value: v });
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ id: id++, colour: 'wild', value: 'wild' }, { id: id++, colour: 'wild', value: 'wild4' });
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

export function playable(card: ClashCard, top: ClashCard, colour: Colour): boolean {
  return card.colour === 'wild' || card.colour === colour || card.value === top.value;
}

const NAMES: Record<string, string> = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw two', wild: 'Wild', wild4: 'Wild draw four' };
export const cardLabel = (c: ClashCard) => `${c.colour === 'wild' ? '' : `${c.colour[0].toUpperCase()}${c.colour.slice(1)} `}${NAMES[c.value] ?? c.value}`;

/** Take n cards, reshuffling the discards (all but the top) if the pile runs out. */
function take(s: ClashState, n: number, random: () => number): [ClashCard[], ClashState] {
  let draw = s.draw, discard = s.discard;
  const got: ClashCard[] = [];
  for (let i = 0; i < n; i++) {
    if (!draw.length) {
      const rest = discard.slice(0, -1);
      for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(random() * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
      draw = rest; discard = discard.slice(-1);
      if (!draw.length) break;
    }
    got.push(draw[0]); draw = draw.slice(1);
  }
  return [got, { ...s, draw, discard }];
}

const step = (s: ClashState, k = 1) => (((s.turn + s.dir * k) % s.order.length) + s.order.length) % s.order.length;
const log = (s: ClashState, seat: SeatId, text: string) => [...s.log, { seat, text }].slice(-30);

function placeAll(s: ClashState, winner: SeatId): GameResult {
  const rest = s.order.filter((p) => p !== winner);
  const sizes = [...new Set(rest.map((p) => s.hands[p].length))].sort((a, b) => a - b);
  return { winner, reason: 'playing their last card', placings: [[winner], ...sizes.map((n) => rest.filter((p) => s.hands[p].length === n))] };
}

function play(s: ClashState, seat: SeatId, card: ClashCard, colour: Colour | undefined, random: () => number): ClashState {
  const hand = s.hands[seat].filter((c) => c.id !== card.id);
  let next: ClashState = {
    ...s, hands: { ...s.hands, [seat]: hand }, discard: [...s.discard, card], drawn: null,
    colour: card.colour === 'wild' ? colour! : card.colour,
    log: log(s, seat, `played ${cardLabel(card)}${card.colour === 'wild' ? ` and chose ${colour}` : ''}${hand.length === 1 ? ' (last card!)' : ''}`),
  };
  if (!hand.length) return { ...next, result: placeAll(next, seat) };
  const two = s.order.length === 2;
  if (card.value === 'reverse') {
    next = { ...next, dir: (s.dir * -1) as 1 | -1 };
    return { ...next, turn: two ? s.turn : step(next) };
  }
  if (card.value === 'skip') return { ...next, turn: step(next, 2) };
  if (card.value === 'draw2' || card.value === 'wild4') {
    const victim = s.order[step(next)];
    const [got, after] = take(next, card.value === 'draw2' ? 2 : 4, random);
    return { ...after, hands: { ...after.hands, [victim]: [...after.hands[victim], ...got] }, turn: step(after, 2), log: log(after, victim, `drew ${got.length} and missed a turn`) };
  }
  return { ...next, turn: step(next) };
}

export const colourClash: GameModule<ClashState, Record<string, never>> = {
  id: 'colourclash',
  name: 'Colour Clash',
  description: '2-4 players. Match the top card by colour or symbol; first to empty their hand wins.',
  howToPlay: {
    goal: 'Be the first to get rid of all your cards.',
    sections: [
      { title: 'The cards', points: [
        'Four colours (Amber, Teal, Violet, Rose), each with 0-9 and three action cards: Skip, Reverse and Draw two. There are also Wild and Wild draw four cards. You start with 7.',
        'Only you can see your hand; everyone sees how many cards each player holds.',
      ] },
      { title: 'Your turn', points: [
        'Play a card that matches the top card’s colour or its number or symbol, or play a Wild and choose the colour.',
        'Can’t (or don’t want to) play? Draw a card. If it fits you may play it straight away; otherwise keep it and your turn ends.',
        'Skip: the next player misses a turn. Reverse: play changes direction (with two players it works like Skip).',
        'Draw two and Wild draw four: the next player draws that many and misses their turn.',
      ] },
      { title: 'Winning', points: [
        'The first to play their last card wins. Everyone else is placed by how few cards they had left: second place earns a point.',
        'If the room has a move timer and you run out of time, a card that fits is played for you (or you draw).',
      ] },
    ],
  },
  seats: COLOURS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 2,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => '7 cards each',

  create(_c, _now, ctx) {
    let deck = newDeck(ctx.random);
    const hands: Record<SeatId, ClashCard[]> = {};
    for (const p of ctx.seats) { hands[p] = deck.slice(0, 7); deck = deck.slice(7); }
    // Start on a number card.
    const first = deck.findIndex((c) => /^\d$/.test(c.value));
    const top = deck[first];
    deck = [...deck.slice(0, first), ...deck.slice(first + 1)];
    return { order: ctx.seats, hands, draw: deck, discard: [top], colour: top.colour as Colour, dir: 1, turn: 0, drawn: null, log: [], result: null };
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    const action = raw as { type?: string; card?: number; colour?: string };
    if (action?.type === 'resign') {
      const order = s.order.filter((p) => p !== seat);
      if (order.length === 1) return { state: { ...s, result: { winner: order[0], reason: 'everyone else resigning' } } };
      const current = s.order[s.turn];
      return { state: { ...s, order, drawn: current === seat ? null : s.drawn, turn: current === seat ? s.turn % order.length : order.indexOf(current) } };
    }
    if (s.order[s.turn] !== seat) return { error: 'It isn’t your turn' };
    const top = s.discard[s.discard.length - 1];
    switch (action?.type) {
      case 'play': {
        const card = s.hands[seat].find((c) => c.id === action.card);
        if (!card) return { error: 'That card isn’t in your hand' };
        if (s.drawn !== null && card.id !== s.drawn) return { error: 'After drawing you may only play the card you drew' };
        if (!playable(card, top, s.colour)) return { error: 'That card doesn’t match' };
        if (card.colour === 'wild' && !COLOURS.includes(action.colour as Colour)) return { error: 'Choose a colour' };
        return { state: play(s, seat, card, action.colour as Colour, ctx.random) };
      }
      case 'draw': {
        if (s.drawn !== null) return { error: 'You’ve already drawn' };
        const [got, after] = take(s, 1, ctx.random);
        if (!got.length) return { state: { ...after, turn: step(after), log: log(after, seat, 'couldn’t draw (no cards left) and passed') } };
        const hands = { ...after.hands, [seat]: [...after.hands[seat], got[0]] };
        const next = { ...after, hands, log: log(after, seat, 'drew a card') };
        return { state: playable(got[0], top, s.colour) ? { ...next, drawn: got[0].id } : { ...next, turn: step(next) } };
      }
      case 'pass':
        if (s.drawn === null) return { error: 'Draw a card first' };
        return { state: { ...s, drawn: null, turn: step(s), log: log(s, seat, 'kept it') } };
      default:
        return { error: 'Unknown move' };
    }
  },

  turn: (s) => (s.result ? [] : [s.order[s.turn]]),
  timeout(s, seat, now, ctx) {
    const top = s.discard[s.discard.length - 1];
    const card = s.hands[seat].find((c) => (s.drawn === null || c.id === s.drawn) && playable(c, top, s.colour));
    const counts = COLOURS.map((col) => [col, s.hands[seat].filter((c) => c.colour === col).length] as const).sort((a, b) => b[1] - a[1]);
    const action = card ? { type: 'play', card: card.id, colour: counts[0][0] } : s.drawn !== null ? { type: 'pass' } : { type: 'draw' };
    const r = this.act(s, seat, action, now, ctx);
    if ('error' in r) return s;
    // A drawn card that can't be kept waiting: pass.
    return r.state.drawn !== null && r.state.order[r.state.turn] === seat ? { ...r.state, drawn: null, turn: step(r.state) } : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): ClashView {
    return {
      order: s.order, hand: viewer && s.hands[viewer] ? s.hands[viewer] : null,
      counts: Object.fromEntries(s.order.map((p) => [p, s.hands[p].length])),
      top: s.discard[s.discard.length - 1] ?? null, colour: s.colour, dir: s.dir,
      turn: s.result ? null : s.order[s.turn], drawn: viewer === s.order[s.turn] ? s.drawn : null,
      drawLeft: s.draw.length, log: s.log.slice(-12), result: s.result,
    };
  },
};
