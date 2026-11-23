// Bridge (#37): contract bridge for four in two partnerships, North-South
// (Amber and Violet) against East-West (Teal and Rose), Chicago scoring: four
// deals with set vulnerability, then the pair with more points wins (both
// partners score the win). Each deal: an auction to a contract (levels 1-7 in
// clubs, diamonds, hearts, spades or no trumps; pass, double, redouble; three
// passes end it, four passes redeal), then thirteen tricks. The declarer's
// partner is dummy: dummy's hand goes face up after the opening lead and the
// declarer plays it.

import type { GameResult, SeatId } from '../game';
import type { Card } from './blackjack';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose'];
export const COMPASS: Record<string, string> = { amber: 'North', teal: 'East', violet: 'South', rose: 'West' };
export const PAIRS: [SeatId, SeatId][] = [['amber', 'violet'], ['teal', 'rose']];
export const DEALS = 4;
const RANKS = '23456789TJQKA';
export const STRAINS = ['C', 'D', 'H', 'S', 'N'] as const;
export type Strain = (typeof STRAINS)[number];
export const STRAIN_WORD: Record<Strain, string> = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades', N: 'no trumps' };
export const STRAIN_SIGN: Record<Strain, string> = { C: '♣', D: '♦', H: '♥', S: '♠', N: 'NT' };
export const rankOf = (c: Card) => RANKS.indexOf(c[0]);
export const suitOf = (c: Card) => c[1];
export const hcp = (cards: Card[]) => cards.reduce((n, c) => n + Math.max(0, rankOf(c) - 8), 0);

/** A call: a bid like '1H' or '3N', or 'P' (pass), 'X' (double), 'XX' (redouble). */
export type Call = string;
export const bidRank = (call: Call) => (Number(call[0]) - 1) * 5 + STRAINS.indexOf(call[1] as Strain);
export const isBid = (call: Call) => /^[1-7][CDHSN]$/.test(call);
/** "2♥: hearts, eight tricks" */
export function callWords(call: Call): string {
  if (call === 'P') return 'Pass';
  if (call === 'X') return 'Double';
  if (call === 'XX') return 'Redouble';
  const level = Number(call[0]), s = call[1] as Strain;
  return `${level}${STRAIN_SIGN[s]}: ${STRAIN_WORD[s]}, ${['six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'][level]} tricks`;
}

export interface Contract { level: number; strain: Strain; doubled: 0 | 1 | 2; declarer: SeatId }
export const contractWords = (c: Contract) => `${c.level}${STRAIN_SIGN[c.strain]}${c.doubled === 2 ? 'XX' : c.doubled ? 'X' : ''} by ${COMPASS[c.declarer]}`;

const pairOf = (p: SeatId) => PAIRS.find((x) => x.includes(p))!;
export const partnerOf = (p: SeatId) => pairOf(p).find((x) => x !== p)!;
export const sideOf = (p: SeatId): 'NS' | 'EW' => (pairOf(p)[0] === 'amber' ? 'NS' : 'EW');
const nextSeat = (p: SeatId) => SEATS[(SEATS.indexOf(p) + 1) % 4];

/** Chicago vulnerability for deal 1-4: none, dealer's side, dealer's side, both. Dealers go North, East, South, West. */
export function vulnerable(deal: number): { NS: boolean; EW: boolean } {
  const d = ((deal - 1) % 4) + 1;
  if (d === 1) return { NS: false, EW: false };
  if (d === 4) return { NS: true, EW: true };
  const dealer = SEATS[(deal - 1) % 4];
  return { NS: sideOf(dealer) === 'NS', EW: sideOf(dealer) === 'EW' };
}

/** The score for a deal: positive for the declaring side, negative means the defenders get it. */
export function scoreDeal(c: Contract, tricks: number, vul: boolean): { declarer: number; defenders: number; made: boolean } {
  const need = c.level + 6;
  const mult = c.doubled === 2 ? 4 : c.doubled ? 2 : 1;
  if (tricks >= need) {
    const per = c.strain === 'C' || c.strain === 'D' ? 20 : 30;
    const trickPoints = (c.strain === 'N' ? 40 + (c.level - 1) * 30 : c.level * per) * mult;
    let score = trickPoints;
    score += trickPoints >= 100 ? (vul ? 500 : 300) : 50;
    if (c.level === 6) score += vul ? 750 : 500;
    if (c.level === 7) score += vul ? 1500 : 1000;
    if (c.doubled) score += c.doubled === 2 ? 100 : 50;
    const over = tricks - need;
    score += over * (c.doubled ? (vul ? 200 : 100) * (c.doubled === 2 ? 2 : 1) : per);
    return { declarer: score, defenders: 0, made: true };
  }
  const down = need - tricks;
  let pen = 0;
  if (!c.doubled) pen = down * (vul ? 100 : 50);
  else {
    for (let i = 1; i <= down; i++) pen += vul ? (i === 1 ? 200 : 300) : (i === 1 ? 100 : i <= 3 ? 200 : 300);
    if (c.doubled === 2) pen *= 2;
  }
  return { declarer: 0, defenders: pen, made: false };
}

