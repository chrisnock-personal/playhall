// Bots for the card games, Sea Battle and Realm Duel (#18). Each decides
// from its own seat's view (see src/shared/bots.ts): a Hold'em bot sees its
// own two cards and the board, never anyone else's.

import type { SeatId } from '../game';
import { handValue, MIN_BET, type BlackjackView } from './blackjack';
import { bestHand, compareRanks, type PokerView } from './poker';
import { COLOURS, playable, type ClashView, type Colour } from './colourclash';
import { SIZE, type SeaView } from './seabattle';
import { plainMove, value as shValue, type PoopView } from './poophead';
import { rankOf as hRank, type HeartsView } from './hearts';
import type { RouletteView } from './roulette';
import type { CrapsView } from './craps';
import { bestMelds as ginBest, worstDiscard as ginWorst, type GinView } from './ginrummy';
import { handScore as toScore, worstCard as toWorst, type ThirtyOneView } from './thirtyone';
import { estimateBid, rankOf as sRank, trickWinner, type SpadesView } from './spades';
import { BEATS as RD_BEATS, CREATURES, STYLES, attackValue, bestStyle, damage, type RealmView, type Style } from './realmduel';
import type { BattleView } from './realmbattle';

// ---- Blackjack: bet a little, then basic strategy ----

const cardValue = (c: string) => (c[0] === 'A' ? 11 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0]));

export function blackjackBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as BlackjackView;
  if (v.result) return null;
  const chips = v.chips[seat] ?? 0;
  if (v.phase === 'betting') {
    if (v.bets[seat] !== null || chips < MIN_BET) return null;
    return { type: 'bet', amount: Math.min(chips, Math.max(MIN_BET, Math.round((chips * 0.05) / 10) * 10)) };
  }
  if (v.turn !== seat) return null;
  const cards = v.cards[seat];
  const { total, soft } = handValue(cards);
  const up = v.dealer[0] ? cardValue(v.dealer[0]) : 10;
  const bet = v.bets[seat] ?? 0;
  const canDouble = cards.length === 2 && chips >= bet;
  if (canDouble && (total === 11 || (total === 10 && up <= 9) || (soft && total >= 16 && total <= 18 && up >= 4 && up <= 6))) return { type: 'double' };
  if (soft) return { type: total <= 17 || (total === 18 && up >= 9) ? 'hit' : 'stand' };
  if (total <= 11) return { type: 'hit' };
  if (total >= 17) return { type: 'stand' };
  if (total === 12) return { type: up >= 4 && up <= 6 ? 'stand' : 'hit' };
  return { type: up <= 6 ? 'stand' : 'hit' };
}

// ---- Hold'em: play the odds of its own two cards ----

const FULL = (() => { const d: string[] = []; for (const s of 'SHDC') for (const r of '23456789TJQKA') d.push(r + s); return d; })();

/** The chance its hand wins at a showdown against `opponents` random hands,
 *  by dealing out the rest of the board many times. */
function equity(hole: string[], board: string[], opponents: number, random: () => number, trials = 200): number {
  const known = new Set([...hole, ...board]);
  const rest = FULL.filter((c) => !known.has(c));
  let score = 0;
  for (let t = 0; t < trials; t++) {
    const deck = [...rest];
    const draw = () => deck.splice(Math.floor(random() * deck.length), 1)[0];
    const full = [...board];
    while (full.length < 5) full.push(draw());
    const mine = bestHand([...hole, ...full]).rank;
    let lost = false, ties = 0;
    for (let o = 0; o < opponents && !lost; o++) {
      const c = compareRanks(mine, bestHand([draw(), draw(), ...full]).rank);
      if (c < 0) lost = true; else if (c === 0) ties++;
    }
    if (!lost) score += 1 / (ties + 1);
  }
  return score / trials;
}

