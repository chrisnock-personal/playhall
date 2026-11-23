// A Bridge computer player (#37). Bidding: a simple natural system, the one
// the rules describe. Count points (ace 4, king 3, queen 2, jack 1, plus one
// for each card over four in a suit); open the longest suit (a five-card major
// first) or 1NT with 15-17 and an even shape; support partner with three or
// more of their major; otherwise show a new suit or bid no trumps. From what
// partner has shown, aim for a part-score, game (about 25 points between
// you) or slam (33), and stop there. Play: the usual rules of thumb.

import type { SeatId } from '../game';
import type { Card } from './blackjack';
import {
  bidRank, hcp, isBid, partnerOf, rankOf, sideOf, suitOf, trickWinner,
  type BridgeView, type Call, type Strain,
} from './bridge';

const lengths = (hand: Card[]) => Object.fromEntries(['C', 'D', 'H', 'S'].map((s) => [s, hand.filter((c) => suitOf(c) === s).length])) as Record<string, number>;
const points = (hand: Card[]) => hcp(hand) + Object.values(lengths(hand)).reduce((n, l) => n + Math.max(0, l - 5), 0);
const balanced = (hand: Card[]) => { const l = Object.values(lengths(hand)).sort((a, b) => a - b); return l[0] >= 2 && l[1] >= 3; };

/** What partner's calls say: points (about) and suits (at least this many cards). */
function partnerShows(v: BridgeView, me: SeatId): { pts: number; suits: Record<string, number>; nt: boolean } {
  const p = partnerOf(me);
  const mine = v.auction.filter((a) => a.seat === p);
  const suits: Record<string, number> = { C: 0, D: 0, H: 0, S: 0 };
  let pts = 0, nt = false;
  for (const [i, a] of mine.entries()) {
    if (!isBid(a.call)) { if (i === 0 && a.call === 'P') pts = Math.max(pts, 3); continue; }
    const s = a.call[1], level = Number(a.call[0]);
    const before = v.auction.slice(0, v.auction.indexOf(a));
    const opened = !before.some((x) => isBid(x.call));
    if (s === 'N') { nt = true; pts = Math.max(pts, opened && level === 1 ? 16 : level >= 3 ? 13 : 9 + level); continue; }
    // Supporting my suit, or a suit of their own.
    const raising = before.some((x) => x.seat === me && isBid(x.call) && x.call[1] === s);
    if (raising) suits[s] = Math.max(suits[s], 3);
    else suits[s] = Math.max(suits[s], opened ? 4 : 4);
    pts = Math.max(pts, opened ? 13 : raising ? 6 + (level - 2) * 3 : 8 + (level - 1) * 2);
  }
  return { pts, suits, nt };
}

/** The bot's call. */
export function chooseCall(v: BridgeView, me: SeatId): Call {
  const hand = v.hand!;
  const len = lengths(hand);
  const myPts = points(hand);
  const bids = v.auction.filter((a) => isBid(a.call));
  const last = bids[bids.length - 1];
  const legal = new Set(v.calls);
  const ours = (seat: SeatId) => sideOf(seat) === sideOf(me);
  const lowest = (strain: string) => { for (let l = 1; l <= 7; l++) if (legal.has(`${l}${strain}`)) return l; return 8; };
  const bid = (level: number, strain: string): Call => (legal.has(`${level}${strain}`) ? `${level}${strain}` : 'P');
  const longest = (['S', 'H', 'D', 'C'] as const).reduce((a, b) => (len[b] > len[a] ? b : a));

  // Nobody has bid: open, or pass.
  if (!bids.length) {
    if (hcp(hand) >= 15 && hcp(hand) <= 17 && balanced(hand)) return '1N';
    if (myPts < 13 && hcp(hand) < 12) return 'P';
    if (len.S >= 5 || len.H >= 5) return len.S >= len.H ? '1S' : '1H';
    return len.D > len.C ? '1D' : '1C';
  }
  const partner = partnerShows(v, me);
  const partnerBid = v.auction.some((a) => a.seat === partnerOf(me) && isBid(a.call));
  const iBid = v.auction.some((a) => a.seat === me && isBid(a.call));

  // Only the other side has bid: overcall a good five-card suit, else pass.
  if (!partnerBid && !iBid) {
    if (myPts >= 11 && len[longest] >= 5) { const l = lowest(longest); return l <= 2 ? bid(l, longest) : 'P'; }
    return 'P';
  }
  // Our side is bidding: find the strain (an eight-card fit, else no trumps) and the level.
  const total = myPts + partner.pts;
  let strain: Strain = 'N';
  for (const s of ['S', 'H', 'D', 'C'] as const) if (len[s] + partner.suits[s] >= 8) { strain = s; break; }
  if (strain === 'N' && !partnerBid && len[longest] >= 6) strain = longest;
  if (strain === 'N' && !partner.nt && !balanced(hand) && partnerBid) {
    // No fit yet: show a new suit of my own at the lowest level, if it's cheap.
    const mySuit = (['S', 'H', 'D', 'C'] as const).find((s) => len[s] >= 4 && partner.suits[s] === 0 && lowest(s) <= 2);
    if (mySuit && total < 33 && !iBid) return bid(lowest(mySuit), mySuit);
  }
  const game = strain === 'N' ? 3 : strain === 'H' || strain === 'S' ? 4 : 5;
  const target = total >= 37 ? 7 : total >= 33 ? 6 : total >= 26 ? game : total >= 23 ? Math.min(game, 3) : strain === 'N' ? 1 : 2;
  // Already high enough (ours), or the other side has outbid what we want: pass.
  if (last && ours(last.seat) && Number(last.call[0]) >= target) return 'P';
  if (last && !ours(last.seat) && bidRank(last.call) >= bidRank(`${target}${strain}`)) return 'P';
  const l = lowest(strain);
  if (l > target) return 'P';
  // Jump straight to game or slam when it's clear; otherwise the cheapest bid.
  return bid(target >= game ? target : l, strain);
}