export interface BridgeState {
  deal: number;
  dealer: SeatId;
  phase: 'auction' | 'play';
  hands: Record<SeatId, Card[]>;
  /** The hands as dealt, shown to everyone once the deal is over. */
  dealt: Record<SeatId, Card[]>;
  auction: { seat: SeatId; call: Call }[];
  contract: Contract | null;
  /** Whose cards are played next (dummy's are played by the declarer). */
  turn: SeatId;
  trick: { seat: SeatId; card: Card }[];
  tricks: { NS: number; EW: number };
  played: Card[];
  dummyShown: boolean;
  scores: { NS: number; EW: number };
  /** Each finished deal, for the score sheet. */
  sheet: { deal: number; contract: Contract | null; tricks: number; NS: number; EW: number; hands: Record<SeatId, Card[]> }[];
  lastTrick: { cards: { seat: SeatId; card: Card }[]; winner: SeatId } | null;
  result: GameResult | null;
  history?: GameHistory;
}

export interface BridgeView {
  deal: number;
  dealer: SeatId;
  vul: { NS: boolean; EW: boolean };
  phase: BridgeState['phase'];
  you: SeatId | null;
  /** Your hand (and dummy's, once shown). */
  hand: Card[] | null;
  dummy: SeatId | null;
  dummyHand: Card[] | null;
  counts: Record<SeatId, number>;
  auction: BridgeState['auction'];
  contract: Contract | null;
  /** Whose cards are played next, and who acts (the declarer plays for dummy). */
  turn: SeatId | null;
  actor: SeatId | null;
  /** What you can call or play now. */
  calls: Call[];
  legal: Card[];
  trick: BridgeState['trick'];
  tricks: BridgeState['tricks'];
  played: Card[];
  scores: BridgeState['scores'];
  sheet: BridgeState['sheet'];
  lastTrick: BridgeState['lastTrick'];
  result: GameResult | null;
}

const sorted = (cards: Card[]) => [...cards].sort((a, b) => 'SHCD'.indexOf(suitOf(a)) - 'SHCD'.indexOf(suitOf(b)) || rankOf(b) - rankOf(a));

function deal(s: Omit<BridgeState, 'phase' | 'hands' | 'dealt' | 'auction' | 'contract' | 'turn' | 'trick' | 'tricks' | 'played' | 'dummyShown'>, random: () => number): BridgeState {
  const deck: Card[] = [];
  for (const su of 'SHDC') for (const r of RANKS) deck.push(r + su);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const hands = Object.fromEntries(SEATS.map((p, i) => [p, sorted(deck.slice(i * 13, i * 13 + 13))]));
  return { ...s, phase: 'auction', hands, dealt: hands, auction: [], contract: null, turn: s.dealer, trick: [], tricks: { NS: 0, EW: 0 }, played: [], dummyShown: false };
}

/** The calls `seat` may make now. */
export function legalCalls(auction: BridgeState['auction'], seat: SeatId): Call[] {
  const lastBid = [...auction].reverse().find((a) => isBid(a.call));
  const out: Call[] = ['P'];
  for (let l = 1; l <= 7; l++) for (const s of STRAINS) { const c = `${l}${s}`; if (!lastBid || bidRank(c) > bidRank(lastBid.call)) out.push(c); }
  if (lastBid) {
    // Double the opponents' last bid if nobody has since; redouble a double of yours.
    const after = auction.slice(auction.lastIndexOf(lastBid) + 1).map((a) => a.call);
    const theirs = sideOf(lastBid.seat) !== sideOf(seat);
    if (theirs && !after.includes('X') && !after.includes('XX')) out.push('X');
    if (!theirs && after.includes('X') && !after.includes('XX')) out.push('XX');
  }
  return out;
}

/** Is the auction over? Four passes (no contract), or three passes after a bid. */
function auctionOver(auction: BridgeState['auction']): boolean {
  if (auction.length === 4 && auction.every((a) => a.call === 'P')) return true;
  return auction.some((a) => isBid(a.call)) && auction.length >= 4 && auction.slice(-3).every((a) => a.call === 'P');
}