export function pokerBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as PokerView;
  if (v.result || v.toAct !== seat || !v.hole) return null;
  const opponents = v.order.filter((p) => p !== seat && v.inHand[p] && !v.folded[p]).length;
  const eq = equity(v.hole, v.board, Math.max(1, opponents), random);
  const stack = v.chips[seat];
  const toCall = Math.min(v.toCall, stack);
  const potOdds = toCall / (v.pot + toCall || 1);
  const strong = eq > 0.62 || (opponents === 1 && eq > 0.55);
  if (strong && v.canRaise && stack > toCall) {
    const target = Math.max(v.minRaiseTo, (v.bet[seat] ?? 0) + toCall + Math.round(v.pot * (0.5 + random() * 0.5)));
    return target >= (v.bet[seat] ?? 0) + stack ? { type: 'allin' } : { type: 'raise', to: target };
  }
  if (toCall === 0) {
    // Now and then a small bet with nothing much, so it isn't too easy to read.
    if (v.canRaise && random() < 0.08 && stack > v.minRaiseTo) return { type: 'raise', to: v.minRaiseTo };
    return { type: 'check' };
  }
  return eq >= potOdds - 0.03 ? { type: 'call' } : { type: 'fold' };
}

// ---- Colour Clash: keep the colour it holds most of, wilds last ----

export function clashBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as ClashView;
  if (v.result || v.turn !== seat || !v.hand || !v.top) return null;
  const most = (): Colour => COLOURS.map((c) => [c, v.hand!.filter((x) => x.colour === c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const can = v.hand.filter((c) => (v.drawn === null || c.id === v.drawn) && playable(c, v.top!, v.colour));
  if (!can.length) return v.drawn === null ? { type: 'draw' } : { type: 'pass' };
  const next = v.order[(v.order.indexOf(seat) + v.dir + v.order.length) % v.order.length];
  const nextLow = (v.counts[next] ?? 7) <= 2;
  const weight = (c: (typeof can)[number]) => (c.colour === 'wild' ? -10 : 0)
    + (nextLow && ['skip', 'draw2', 'reverse'].includes(c.value) ? 20 : 0)
    + v.hand!.filter((x) => x.colour === c.colour).length;
  const card = [...can].sort((a, b) => weight(b) - weight(a))[0];
  return card.colour === 'wild' ? { type: 'play', card: card.id, colour: most() } : { type: 'play', card: card.id };
}

// ---- Sea Battle: a shuffled fleet, then hunt on a checkerboard and finish off hits ----

export function seaBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as SeaView;
  if (v.result) return null;
  if (v.phase === 'placing') {
    if (v.ready[seat]) return null;
    return v.fleets[seat] ? { type: 'ready' } : { type: 'shuffle' };
  }
  if (v.turn !== seat) return null;
  const shots = v.shots[seat];
  const tried = new Set(shots.map((s) => s.cell));
  const hits = new Set(shots.filter((s) => s.hit).map((s) => s.cell));
  const free = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && !tried.has(r * SIZE + c);
  // Around hits: carry on along a line of two or more, else try the four sides.
  const along: number[] = [], beside: number[] = [];
  for (const h of hits) {
    const r = Math.floor(h / SIZE), c = h % SIZE;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (!free(r + dr, c + dc)) continue;
      const cell = (r + dr) * SIZE + c + dc;
      (hits.has((r - dr) * SIZE + (c - dc)) && r - dr >= 0 && r - dr < SIZE && c - dc >= 0 && c - dc < SIZE ? along : beside).push(cell);
    }
  }
  const pool = along.length ? along : beside.length ? beside
    : Array.from({ length: SIZE * SIZE }, (_, i) => i).filter((i) => !tried.has(i) && (Math.floor(i / SIZE) + (i % SIZE)) % 2 === 0);
  const cells = pool.length ? pool : Array.from({ length: SIZE * SIZE }, (_, i) => i).filter((i) => !tried.has(i));
  if (!cells.length) return null;
  return { type: 'fire', cell: cells[Math.floor(random() * cells.length)] };
}

// ---- Realm Duel: the creature that does best against what it has seen ----

