// A Manor Mystery computer player (#18): it reasons the way a careful player
// does with the notebook. Besides what it has seen, it uses every card shown
// to someone else (the shower holds one of the three suggested: rule out two
// and it's the third), full hands (once all of a player's cards are known,
// they hold nothing else), and cards nobody holds (they're in the envelope).
// It wanders towards rooms it hasn't ruled out, asks about what's still
// open, and accuses only when it's certain.

import type { SeatId } from '../game';
import { ALL_CARDS, OBJECTS, ROOMS, SUSPECTS, exits, type CardId, type ManorView, type Solution } from './manormystery';

type Mark = 'yes' | 'no';

/** Everything the bot can be sure of: card → seat → yes/no, and the envelope so far. */
export function deduce(v: ManorView, me: SeatId): { holds: Record<string, Record<SeatId, Mark>>; envelope: Partial<Solution>; open: Record<'suspect' | 'object' | 'room', CardId[]> } {
  const holds: Record<string, Record<SeatId, Mark>> = {};
  for (const c of ALL_CARDS) holds[c] = { ...(v.notebook?.[c] ?? {}) };
  const set = (c: CardId, p: SeatId, m: Mark): boolean => {
    const row = holds[c];
    if (row[p] === m) return false;
    if (row[p]) return false; // never overwrite what's certain
    row[p] = m;
    if (m === 'yes') for (const q of v.order) if (q !== p && !row[q]) row[q] = 'no';
    return true;
  };
  // Cards shown to other people: which one is hidden, but it's one of the three.
  const shows: { seat: SeatId; cards: CardId[] }[] = [];
  let last: Solution | null = null;
  for (const e of v.log) {
    if (e.kind === 'suggest') last = e;
    else if (e.kind === 'show' && last && e.to !== me && e.seat !== me) shows.push({ seat: e.seat, cards: [last.suspect, last.object, last.room] });
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const sh of shows) {
      if (sh.cards.some((c) => holds[c][sh.seat] === 'yes')) continue;
      const maybe = sh.cards.filter((c) => holds[c][sh.seat] !== 'no');
      if (maybe.length === 1) changed = set(maybe[0], sh.seat, 'yes') || changed;
    }
    for (const p of v.order) {
      const known = ALL_CARDS.filter((c) => holds[c][p] === 'yes').length;
      if (known >= (v.counts[p] ?? 99)) for (const c of ALL_CARDS) if (!holds[c][p]) changed = set(c, p, 'no') || changed;
    }
  }
  const held = (c: CardId) => v.order.some((p) => holds[c][p] === 'yes');
  const nobody = (c: CardId) => v.order.every((p) => holds[c][p] === 'no');
  const kinds = { suspect: [...SUSPECTS] as CardId[], object: [...OBJECTS] as CardId[], room: [...ROOMS] as CardId[] };
  const open = { suspect: [] as CardId[], object: [] as CardId[], room: [] as CardId[] };
  const envelope: Partial<Solution> = {};
  for (const k of ['suspect', 'object', 'room'] as const) {
    const sure = kinds[k].find(nobody);
    open[k] = sure ? [sure] : kinds[k].filter((c) => !held(c));
    if (open[k].length === 1) (envelope as Record<string, CardId>)[k] = open[k][0];
  }
  return { holds, envelope, open };
}

export function manorBot(view: unknown, seat: SeatId, random: () => number): unknown | null {
  const v = view as ManorView;
  if (v.result || !v.hand) return null;
  const pickOf = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  // Asked to show a card: one already shown to this player if possible (gives nothing new away).
  if (v.pending?.refuter === seat && v.mustShow?.length) {
    const before = v.log.filter((e) => e.kind === 'show' && e.seat === seat && e.to === v.pending!.suggester && 'card' in e && e.card).map((e) => (e as { card: CardId }).card);
    return { type: 'show', card: v.mustShow.find((c) => before.includes(c)) ?? pickOf(v.mustShow) };
  }
  if (v.turn !== seat || v.pending || v.out.includes(seat)) return null;
  const { envelope, open } = deduce(v, seat);
  if (envelope.suspect && envelope.object && envelope.room) return { type: 'accuse', ...envelope };
  if (!v.moved) {
    const here = v.positions[seat];
    const doors = exits(here);
    const useful = doors.filter((r) => open.room.includes(r));
    return { type: 'move', room: pickOf(useful.length ? useful : doors) };
  }
  if (!v.suggested) {
    // Ask about what's still open; once a kind is known, name it (it can't be shown).
    const suspect = envelope.suspect ?? pickOf(open.suspect.length ? open.suspect : [...SUSPECTS]);
    const object = envelope.object ?? pickOf(open.object.length ? open.object : [...OBJECTS]);
    return { type: 'suggest', suspect, object };
  }
  return { type: 'end' };
}