function contractOf(auction: BridgeState['auction']): Contract | null {
  const last = [...auction].reverse().find((a) => isBid(a.call));
  if (!last) return null;
  const after = auction.slice(auction.lastIndexOf(last) + 1).map((a) => a.call);
  const strain = last.call[1] as Strain;
  // The declarer: the first of the winning side to name this strain.
  const declarer = auction.find((a) => isBid(a.call) && a.call[1] === strain && sideOf(a.seat) === sideOf(last.seat))!.seat;
  return { level: Number(last.call[0]), strain, doubled: after.includes('XX') ? 2 : after.includes('X') ? 1 : 0, declarer };
}

/** The cards that may be played from `hand` to this trick. */
export function legalPlays(hand: Card[], trick: BridgeState['trick']): Card[] {
  if (!trick.length) return hand;
  const follow = hand.filter((c) => suitOf(c) === suitOf(trick[0].card));
  return follow.length ? follow : hand;
}

export function trickWinner(trick: BridgeState['trick'], strain: Strain): SeatId {
  const trumps = strain === 'N' ? [] : trick.filter((t) => suitOf(t.card) === strain);
  const pool = trumps.length ? trumps : trick.filter((t) => suitOf(t.card) === suitOf(trick[0].card));
  return pool.reduce((a, b) => (rankOf(b.card) > rankOf(a.card) ? b : a)).seat;
}

const dummyOf = (s: BridgeState) => (s.contract ? partnerOf(s.contract.declarer) : null);
/** Who acts for the hand whose turn it is. */
export const actorOf = (s: BridgeState): SeatId => (s.phase === 'play' && s.turn === dummyOf(s) ? s.contract!.declarer : s.turn);

function finishDeal(s: BridgeState, random: () => number): BridgeState {
  const c = s.contract!;
  const side = sideOf(c.declarer);
  const other = side === 'NS' ? 'EW' : 'NS';
  const vul = vulnerable(s.deal)[side];
  const r = scoreDeal(c, s.tricks[side], vul);
  const add = { [side]: r.declarer, [other]: r.defenders } as { NS: number; EW: number };
  const scores = { NS: s.scores.NS + add.NS, EW: s.scores.EW + add.EW };
  const sheet = [...s.sheet, { deal: s.deal, contract: c, tricks: s.tricks[side], NS: add.NS, EW: add.EW, hands: s.dealt }];
  const next = { ...s, scores, sheet };
  if (s.deal >= DEALS) {
    const ns = PAIRS[0], ew = PAIRS[1];
    if (scores.NS === scores.EW) return { ...next, result: { winner: null, placings: [[...ns, ...ew]], reason: 'level after four deals' } };
    const [win, lose] = scores.NS > scores.EW ? [ns, ew] : [ew, ns];
    return { ...next, result: { winner: null, placings: [[...win], [...lose]], reason: `the most points after ${DEALS} deals`, teamWin: true } };
  }
  return deal({ ...next, deal: s.deal + 1, dealer: SEATS[s.deal % 4] }, random);
}

