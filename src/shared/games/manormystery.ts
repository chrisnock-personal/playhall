// Manor Mystery: the murder at Blackthorn Hall. A deduction game for 3-6
// players: work out who did it, with what and where, from the cards you hold
// and the cards other players show you. The generic deduction game with our
// own house, cast, objects and map (docs/manor-mystery.md); "Cluedo"/"Clue"
// is Hasbro's, and its characters, weapons, rooms and board are theirs.

import type { GameModule, GameResult, SeatId } from '../game';

export type Kind = 'suspect' | 'object' | 'room';

export const SUSPECTS = ['hale', 'okafor', 'vane', 'pike', 'rowe', 'ashby'] as const;
export const OBJECTS = ['hatpin', 'decanter', 'fireiron', 'mallet', 'rope', 'telescope'] as const;
/** The rooms in plan order: a 3 × 3 grid, top-left first. */
export const ROOMS = ['observatory', 'music', 'boathouse', 'maproom', 'chapel', 'greenhouse', 'armoury', 'cellar', 'nursery'] as const;
export type Suspect = (typeof SUSPECTS)[number];
export type ObjectId = (typeof OBJECTS)[number];
export type Room = (typeof ROOMS)[number];
export type CardId = Suspect | ObjectId | Room;

/** Every card: its kind, its name in a sentence and its title on the card. */
export const CARDS: Record<CardId, { kind: Kind; name: string; title: string }> = {
  hale: { kind: 'suspect', name: 'Admiral Hale', title: 'Admiral Hale' },
  okafor: { kind: 'suspect', name: 'Dr Okafor', title: 'Dr Okafor' },
  vane: { kind: 'suspect', name: 'Lady Vane', title: 'Lady Vane' },
  pike: { kind: 'suspect', name: 'Mr Pike', title: 'Mr Pike' },
  rowe: { kind: 'suspect', name: 'Miss Rowe', title: 'Miss Rowe' },
  ashby: { kind: 'suspect', name: 'Canon Ashby', title: 'Canon Ashby' },
  hatpin: { kind: 'object', name: 'the hatpin', title: 'Hatpin' },
  decanter: { kind: 'object', name: 'the decanter', title: 'Decanter' },
  fireiron: { kind: 'object', name: 'the fire iron', title: 'Fire iron' },
  mallet: { kind: 'object', name: 'the croquet mallet', title: 'Croquet mallet' },
  rope: { kind: 'object', name: 'the rope', title: 'Rope' },
  telescope: { kind: 'object', name: 'the telescope', title: 'Telescope' },
  observatory: { kind: 'room', name: 'the Observatory', title: 'Observatory' },
  music: { kind: 'room', name: 'the Music Room', title: 'Music Room' },
  boathouse: { kind: 'room', name: 'the Boathouse', title: 'Boathouse' },
  maproom: { kind: 'room', name: 'the Map Room', title: 'Map Room' },
  chapel: { kind: 'room', name: 'the Chapel', title: 'Chapel' },
  greenhouse: { kind: 'room', name: 'the Greenhouse', title: 'Greenhouse' },
  armoury: { kind: 'room', name: 'the Armoury', title: 'Armoury' },
  cellar: { kind: 'room', name: 'the Wine Cellar', title: 'Wine Cellar' },
  nursery: { kind: 'room', name: 'the Nursery', title: 'Nursery' },
};
export const ALL_CARDS = [...SUSPECTS, ...OBJECTS, ...ROOMS] as CardId[];

/** The hidden passages, between opposite corners of the hall. */
export const PASSAGES: [Room, Room][] = [['observatory', 'nursery'], ['boathouse', 'armoury']];
/** Where everyone starts: the middle of the house. */
export const START: Room = 'chapel';

/** The rooms you can move to from `room`: a door to each neighbour on the
 *  plan (not diagonally), plus a hidden passage from the corners. */
export function exits(room: Room): Room[] {
  const i = ROOMS.indexOf(room), r = Math.floor(i / 3), c = i % 3;
  const out: Room[] = [];
  if (r > 0) out.push(ROOMS[i - 3]);
  if (c > 0) out.push(ROOMS[i - 1]);
  if (c < 2) out.push(ROOMS[i + 1]);
  if (r < 2) out.push(ROOMS[i + 3]);
  for (const [a, b] of PASSAGES) { if (a === room) out.push(b); if (b === room) out.push(a); }
  return out;
}
export const passageFrom = (room: Room): Room | null => PASSAGES.find((p) => p.includes(room))?.find((x) => x !== room) ?? null;