export function realmBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as RealmView;
  if (v.result || v.mine || v.locked[seat]) return null;
  const mine = v.hands[seat];
  const foe = Object.entries(v.hands).find(([p]) => p !== seat)?.[1] ?? [];
  const seen = foe.filter((f): f is NonNullable<typeof f> => !!f && f.hp > 0);
  let best = -Infinity, pick: { creature: number; style: Style } | null = null;
  mine.forEach((f, i) => {
    if (!f || f.hp <= 0) return;
    const me = CREATURES[f.kind];
    for (const style of STYLES) {
      // Against creatures not seen yet: its own strength in that style.
      let s = attackValue(me, style) * 0.1 + f.hp * 0.05;
      for (const o of seen) {
        const them = CREATURES[o.kind];
        s += damage(me, them, style).damage - damage(them, me, bestStyle(them)).damage * 0.7;
      }
      if (s > best) { best = s; pick = { creature: i, style }; }
    }
  });
  return pick ? { type: 'choose', ...(pick as object) } : null;
}

// ---- Poophead: best cards face up; play low, keep 2s and 10s back ----

export function poopheadBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as PoopView;
  if (v.result || !v.hand) return null;
  if (v.phase === 'swap') {
    if (v.ready.includes(seat)) return null;
    const good = (c: string) => ('2T'.includes(c[0]) ? 20 : shValue(c));
    const bestHand = [...v.hand].sort((a, b) => good(b) - good(a))[0];
    const worstUp = [...v.up[seat]].sort((a, b) => good(a) - good(b))[0];
    return bestHand && worstUp && good(bestHand) > good(worstUp) ? { type: 'swap', hand: bestHand, up: worstUp } : { type: 'ready' };
  }
  if (v.turn !== seat) return null;
  const cards = v.from === 'hand' ? v.hand : v.from === 'up' ? v.up[seat] : [];
  return plainMove(v.phase, v.from, cards, v.pile, v.downCount[seat], random);
}

// ---- Hearts: pass danger, duck tricks, dump points when void ----

export function heartsBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as HeartsView;
  if (v.result || !v.cards) return null;
  const rank = hRank;
  if (v.phase === 'pass') {
    if (v.yourPass) return null;
    const danger = (c: string) => (c === 'QS' ? 100 : c === 'AS' || c === 'KS' ? 90 : c[1] === 'H' ? 40 + rank(c) : rank(c));
    return { type: 'pass', cards: [...v.cards].sort((a, b) => danger(b) - danger(a)).slice(0, 3) };
  }
  if (v.turn !== seat || !v.legal.length) return null;
  const legal = v.legal;
  const low = (xs: string[]) => [...xs].sort((a, b) => rank(a) - rank(b))[0];
  const high = (xs: string[]) => [...xs].sort((a, b) => rank(b) - rank(a))[0];
  if (!v.trick.length) {
    const safe = legal.filter((c) => c[1] !== 'H' && c !== 'QS' && !(c[1] === 'S' && rank(c) > rank('QS')));
    return { type: 'play', card: low(safe.length ? safe : legal) };
  }
  const led = v.trick[0].card[1];
  const following = legal.filter((c) => c[1] === led);
  if (following.length) {
    const winning = Math.max(...v.trick.filter((t) => t.card[1] === led).map((t) => rank(t.card)));
    const under = following.filter((c) => rank(c) < winning);
    const pointsOnTable = v.trick.some((t) => t.card[1] === 'H' || t.card === 'QS');
    const last = v.trick.length === v.order.length - 1;
    if (under.length) return { type: 'play', card: high(under) };
    // Can't duck: last to play on a clean trick, take it high; else lowest.
    return { type: 'play', card: last && !pointsOnTable && !following.includes('QS') ? high(following) : low(following) };
  }
  if (legal.includes('QS')) return { type: 'play', card: 'QS' };
  const hearts = legal.filter((c) => c[1] === 'H');
  return { type: 'play', card: hearts.length ? high(hearts) : high(legal) };
}