/** The bot's card for the hand whose turn it is (its own, or dummy's as declarer). */
export function chooseCard(v: BridgeView, me: SeatId): Card {
  const c = v.contract!;
  const handFor = v.turn === me ? v.hand! : v.dummyHand!;
  const legal = v.legal;
  const trump = c.strain === 'N' ? null : c.strain;
  const low = (xs: Card[]) => [...xs].sort((a, b) => rankOf(a) - rankOf(b))[0];
  const high = (xs: Card[]) => [...xs].sort((a, b) => rankOf(b) - rankOf(a))[0];
  const seen = new Set([...v.played, ...handFor, ...(v.dummyHand ?? []), ...(v.hand ?? [])]);
  const outstanding = (suit: string) => '23456789TJQKA'.split('').map((r) => r + suit).filter((x) => !seen.has(x));
  const isTop = (card: Card) => outstanding(suitOf(card)).every((x) => rankOf(x) < rankOf(card));
  const declaring = sideOf(me) === sideOf(c.declarer);

  if (!v.trick.length) {
    if (declaring) {
      // Draw trumps while the defenders still have some.
      const trumps = trump ? legal.filter((x) => suitOf(x) === trump) : [];
      if (trump && trumps.length && outstanding(trump).length) return high(trumps);
      const winners = legal.filter(isTop);
      if (winners.length) return winners[0];
      return low(legal);
    }
    // Defending: lead a winner, else top of a sequence, else fourth best of the longest side suit.
    const winners = legal.filter((x) => isTop(x) && suitOf(x) !== trump);
    if (winners.length) return winners[0];
    const bySuit = ['S', 'H', 'D', 'C'].filter((s) => s !== trump).map((s) => legal.filter((x) => suitOf(x) === s).sort((a, b) => rankOf(b) - rankOf(a))).filter((xs) => xs.length);
    if (!bySuit.length) return low(legal);
    const seq = bySuit.find((xs) => xs.length >= 2 && rankOf(xs[0]) >= rankOf('TS') && rankOf(xs[0]) - rankOf(xs[1]) === 1);
    if (seq) return seq[0];
    const longest = bySuit.reduce((a, b) => (b.length > a.length ? b : a));
    return longest[Math.min(3, longest.length - 1)];
  }
  const led = suitOf(v.trick[0].card);
  const winnerSeat = trickWinner(v.trick, c.strain);
  const winning = v.trick.find((t) => t.seat === winnerSeat)!.card;
  const partnerWinning = sideOf(winnerSeat) === sideOf(v.turn!);
  const beats = (x: Card) => (suitOf(x) === suitOf(winning) ? rankOf(x) > rankOf(winning) : trump !== null && suitOf(x) === trump);
  const following = legal.filter((x) => suitOf(x) === led);
  const last = v.trick.length === 3;
  if (following.length) {
    if (partnerWinning && (last || isTop(winning))) return low(following);
    const over = following.filter(beats);
    // Second hand low (unless it's the last card to come), third and fourth hand win cheaply.
    if (v.trick.length === 1 && !last && !over.some(isTop)) return low(following);
    return over.length ? low(over) : low(following);
  }
  // Can't follow: ruff if the other side is winning, else throw the lowest card from the weakest suit.
  if (!partnerWinning && trump) {
    const ruffs = legal.filter((x) => suitOf(x) === trump && beats(x));
    if (ruffs.length) return low(ruffs);
  }
  const discards = legal.filter((x) => suitOf(x) !== trump);
  return low(discards.length ? discards : legal);
}

export function bridgeBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as BridgeView;
  if (v.result || v.actor !== seat || !v.hand) return null;
  if (v.phase === 'auction') return { type: 'call', call: chooseCall(v, seat) };
  return { type: 'play', card: chooseCard(v, seat) };
}