export interface Solution { suspect: Suspect; object: ObjectId; room: Room }

export type LogEntry = { seat: SeatId; turn?: SeatId | null; auto?: boolean } & (
  | { kind: 'move'; room: Room }
  | { kind: 'suggest'; suspect: Suspect; object: ObjectId; room: Room }
  /** Couldn't show any of the suggested cards. */
  | { kind: 'pass' }
  /** Showed `to` a card: which one only `to` (and `seat`) see. */
  | { kind: 'show'; to: SeatId; card?: CardId }
  /** Nobody could show the suggester (`seat`) a card. */
  | { kind: 'nobody' }
  | { kind: 'accuse'; suspect: Suspect; object: ObjectId; room: Room; right: boolean }
  | { kind: 'end' }
  /** Resigned: their cards are laid face up for everyone. */
  | { kind: 'resign'; cards: CardId[] }
);

export interface Pending extends Solution {
  suggester: SeatId;
  /** Who has to show a card now (they hold more than one of the three). */
  refuter: SeatId;
}

export interface ManorState {
  /** A per-game id, for the browser's notebook marks. */
  key: string;
  order: SeatId[];
  /** Index into order of the player whose turn it is. */
  turn: number;
  envelope: Solution;
  hands: Record<SeatId, CardId[]>;
  positions: Record<SeatId, Room>;
  moved: boolean;
  suggested: boolean;
  pending: Pending | null;
  /** Accused wrongly: no more turns, but still show cards. */
  out: SeatId[];
  resigned: SeatId[];
  log: LogEntry[];
  result: GameResult | null;
}

export type ManorAction =
  | { type: 'move'; room: Room }
  | { type: 'suggest'; suspect: Suspect; object: ObjectId }
  | { type: 'show'; card: CardId }
  | { type: 'accuse'; suspect: Suspect; object: ObjectId; room: Room }
  | { type: 'end' }
  | { type: 'resign' };

/** What you know for certain: card → seat → has it or not. */
export type Notebook = Partial<Record<CardId, Record<SeatId, 'yes' | 'no'>>>;

export interface ManorView {
  key: string;
  order: SeatId[];
  /** The player whose turn it is (null once it's over). */
  turn: SeatId | null;
  positions: Record<SeatId, Room>;
  moved: boolean;
  suggested: boolean;
  pending: Pending | null;
  out: SeatId[];
  resigned: SeatId[];
  /** Your own cards; null for watchers. */
  hand: CardId[] | null;
  counts: Record<SeatId, number>;
  /** Resigned players' cards, face up for everyone. */
  faceUp: Record<SeatId, CardId[]>;
  /** When you have to show a card: the ones you may show. */
  mustShow: CardId[] | null;
  /** The case log; a shown card's name only in its two players' views. */
  log: LogEntry[];
  /** What you've seen (null for watchers). */
  notebook: Notebook | null;
  /** Revealed at the end only. */
  envelope: Solution | null;
  hands: Record<SeatId, CardId[]> | null;
  result: GameResult | null;
}

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue'];