// ---- Spades: bid from its cards, help the pair make the contract, avoid bags ----

export function spadesBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as SpadesView;
  if (v.result || !v.cards || v.turn !== seat) return null;
  if (v.phase === 'bid') {
    const high = v.cards.filter((c) => sRank(c) >= sRank('JS'));
    const spadeCount = v.cards.filter((c) => c[1] === 'S').length;
    // Nil with no court cards and few, low spades; otherwise what the cards are worth.
    if (!high.length && spadeCount <= 2 && v.cards.every((c) => c[1] !== 'S' || sRank(c) < sRank('8S'))) return { type: 'bid', bid: 0 };
    return { type: 'bid', bid: estimateBid(v.cards) };
  }
  const legal = v.legal;
  if (!legal.length) return null;
  const low = (xs: string[]) => [...xs].sort((a, b) => (a[1] === 'S' ? 20 : 0) + sRank(a) - ((b[1] === 'S' ? 20 : 0) + sRank(b)))[0];
  const high = (xs: string[]) => [...xs].sort((a, b) => sRank(b) - sRank(a))[0];
  const partner = v.partner!;
  const myNil = v.bids[seat] === 0;
  const pair = [seat, partner];
  const contract = pair.reduce((n, p) => n + (v.bids[p] || 0), 0);
  const counted = pair.reduce((n, p) => n + (v.bids[p] ? v.tricks[p] : 0), 0);
  const need = !myNil && counted < contract;
  if (!v.trick.length) {
    if (myNil) return { type: 'play', card: low(legal) };
    const aces = legal.filter((c) => c[0] === 'A' && c[1] !== 'S');
    return { type: 'play', card: need && aces.length ? aces[0] : low(legal) };
  }
  const beats = (c: string, w: string) => (c[1] === w[1] ? sRank(c) > sRank(w) : c[1] === 'S');
  const winner = trickWinner(v.trick);
  const best = v.trick.find((t) => t.seat === winner)!.card;
  const winning = legal.filter((c) => beats(c, best));
  const losing = legal.filter((c) => !beats(c, best));
  if (myNil) return { type: 'play', card: losing.length ? high(losing) : low(legal) };
  const partnerHasIt = winner === partner && v.bids[partner] !== 0;
  if (need && !partnerHasIt && winning.length) return { type: 'play', card: low(winning) };
  // Partner on nil and about to take it: overtake if we can.
  if (winner === partner && v.bids[partner] === 0 && winning.length) return { type: 'play', card: low(winning) };
  return { type: 'play', card: low(losing.length ? losing : legal) };
}

// ---- Thirty-One: keep the best suit, take the discard when it helps, knock at about 25 ----

export function thirtyOneBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as ThirtyOneView;
  if (v.result || !v.cards || v.turn !== seat) return null;
  if (v.phase === 'draw') {
    const now = toScore(v.cards);
    // Knock a little earlier or later each time, around 25.
    if (v.canKnock && now >= 24 + Math.floor(random() * 4)) return { type: 'knock' };
    if (v.discardTop) {
      const withIt = [...v.cards, v.discardTop];
      const after = toScore(withIt.filter((c) => c !== toWorst(withIt, v.discardTop)));
      if (after > now) return { type: 'draw', from: 'discard' };
    }
    return { type: 'draw', from: 'deck' };
  }
  return { type: 'discard', card: toWorst(v.cards, v.took) };
}

// ---- Gin Rummy: take the discard when it lowers the deadwood, knock as soon as it can ----

export function ginBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as GinView;
  if (v.result || !v.cards || v.turn !== seat) return null;
  if (v.phase === 'draw') {
    if (v.discardTop) {
      const withIt = [...v.cards, v.discardTop];
      const after = ginBest(withIt.filter((c) => c !== ginWorst(withIt, v.discardTop))).points;
      if (after < v.deadwoodPoints) return { type: 'draw', from: 'discard' };
    }
    return { type: 'draw', from: 'deck' };
  }
  const card = ginWorst(v.cards, v.took);
  return { type: 'discard', card, knock: v.knockWith.includes(card) };
}