export const bridge = withHistory<BridgeState, Record<string, never>>({
  id: 'bridge',
  name: 'Bridge',
  description: 'Contract bridge for four in two pairs, Chicago scoring over four deals. Computer players can fill any seat.',
  howToPlay: {
    goal: 'With your partner (sitting opposite), score more points than the other pair over four deals: bid a contract and make it, or stop the other pair making theirs.',
    sections: [
      { title: 'The auction', points: [
        'Each player has 13 cards. Starting with the dealer, everyone calls in turn: pass, or bid a number of tricks over six (1 to 7) and a trump suit or no trumps. “2♥” means: with hearts as trumps, our side will take eight tricks.',
        'Each bid must be higher than the last: a higher number, or the same number in a higher suit (clubs, diamonds, hearts, spades, then no trumps).',
        'Double the other side’s bid to score more if they fail (and more for them if they make it); redouble a double of yours.',
        'Three passes after a bid end the auction: the last bid is the contract. The partner who first named its suit is the declarer. If all four pass at once, the cards are dealt again.',
        'A simple guide: count points (ace 4, king 3, queen 2, jack 1). Open with 12 or more; 25 between you is about right for game (3NT, 4♥, 4♠, or five of a minor).',
      ] },
      { title: 'The play', points: [
        'The player on the declarer’s left leads the first card. Then the declarer’s partner, dummy, lays their hand face up, and the declarer plays it as well as their own.',
        'Follow suit if you can; if you can’t, play anything, including a trump. The highest trump wins the trick, or else the highest card of the suit led. The winner leads next.',
      ] },
      { title: 'Scoring (Chicago)', points: [
        'Four deals; the vulnerability is set by the deal (none, then the dealer’s side, the dealer’s side, then both). Being vulnerable raises both the bonuses and the penalties.',
        'Make your contract: 20 a trick in clubs or diamonds, 30 in hearts or spades, 40 then 30 in no trumps (doubled ×2, redoubled ×4). 100 or more is a game: a bonus of 300, or 500 when vulnerable; less is a part-score, 50. Slams earn more.',
        'Go down: the other side scores 50 a trick (100 vulnerable), more when doubled.',
        'After four deals the pair with more points wins; both partners score the win.',
        'If the room has a move timer and you run out of time, you pass, or your lowest legal card is played.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: `${COMPASS[id]} (${id[0].toUpperCase() + id.slice(1)})` })),
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Chicago, four deals',

  create(_c, _now, ctx) {
    return deal({ deal: 1, dealer: SEATS[0], scores: { NS: 0, EW: 0 }, sheet: [], lastTrick: null, result: null }, ctx.random);
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!SEATS.includes(seat)) return { error: 'You’re not in this game' };
    const a = raw as { type?: string; call?: string; card?: string };
    if (a?.type === 'resign') {
      const lose = pairOf(seat);
      const win = PAIRS.find((p) => p !== lose)!;
      return { state: { ...s, result: { winner: null, placings: [[...win], [...lose]], reason: 'resignation', teamWin: true } } };
    }
    if (actorOf(s) !== seat) return { error: 'It isn’t your turn' };
    if (s.phase === 'auction') {
      if (a?.type !== 'call' || typeof a.call !== 'string') return { error: 'Make a call' };
      if (!legalCalls(s.auction, seat).includes(a.call)) return { error: 'That call isn’t allowed now' };
      const auction = [...s.auction, { seat, call: a.call }];
      if (!auctionOver(auction)) return { state: { ...s, auction, turn: nextSeat(seat) } };
      const contract = contractOf(auction);
      // Passed out: the same dealer deals again.
      if (!contract) return { state: deal(s, ctx.random) };
      return { state: { ...s, auction, contract, phase: 'play', turn: nextSeat(contract.declarer) } };
    }
    if (a?.type !== 'play' || typeof a.card !== 'string') return { error: 'Play a card' };
    const from = s.turn;
    if (!s.hands[from].includes(a.card)) return { error: 'That card isn’t in the hand' };
    if (!legalPlays(s.hands[from], s.trick).includes(a.card)) return { error: 'Follow suit if you can' };
    const hands = { ...s.hands, [from]: s.hands[from].filter((c) => c !== a.card) };
    const trick = [...s.trick, { seat: from, card: a.card }];
    const next: BridgeState = { ...s, hands, trick, played: [...s.played, a.card], dummyShown: true };
    if (trick.length < 4) return { state: { ...next, turn: nextSeat(from) } };
    const winner = trickWinner(trick, s.contract!.strain);
    const tricks = { ...s.tricks, [sideOf(winner)]: s.tricks[sideOf(winner)] + 1 };
    const done: BridgeState = { ...next, trick: [], tricks, turn: winner, lastTrick: { cards: trick, winner } };
    return { state: tricks.NS + tricks.EW === 13 ? finishDeal(done, ctx.random) : done };
  },

  turn: (s) => (s.result ? [] : [actorOf(s)]),
  timeout(s, seat, now, ctx) {
    const move = s.phase === 'auction' ? { type: 'call', call: 'P' } : { type: 'play', card: [...legalPlays(s.hands[s.turn], s.trick)].sort((a, b) => rankOf(a) - rankOf(b))[0] };
    const r = this.act(s, seat, move, now, ctx);
    return 'error' in r ? s : r.state;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): BridgeView {
    const seated = !!viewer && SEATS.includes(viewer);
    const dummy = dummyOf(s);
    const over = !!s.result;
    const actor = over ? null : actorOf(s);
    const mine = seated && actor === viewer;
    return {
      deal: s.deal, dealer: s.dealer, vul: vulnerable(s.deal), phase: s.phase, you: seated ? viewer : null,
      hand: seated ? s.hands[viewer!] : null, dummy,
      dummyHand: dummy && s.dummyShown ? s.hands[dummy] : null,
      counts: Object.fromEntries(SEATS.map((p) => [p, s.hands[p].length])),
      auction: s.auction, contract: s.contract, turn: over ? null : s.turn, actor,
      calls: mine && s.phase === 'auction' ? legalCalls(s.auction, viewer!) : [],
      legal: mine && s.phase === 'play' ? legalPlays(s.hands[s.turn], s.trick) : [],
      trick: s.trick, tricks: s.tricks, played: s.played, scores: s.scores, sheet: s.sheet, lastTrick: s.lastTrick, result: s.result,
    };
  },
}, { keys: ['call', 'card'] });