function shuffle<T>(xs: readonly T[], random: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pick = <T>(xs: readonly T[], random: () => number): T => xs[Math.floor(random() * xs.length)];

/** One of each kind into the envelope; the rest dealt round the table. */
export function deal(seats: SeatId[], random: () => number): { envelope: Solution; hands: Record<SeatId, CardId[]> } {
  const envelope: Solution = { suspect: pick(SUSPECTS, random), object: pick(OBJECTS, random), room: pick(ROOMS, random) };
  const rest = shuffle(ALL_CARDS.filter((c) => c !== envelope.suspect && c !== envelope.object && c !== envelope.room), random);
  const hands: Record<SeatId, CardId[]> = Object.fromEntries(seats.map((p) => [p, []]));
  rest.forEach((c, i) => hands[seats[i % seats.length]].push(c));
  return { envelope, hands };
}

export const describeSuggestion = (x: { suspect: CardId; object: CardId; room: CardId }) =>
  `${CARDS[x.suspect].name}, with ${CARDS[x.object].name}, in ${CARDS[x.room].name}`;

const inRunning = (s: ManorState) => s.order.filter((p) => !s.out.includes(p) && !s.resigned.includes(p));
const current = (s: ManorState) => s.order[s.turn];

/** Stamp new log entries with whose turn it is after them (for replays). */
function stamp(prev: ManorState, next: ManorState): ManorState {
  if (next.log.length === prev.log.length) return next;
  const turn = next.result ? null : next.pending ? next.pending.suggester : current(next);
  return { ...next, log: next.log.map((e, i) => (i < prev.log.length ? e : { ...e, turn })) };
}

/** End the game. Places: the solver; then those still in the running; then
 *  those who accused wrongly; then those who resigned, last to go first. */
function finish(s: ManorState, winner: SeatId | null, reason: string): ManorState {
  const running = inRunning(s).filter((p) => p !== winner);
  const wrong = s.order.filter((p) => s.out.includes(p) && !s.resigned.includes(p));
  const placings = [winner ? [winner] : [], running, wrong, ...[...s.resigned].reverse().map((p) => [p])].filter((g) => g.length);
  // Nobody solved it: everyone loses, no points (user, 2026-11-16).
  return { ...s, pending: null, result: { winner, reason, placings, ...(winner ? {} : { nobodyWins: true }) } };
}

/** Next player in the running, or the end of the game if there's none. */
function nextTurn(s: ManorState): ManorState {
  const running = inRunning(s);
  if (!running.length) return finish(s, null, 'nobody solving the case');
  const nonResigned = s.order.filter((p) => !s.resigned.includes(p));
  if (nonResigned.length === 1 && running.length === 1) return finish(s, running[0], 'everyone else resigning');
  let t = s.turn;
  do { t = (t + 1) % s.order.length; } while (!running.includes(s.order[t]));
  return { ...s, turn: t, moved: false, suggested: false, pending: null };
}

const matches = (s: ManorState, seat: SeatId, x: Solution) => s.hands[seat].filter((c) => c === x.suspect || c === x.object || c === x.room);

/** Go round the table after `from`, asking each player in turn to show the
 *  suggester a card. One match is shown straight away; with two or more
 *  the player chooses, so the game waits for them. */
function refute(s: ManorState, x: Solution, suggester: SeatId, from: SeatId): ManorState {
  const n = s.order.length;
  let log = s.log;
  for (let k = s.order.indexOf(from) + 1; ; k++) {
    const p = s.order[k % n];
    if (p === suggester) break;
    if (s.resigned.includes(p)) continue; // their cards are face up for everyone
    const m = matches(s, p, x);
    if (m.length === 1) return { ...s, pending: null, log: [...log, { seat: p, kind: 'show', to: suggester, card: m[0] }] };
    if (m.length > 1) return { ...s, log, pending: { ...x, suggester, refuter: p } };
    log = [...log, { seat: p, kind: 'pass' }];
  }
  return { ...s, pending: null, log: [...log, { seat: suggester, kind: 'nobody' }] };
}

function show(s: ManorState, card: CardId, auto: boolean): ManorState {
  const p = s.pending!;
  const entry: LogEntry = { seat: p.refuter, kind: 'show', to: p.suggester, card, ...(auto ? { auto } : {}) };
  return { ...s, pending: null, log: [...s.log, entry] };
}

function resign(s: ManorState, seat: SeatId): ManorState {
  if (s.resigned.includes(seat)) return s;
  let next: ManorState = { ...s, resigned: [...s.resigned, seat], log: [...s.log, { seat, kind: 'resign', cards: s.hands[seat] }] };
  const p = s.pending;
  if (p && p.refuter === seat) next = refute({ ...next, pending: null }, p, p.suggester, seat);
  if (current(s) === seat) return nextTurn(next);
  const running = inRunning(next);
  if (!running.length) return finish(next, null, 'nobody solving the case');
  if (s.order.filter((x) => !next.resigned.includes(x)).length === 1 && running.length === 1) return finish(next, running[0], 'everyone else resigning');
  return next;
}

const isSuspect = (x: unknown): x is Suspect => SUSPECTS.includes(x as Suspect);
const isObject = (x: unknown): x is ObjectId => OBJECTS.includes(x as ObjectId);
const isRoom = (x: unknown): x is Room => ROOMS.includes(x as Room);

function apply(s: ManorState, seat: SeatId, raw: unknown): ManorState | string {
  if (s.result) return 'The game is over';
  const a = raw as Record<string, unknown> | null;
  if (!s.order.includes(seat)) return 'You aren’t in this game';
  if (a?.type === 'resign') return resign(s, seat);
  if (s.resigned.includes(seat)) return 'You’ve resigned from this game';
  if (a?.type === 'show') {
    if (!s.pending || s.pending.refuter !== seat) return 'Nobody needs a card from you now';
    const card = a.card as CardId;
    if (!matches(s, seat, s.pending).includes(card)) return 'Show one of the suggested cards that you hold';
    return show(s, card, false);
  }
  if (current(s) !== seat) return 'It isn’t your turn';
  if (s.pending) return `Waiting for ${s.pending.refuter} to show a card`;
  switch (a?.type) {
    case 'move': {
      if (s.moved) return 'You’ve already moved this turn';
      if (!isRoom(a.room) || !exits(s.positions[seat]).includes(a.room)) return 'You can’t get there from here';
      return { ...s, moved: true, positions: { ...s.positions, [seat]: a.room }, log: [...s.log, { seat, kind: 'move', room: a.room }] };
    }
    case 'suggest': {
      if (!s.moved) return 'Move first, then suggest';
      if (s.suggested) return 'You’ve already made a suggestion this turn';
      if (!isSuspect(a.suspect) || !isObject(a.object)) return 'Name a suspect and an object';
      const x: Solution = { suspect: a.suspect, object: a.object, room: s.positions[seat] };
      const next = { ...s, suggested: true, log: [...s.log, { seat, kind: 'suggest' as const, ...x }] };
      return refute(next, x, seat, seat);
    }
    case 'accuse': {
      if (!isSuspect(a.suspect) || !isObject(a.object) || !isRoom(a.room)) return 'Name a suspect, an object and a room';
      const x: Solution = { suspect: a.suspect, object: a.object, room: a.room };
      const e = s.envelope;
      const right = x.suspect === e.suspect && x.object === e.object && x.room === e.room;
      const next: ManorState = { ...s, log: [...s.log, { seat, kind: 'accuse', ...x, right }] };
      if (right) return finish(next, seat, 'solving the case');
      return nextTurn({ ...next, out: [...s.out, seat] });
    }
    case 'end':
      if (!s.moved) return 'Move first';
      return nextTurn({ ...s, log: [...s.log, { seat, kind: 'end' }] });
    default:
      return 'Unknown move';
  }
}

/** What `viewer` knows for certain from their hand, the cards shown to them,
 *  face-up cards and who couldn't show a card. */
export function notebookFor(s: Pick<ManorState, 'order' | 'hands' | 'log' | 'resigned'>, viewer: SeatId, hand: CardId[]): Notebook {
  const nb: Notebook = {};
  const set = (c: CardId, p: SeatId, v: 'yes' | 'no') => {
    const row = (nb[c] ??= {});
    if (row[p] === 'yes') return;
    row[p] = v;
    if (v === 'yes') for (const q of s.order) if (q !== p) row[q] = 'no';
  };
  for (const c of hand) set(c, viewer, 'yes');
  for (const c of ALL_CARDS) if (!hand.includes(c)) set(c, viewer, 'no');
  let last: Solution | null = null;
  for (const e of s.log) {
    if (e.kind === 'suggest') last = e;
    else if (e.kind === 'pass' && last) for (const c of [last.suspect, last.object, last.room]) set(c, e.seat, 'no');
    else if (e.kind === 'show' && e.to === viewer && e.card) set(e.card, e.seat, 'yes');
    else if (e.kind === 'resign') {
      for (const c of e.cards) set(c, e.seat, 'yes');
      for (const c of ALL_CARDS) if (!e.cards.includes(c)) set(c, e.seat, 'no');
    }
  }
  return nb;
}

/** The log as `viewer` may see it: a shown card's name only for the two
 *  players involved. */
const logFor = (log: LogEntry[], viewer: SeatId | null): LogEntry[] =>
  log.map((e) => (e.kind === 'show' && e.card && viewer !== e.seat && viewer !== e.to ? (({ card: _c, ...rest }) => rest)(e) : e));

export const manorMystery: GameModule<ManorState, Record<string, never>> = {
  id: 'manormystery',
  name: 'Manor Mystery',
  description: '3-6 players. Sir Edmund lies dead at Blackthorn Hall: work out who, with what and where before anyone else.',
  howToPlay: {
    goal: 'Be the first to name who killed Sir Edmund Blackthorn, with what, and in which room: the three cards sealed in the envelope.',
    sections: [
      { title: 'The cards', points: [
        'There are six suspects, six objects and nine rooms. One of each is sealed in the envelope at the start; the rest are dealt round the players.',
        'Any card you hold, or are shown, can’t be in the envelope. Your notebook fills in what you’ve seen; click a square to add your own ✓ ✗ or ? marks.',
      ] },
      { title: 'Your turn', points: [
        'Move to a room next door on the plan of the hall (not diagonally). Two hidden passages join opposite corners: the Observatory and the Nursery, the Boathouse and the Armoury. Everyone starts in the Chapel.',
        'Then you may make a suggestion: name a suspect and an object, in the room you’re in.',
        'Going round the table from your left, the first player holding any of the three must show you one of them, privately. If they hold more than one, they choose which. Everyone else only sees that a card was shown, and by whom.',
        'Then you may accuse, or end your turn.',
      ] },
      { title: 'Accusing and winning', points: [
        'On your turn you may accuse: name a suspect, an object and any room. Only one accusation per game.',
        'If all three are right, you win. If not, you’re out of the running: no more turns, but you still show cards when asked, and nobody sees the envelope until the end.',
        'If everyone accuses wrongly, nobody wins (no points for anyone) and the envelope is opened.',
        'Places: the solver first; players still in the running share second; those who accused wrongly come after.',
      ] },
      { title: 'Timing and leaving', points: [
        'If the room has a move timer and you run out of time: you move to a room at random and your turn ends; if you had to show a card, one is shown for you.',
        'A player who resigns lays their cards face up for everyone, and is skipped when cards are asked for.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 3,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Blackthorn Hall',

  create(_c, _now, ctx) {
    const { envelope, hands } = deal(ctx.seats, ctx.random);
    const key = Math.floor(ctx.random() * 2 ** 32).toString(36);
    return {
      key, order: ctx.seats, turn: 0, envelope, hands,
      positions: Object.fromEntries(ctx.seats.map((p) => [p, START])),
      moved: false, suggested: false, pending: null, out: [], resigned: [], log: [], result: null,
    };
  },

  act(s, seat, raw) {
    const r = apply(s, seat, raw);
    return typeof r === 'string' ? { error: r } : { state: stamp(s, r) };
  },

  turn: (s) => (s.result ? [] : s.pending ? [s.pending.refuter] : [current(s)]),
  /** Out of time: a refuter shows a matching card at random; the player
   *  whose turn it is moves at random (if they hadn't) and the turn ends. */
  timeout(s, seat, _now, ctx) {
    if (s.result) return s;
    if (s.pending) {
      if (s.pending.refuter !== seat) return s;
      return stamp(s, show(s, pick(matches(s, seat, s.pending), ctx.random), true));
    }
    if (current(s) !== seat) return s;
    let next = s;
    if (!s.moved) {
      const room = pick(exits(s.positions[seat]), ctx.random);
      next = { ...s, moved: true, positions: { ...s.positions, [seat]: room }, log: [...s.log, { seat, kind: 'move', room, auto: true }] };
    }
    return stamp(s, nextTurn({ ...next, log: [...next.log, { seat, kind: 'end', auto: true }] }));
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  /** Replays: what a watcher saw after each entry in the log, rebuilt from
   *  the log (which never holds a shown card's name for a watcher). The
   *  envelope and hands appear only in the last frame, once it's over. */
  replay(s) {
    let frame: ManorState = {
      ...s, turn: 0, positions: Object.fromEntries(s.order.map((p) => [p, START])),
      moved: false, suggested: false, pending: null, out: [], resigned: [], log: [], result: null,
    };
    const frames: ManorView[] = [this.view(frame, 0, null) as ManorView];
    for (const e of s.log) {
      frame = {
        ...frame, log: [...frame.log, e],
        positions: e.kind === 'move' ? { ...frame.positions, [e.seat]: e.room } : frame.positions,
        out: e.kind === 'accuse' && !e.right ? [...frame.out, e.seat] : frame.out,
        resigned: e.kind === 'resign' ? [...frame.resigned, e.seat] : frame.resigned,
        turn: e.turn ? s.order.indexOf(e.turn) : frame.turn,
      };
      frames.push(this.view(frame, 0, null) as ManorView);
    }
    if (s.result) frames[frames.length - 1] = this.view({ ...frame, result: s.result }, 0, null) as ManorView;
    return frames;
  },

  view(s, _now, viewer): ManorView {
    const seated = viewer !== null && s.order.includes(viewer);
    const hand = seated ? s.hands[viewer] : null;
    const over = !!s.result;
    return {
      key: s.key, order: s.order, turn: over ? null : current(s), positions: s.positions,
      moved: s.moved, suggested: s.suggested, pending: s.pending, out: s.out, resigned: s.resigned,
      hand, counts: Object.fromEntries(s.order.map((p) => [p, s.hands[p].length])),
      faceUp: Object.fromEntries(s.resigned.map((p) => [p, s.hands[p]])),
      mustShow: seated && s.pending?.refuter === viewer ? matches(s, viewer, s.pending) : null,
      log: logFor(s.log, viewer),
      notebook: seated ? notebookFor(s, viewer, hand!) : null,
      envelope: over ? s.envelope : null,
      hands: over ? s.hands : null,
      result: s.result,
    };
  },
};