// ---- Bingo: just turn auto-mark on ----

export function bingoBot(view: unknown): unknown | null {
  const v = view as { auto: boolean; result: unknown; tickets: unknown };
  return v.result || !v.tickets || v.auto ? null : { type: 'auto', on: true };
}

// ---- Roulette: a favourite kind of bet, a few chips at a time ----

export function rouletteBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as RouletteView;
  if (v.result || v.ready.includes(seat) || !v.order.includes(seat)) return null;
  const chips = v.chips[seat];
  const bets = v.bets[seat] ?? {};
  if (Object.keys(bets).length || chips < 5) return { type: 'done' };
  // Each bot keeps to a style, from its seat: colours, dozens, or a lucky number.
  const style = seat.length % 3;
  const spot = style === 0 ? (random() < 0.5 ? 'red' : 'black') : style === 1 ? `d${1 + Math.floor(random() * 3)}` : `n${(seat.charCodeAt(0) * 7) % 37}`;
  const amount = Math.max(5, Math.min(chips, Math.round((chips * (style === 2 ? 0.02 : 0.05)) / 5) * 5));
  return { type: 'bet', spot, amount };
}

// ---- Craps: the pass line, backed with odds ----

export function crapsBot(view: unknown, seat: SeatId): unknown | null {
  const v = view as CrapsView;
  if (v.result || v.ready.includes(seat) || !v.order.includes(seat)) return null;
  const chips = v.chips[seat];
  const b = v.bets[seat];
  const unit = Math.max(5, Math.round((chips * 0.04) / 5) * 5);
  if (v.point === null && !b.pass && chips >= unit) return { type: 'bet', bet: 'pass', amount: unit };
  if (v.point !== null && b.pass && !b.odds && chips >= b.pass) return { type: 'bet', bet: 'odds', amount: b.pass };
  return { type: 'done' };
}

// ---- Realm Battle: focus on the team's target, with a creature that beats it ----

export function realmBattleBot(view: unknown, seat: SeatId, random: () => number = Math.random): unknown | null {
  const v = view as BattleView;
  if (v.result || !v.you || v.locked[seat] || v.out.includes(seat)) return null;
  const mine = (v.hands[seat] ?? []).map((f, i) => ({ f, i })).filter((x) => x.f && x.f.hp > 0);
  if (!mine.length) return null;
  const foes = v.order.filter((p) => v.team[p] !== v.team[seat] && !v.out.includes(p));
  if (!foes.length) return null;
  // Gang up: the enemy a team mate has already picked, else the one with the least left.
  const left = (p: string) => (v.hands[p] ?? []).reduce((n, f) => n + (f ? (f.hp > 0 ? f.hp : 0) : 25), 0);
  const mates = Object.entries(v.teamChoices).filter(([p]) => p !== seat).map(([, c]) => c.target).filter((t) => foes.includes(t));
  // No team mate's pick to follow (or a free-for-all): one of the weaker enemies, at random, so nobody is always picked on.
  const ranked = [...foes].sort((a, b) => left(a) - left(b));
  const ffa = v.mode === 'ffa';
  const weak = ffa ? ranked : ranked.filter((p) => left(p) <= left(ranked[0]) + 15);
  const target = mates[0] ?? weak[Math.floor(random() * weak.length)];
  // A creature whose element beats one the target has shown, else the healthiest.
  const shown = (v.hands[target] ?? []).filter((f) => f && f.hp > 0).map((f) => CREATURES[f!.kind].element);
  const beats = mine.filter((x) => shown.includes(RD_BEATS[CREATURES[x.f!.kind].element]));
  const pick = (beats.length ? beats : mine).sort((a, b) => b.f!.hp - a.f!.hp)[0];
  return { type: 'choose', creature: pick.i, style: bestStyle(CREATURES[pick.f!.kind]), target };
}
