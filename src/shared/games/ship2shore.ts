// Ship2Shore: a hidden-role game for 5-11 players aboard the SS Marigold,
// a merchant ship that has lost her convoy in the Bay of Biscay in 1943.
// The Royal Navy steer for Plymouth, the enemy spies for a U-boat rendezvous
// and the black-market Fixer for Lisbon; suspects go to the sharks.
// Our own game (docs/ship2shore.md), inspired by the hidden-faction steering
// genre: the setting, names, deck, chart and rules text are ours.

import type { GameContext, GameModule, GameResult, SeatId } from '../game';
import { randInt, withHistory, type GameHistory } from './history';

// ---- The pieces ----

export type Faction = 'navy' | 'spy' | 'bm';
/** What you were dealt. A bribed player keeps their role but changes faction. */
export type Role = 'navy' | 'spy' | 'fixer' | 'smuggler';
export type Dir = 'ne' | 'sw' | 's';
export type OrderKind = 'steady' | 'shoreleave' | 'armslocker' | 'confiscated' | 'intercept' | 'spotter' | 'contraband';
/** A course order: direction and kind, e.g. 'ne.armslocker'. */
export type Order = `${Dir}.${OrderKind}`;
export type ChartAction = 'inspect' | 'interrogate' | 'silence' | 'sharks';

export const FACTIONS: Record<Faction, { name: string; short: string; port: string; dir: Dir }> = {
  navy: { name: 'the Royal Navy', short: 'Royal Navy', port: 'Plymouth', dir: 'ne' },
  spy: { name: 'the spies', short: 'Spy', port: 'the U-boat rendezvous', dir: 'sw' },
  bm: { name: 'the Black Market', short: 'Black Market', port: 'Lisbon', dir: 's' },
};
export const ROLES: Record<Role, { title: string; faction: Faction; line: string }> = {
  navy: { title: 'Royal Navy', faction: 'navy', line: 'Bring the Marigold home to Plymouth.' },
  spy: { title: 'Enemy agent', faction: 'spy', line: 'Bring the Marigold to the U-boat rendezvous.' },
  fixer: { title: 'The Fixer', faction: 'bm', line: 'Bring the Marigold to Lisbon, or be thrown to the sharks: a body was never found.' },
  smuggler: { title: 'Smuggler', faction: 'bm', line: 'The Fixer’s hand aboard. Bring the Marigold to Lisbon.' },
};
export const DIRS: Record<Dir, { name: string; arrow: string; toward: string }> = {
  ne: { name: 'north-east', arrow: '↗', toward: 'Plymouth' },
  sw: { name: 'south-west', arrow: '↙', toward: 'the rendezvous' },
  s: { name: 'south', arrow: '↓', toward: 'Lisbon' },
};
export const ORDERS: Record<OrderKind, { title: string; effect: string }> = {
  steady: { title: 'Steady as she goes', effect: 'No effect.' },
  shoreleave: { title: 'Shore leave', effect: 'The captain is relieved: the player with the fewest orders carried out takes command.' },
  armslocker: { title: 'Arms locker', effect: 'The helmsman gains a round.' },
  confiscated: { title: 'Confiscated', effect: 'The helmsman loses a round.' },
  intercept: { title: 'Radio intercept', effect: 'A player the captain picks secretly reads the last three discarded orders.' },
  spotter: { title: 'Spotter', effect: 'A player the captain picks looks at the top order and keeps it there or discards it.' },
  contraband: { title: 'Contraband', effect: 'The Fixer’s move: a bribe, a cash stash or a look at the bridge.' },
};
export const ACTIONS: Record<ChartAction, { title: string; text: string }> = {
  inspect: { title: 'Kit inspection', text: 'The captain secretly sees one player’s allegiance.' },
  interrogate: { title: 'Interrogation', text: 'A player the captain picks is shown, to everyone, to be not one of the two factions they aren’t (picked at random).' },
  silence: { title: 'Radio silence', text: 'A player the captain picks may no longer talk or type, and can’t become captain.' },
  sharks: { title: 'Sharks', text: 'The captain throws another player overboard. If that’s the Fixer, the Black Market wins.' },
};

/** The deck: 28 orders. North-east and south-west are even; south is the
 *  Fixer's way and the thinnest. */
export const DECK: [Order, number][] = [
  ['ne.steady', 6], ['ne.shoreleave', 1], ['ne.armslocker', 2], ['ne.confiscated', 2],
  ['sw.steady', 6], ['sw.shoreleave', 1], ['sw.intercept', 2], ['sw.spotter', 2],
  ['s.steady', 1], ['s.shoreleave', 1], ['s.contraband', 4],
];
export const FULL_DECK: Order[] = DECK.flatMap(([o, n]) => Array<Order>(n).fill(o));
export const orderDir = (o: Order) => o.split('.')[0] as Dir;
export const orderKind = (o: Order) => o.split('.')[1] as OrderKind;
export const orderName = (o: Order) => `${ORDERS[orderKind(o)].title} (${DIRS[orderDir(o)].name})`;

// ---- The chart ----

/** A sea area: `a` counts north-east steps (south-west takes one back), `b`
 *  south steps. The ship starts at 0,0. a = +reach is Plymouth, a = -reach
 *  the U-boat rendezvous, b = depth Lisbon. */
export interface Pos { a: number; b: number }
export interface Chart {
  id: 'short' | 'long';
  name: string;
  reach: number;
  depth: number;
  /** Crossing south into this row tops everyone aboard up to three rounds. */
  resupplyRow: number | null;
  actions: Record<string, ChartAction>;
}

/** Rows of sea areas, west to east (a = -reach+1 … reach-1), north first:
 *  . nothing, i inspection, q interrogation, r radio silence, x sharks. */
function rows(lines: string[]): Record<string, ChartAction> {
  const code: Record<string, ChartAction> = { i: 'inspect', q: 'interrogate', r: 'silence', x: 'sharks' };
  const out: Record<string, ChartAction> = {};
  const reach = (lines[0].length + 1) / 2;
  lines.forEach((line, b) => [...line].forEach((ch, k) => { if (code[ch]) out[`${k - reach + 1},${b}`] = code[ch]; }));
  return out;
}

export const CHARTS: Record<'short' | 'long', Chart> = {
  // 5-7 players: seven areas across, five down.
  short: {
    id: 'short', name: 'The short chart', reach: 4, depth: 5, resupplyRow: null,
    actions: rows([
      'x.i..q.',
      '.r.q.xi',
      'i.x.r..',
      '.q.x.i.',
      'r..i.q.',
    ]),
  },
  // 8-11 players: nine across, six down, and a resupply line halfway.
  long: {
    id: 'long', name: 'The long chart', reach: 5, depth: 6, resupplyRow: 3,
    actions: rows([
      '.x.i..q.x',
      'i.r.q.x..',
      '.q.x.i.r.',
      'x.i.x..q.',
      '.r.q.x.i.',
      'q..i.r..x',
    ]),
  },
};
export const chartFor = (players: number): Chart => CHARTS[players <= 7 ? 'short' : 'long'];
export const actionAt = (chart: Chart, p: Pos): ChartAction | null => chart.actions[`${p.a},${p.b}`] ?? null;
const STEP: Record<Dir, Pos> = { ne: { a: 1, b: 0 }, sw: { a: -1, b: 0 }, s: { a: 0, b: 1 } };
/** The port at `p`, if the ship has reached one. */
export function portAt(chart: Chart, p: Pos): Faction | null {
  if (p.a >= chart.reach) return 'navy';
  if (p.a <= -chart.reach) return 'spy';
  if (p.b >= chart.depth) return 'bm';
  return null;
}

// ---- Who's who ----

/** How many of each role for `n` players (docs/ship2shore.md). */
export function roleCounts(n: number): Record<Role, number> {
  const table: Record<number, [number, number]> = { 5: [3, 1], 6: [3, 2], 7: [4, 2], 8: [4, 3], 9: [5, 3], 10: [5, 4], 11: [5, 4] };
  const [navy, spy] = table[n] ?? [Math.max(1, n - 2), 1];
  return { navy, spy, fixer: 1, smuggler: n >= 11 ? 1 : 0 };
}
/** Rounds needed to overthrow the captain. */
export const thresholdFor = (n: number) => (n <= 7 ? 3 : n <= 9 ? 4 : 5);
/** From this many players, last round's first officer and captain rest too. */
export const BIG_GAME = 8;
export const START_AMMO = 3;

// ---- State ----

export type Phase = 'pick' | 'vote' | 'tiebreak' | 'draw' | 'steer' | 'emergency' | 'target' | 'spot' | 'contraband';
/** What the captain is picking a player for. */
export type TargetKind = ChartAction | 'intercept' | 'spotter';
type Step = { k: 'chart'; action: ChartAction } | { k: 'order'; order: Order } | { k: 'resupply' };

export type LogEntry = { auto?: boolean } & (
  | { k: 'round'; n: number; captain: SeatId }
  | { k: 'pick'; seat: SeatId; officer: SeatId; helm: SeatId }
  /** Every vote, shown once all are in. */
  | { k: 'vote'; votes: Record<SeatId, number>; total: number; need: number; mutiny: boolean; captain?: SeatId }
  | { k: 'tiebreak'; seat: SeatId; captain: SeatId }
  | { k: 'abandon'; seat: SeatId }
  | { k: 'emergency'; seat: SeatId; helm: SeatId }
  | { k: 'order'; seat: SeatId; helm: SeatId; order: Order; to: Pos }
  | { k: 'resupply' }
  | { k: 'action'; seat: SeatId; action: ChartAction; target: SeatId | null; not?: Faction }
  | { k: 'shoreleave'; seat: SeatId; captain: SeatId }
  | { k: 'ammo'; seat: SeatId; delta: number }
  | { k: 'intercept'; seat: SeatId; target: SeatId | null }
  | { k: 'spotter'; seat: SeatId; target: SeatId | null }
  | { k: 'spot'; seat: SeatId; kept: boolean }
  | { k: 'contraband'; done: boolean }
  | { k: 'resign'; seat: SeatId }
  | { k: 'end'; faction: Faction | null; reason: string }
);

/** Things only one player knows. */
export type Secret = { round: number } & (
  | { k: 'drew'; cards: Order[]; kept: Order }
  | { k: 'steered'; cards: Order[]; played: Order }
  | { k: 'inspect'; target: SeatId; faction: Faction }
  | { k: 'intercept'; cards: Order[] }
  | { k: 'spot'; card: Order; kept: boolean }
  | { k: 'bridge'; seen: Record<SeatId, Faction> }
  | { k: 'bribe'; target: SeatId }
  | { k: 'bribed'; by: SeatId }
  | { k: 'stash'; gifts: SeatId[] }
  | { k: 'cash'; n: number }
);

export interface ShipState {
  config: Record<string, never>;
  order: SeatId[];
  chart: 'short' | 'long';
  threshold: number;
  roles: Record<SeatId, Role>;
  /** Allegiance now: a bribed player's is 'bm'. */
  faction: Record<SeatId, Faction>;
  ammo: Record<SeatId, number>;
  /** Orders carried out as captain, for shore leave. */
  carried: Record<SeatId, number>;
  overboard: SeatId[];
  silenced: SeatId[];
  /** Inspected or interrogated: can't be bribed. */
  checked: SeatId[];
  resigned: SeatId[];
  ship: Pos;
  round: number;
  captain: SeatId;
  officer: SeatId | null;
  helm: SeatId | null;
  offWatch: SeatId[];
  phase: Phase;
  /** This round's captain was voted in: no second vote. */
  mutinied: boolean;
  votes: Record<SeatId, number>;
  tied: SeatId[];
  hands: Record<SeatId, Order[]>;
  kept: Record<SeatId, Order>;
  helmCards: Order[];
  deck: Order[];
  discard: Order[];
  played: Order[];
  todo: Step[];
  target: TargetKind | null;
  spotter: SeatId | null;
  spotCard: Order | null;
  acked: SeatId[];
  secrets: Record<SeatId, Secret[]>;
  log: LogEntry[];
  result: GameResult | null;
  history?: GameHistory;
}

export type ShipAction =
  | { type: 'pick'; officer: SeatId; helm: SeatId }
  | { type: 'vote'; rounds: number }
  | { type: 'tiebreak'; target: SeatId }
  | { type: 'keep'; index: number }
  | { type: 'steer'; index: number }
  | { type: 'abandon' }
  | { type: 'emergency'; target: SeatId }
  | { type: 'target'; target: SeatId }
  | { type: 'spot'; keep: boolean }
  | { type: 'contraband'; option: 'bribe' | 'cash' | 'bridge'; target?: SeatId; gifts?: string }
  | { type: 'ack' }
  | { type: 'resign' };

export interface ShipView {
  order: SeatId[];
  chart: 'short' | 'long';
  threshold: number;
  ship: Pos;
  round: number;
  phase: Phase | null;
  captain: SeatId;
  officer: SeatId | null;
  helm: SeatId | null;
  offWatch: SeatId[];
  overboard: SeatId[];
  silenced: SeatId[];
  checked: SeatId[];
  resigned: SeatId[];
  mutinied: boolean;
  /** Who has voted so far (not how). */
  voted: SeatId[];
  tied: SeatId[];
  target: TargetKind | null;
  /** Who may be picked now (pick, emergency, target, tiebreak). */
  choices: SeatId[];
  spotter: SeatId | null;
  waiting: SeatId[];
  deckCount: number;
  discardCount: number;
  played: Order[];
  log: LogEntry[];
  /** Your own secrets; null for watchers. */
  you: null | {
    seat: SeatId;
    role: Role;
    faction: Faction;
    ammo: number;
    /** Spies: every enemy agent (as dealt). */
    spies: SeatId[] | null;
    /** The Black Market people you know about. */
    partners: SeatId[];
    /** Draw: your two orders. */
    hand: Order[] | null;
    /** Steer: the two kept orders. */
    helmCards: Order[] | null;
    spotCard: Order | null;
    /** Whether you still have to act, and your vote so far. */
    toAct: boolean;
    vote: number | null;
    /** Contraband: whether you're the one choosing. */
    fixerMove: boolean;
    /** Contraband: who you could bribe. */
    bribable: SeatId[];
    secrets: Secret[];
  };
  /** At the end: everyone's role and allegiance. */
  reveal: null | { roles: Record<SeatId, Role>; faction: Record<SeatId, Faction>; ammo: Record<SeatId, number> };
  result: GameResult | null;
}

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue', 'coral', 'slate', 'gold', 'mint', 'plum'];

// ---- Helpers ----

function shuffle<T>(xs: readonly T[], random: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(random, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pickOne = <T>(xs: readonly T[], random: () => number): T => xs[randInt(random, xs.length)];

export const aboard = (s: Pick<ShipState, 'order' | 'overboard'>) => s.order.filter((p) => !s.overboard.includes(p));
const secret = (s: ShipState, seat: SeatId, x: Secret): ShipState => ({ ...s, secrets: { ...s.secrets, [seat]: [...(s.secrets[seat] ?? []), x] } });
const log = (s: ShipState, ...e: LogEntry[]): ShipState => ({ ...s, log: [...s.log, ...e] });
const fixerOf = (s: ShipState) => s.order.find((p) => s.roles[p] === 'fixer')!;

/** Who the captain may pick for the bridge watch: not off watch (unless
 *  that leaves fewer than two). */
export function watchChoices(s: ShipState): SeatId[] {
  const all = aboard(s).filter((p) => p !== s.captain);
  const rested = all.filter((p) => !s.offWatch.includes(p));
  return rested.length >= 2 ? rested : all;
}
export function targetChoices(s: ShipState, kind: TargetKind): SeatId[] {
  const on = aboard(s);
  switch (kind) {
    case 'intercept': case 'spotter': return on;
    case 'silence': return on.filter((p) => p !== s.captain && !s.silenced.includes(p));
    // Never fewer than three aboard: someone has to sail her.
    case 'sharks': return on.length <= 3 ? [] : on.filter((p) => p !== s.captain);
    default: return on.filter((p) => p !== s.captain);
  }
}
export function bribable(s: ShipState): SeatId[] {
  return aboard(s).filter((p) => s.faction[p] !== 'bm' && !s.checked.includes(p));
}

/** Top up the deck from the discards and carried-out orders when it runs low. */
function ensureDeck(s: ShipState, n: number, random: () => number): ShipState {
  if (s.deck.length >= n) return s;
  return { ...s, deck: [...s.deck, ...shuffle([...s.discard, ...s.played], random)], discard: [], played: [] };
}

// ---- The end ----

/** Teams win together, overboard or not; players who resigned never win. */
function finish(s: ShipState, faction: Faction | null, reason: string): ShipState {
  const resigned = s.order.filter((p) => s.resigned.includes(p));
  const winners = faction ? s.order.filter((p) => s.faction[p] === faction && !s.resigned.includes(p)) : [];
  const rest = s.order.filter((p) => !winners.includes(p) && !s.resigned.includes(p));
  const base = { ...s, phase: s.phase, todo: [], target: null };
  if (!winners.length) {
    return log({ ...base, result: { winner: null, reason, nobodyWins: true, placings: [[...rest, ...resigned]] } }, { k: 'end', faction, reason });
  }
  const placings = [winners, rest, resigned].filter((g) => g.length);
  return log({ ...base, result: { winner: winners.length === 1 ? winners[0] : null, reason, placings, teamWin: true } }, { k: 'end', faction, reason });
}
const PORT_REASON: Record<Faction, string> = {
  navy: 'the Royal Navy bringing her into Plymouth',
  spy: 'the spies delivering her to the U-boats',
  bm: 'the Black Market landing her at Lisbon',
};

// ---- A round ----

function newRound(s: ShipState): ShipState {
  const rested = [s.helm, ...(s.order.length >= BIG_GAME ? [s.officer, s.captain] : [])].filter((p): p is SeatId => !!p);
  const round = s.round + 1;
  return log({
    ...s, round, phase: 'pick', officer: null, helm: null, offWatch: rested, mutinied: false,
    votes: {}, tied: [], hands: {}, kept: {}, helmCards: [], todo: [], target: null, spotter: null, spotCard: null, acked: [],
  }, { k: 'round', n: round, captain: s.captain });
}

function startDraw(s: ShipState, random: () => number): ShipState {
  let next = ensureDeck(s, 4, random);
  const [a, b, c, d, ...rest] = next.deck;
  next = { ...next, deck: rest, phase: 'draw', hands: { [s.captain]: [a, b], [s.officer!]: [c, d] }, kept: {}, helmCards: [] };
  return next;
}

/** Shore leave: command passes to whoever has carried out the fewest
 *  orders (not the captain, nobody silenced); ties go round the table. */
function relieve(s: ShipState): SeatId {
  const n = s.order.length, at = s.order.indexOf(s.captain);
  const around = Array.from({ length: n - 1 }, (_, i) => s.order[(at + 1 + i) % n]);
  const can = around.filter((p) => !s.overboard.includes(p) && !s.silenced.includes(p));
  if (!can.length) return s.captain;
  const fewest = Math.min(...can.map((p) => s.carried[p] ?? 0));
  return can.find((p) => (s.carried[p] ?? 0) === fewest)!;
}

/** Work through what's left of the round: chart action, order effect. */
function advance(s: ShipState, _random?: () => number): ShipState {
  let next = s;
  while (!next.result) {
    const [step, ...todo] = next.todo;
    if (!step) return newRound(next);
    next = { ...next, todo };
    if (step.k === 'resupply') {
      next = log({ ...next, ammo: Object.fromEntries(next.order.map((p) => [p, next.overboard.includes(p) ? next.ammo[p] : Math.max(next.ammo[p], START_AMMO)])) }, { k: 'resupply' });
      continue;
    }
    if (step.k === 'chart') {
      if (!targetChoices(next, step.action).length) { next = log(next, { k: 'action', seat: next.captain, action: step.action, target: null }); continue; }
      return { ...next, phase: 'target', target: step.action };
    }
    const kind = orderKind(step.order);
    const helm = next.helm!;
    switch (kind) {
      case 'steady': break;
      case 'shoreleave': {
        const captain = relieve(next);
        next = log({ ...next, captain }, { k: 'shoreleave', seat: next.captain, captain });
        break;
      }
      case 'armslocker':
        if (!next.overboard.includes(helm)) next = log({ ...next, ammo: { ...next.ammo, [helm]: next.ammo[helm] + 1 } }, { k: 'ammo', seat: helm, delta: 1 });
        break;
      case 'confiscated':
        if (!next.overboard.includes(helm)) next = log({ ...next, ammo: { ...next.ammo, [helm]: Math.max(0, next.ammo[helm] - 1) } }, { k: 'ammo', seat: helm, delta: -1 });
        break;
      case 'intercept': case 'spotter':
        return { ...next, phase: 'target', target: kind };
      case 'contraband':
        return { ...next, phase: 'contraband', acked: [] };
    }
  }
  return next;
}

/** The helmsman's choice is carried out: move, then the chart, then the order. */
function carryOut(s: ShipState, order: Order, random: () => number): ShipState {
  const chart = CHARTS[s.chart];
  const d = STEP[orderDir(order)];
  const to = { a: s.ship.a + d.a, b: s.ship.b + d.b };
  let next = log({
    ...s, ship: to, played: [...s.played, order], helmCards: [], hands: {}, kept: {},
    carried: { ...s.carried, [s.captain]: (s.carried[s.captain] ?? 0) + 1 },
  }, { k: 'order', seat: s.captain, helm: s.helm!, order, to });
  const port = portAt(chart, to);
  if (port) return finish(next, port, PORT_REASON[port]);
  const todo: Step[] = [];
  if (orderDir(order) === 's' && chart.resupplyRow === to.b) todo.push({ k: 'resupply' });
  const action = actionAt(chart, to);
  if (action) todo.push({ k: 'chart', action });
  if (orderKind(order) !== 'steady') todo.push({ k: 'order', order });
  next = { ...next, todo };
  return advance(next, random);
}

function resolveVote(s: ShipState, random: () => number): ShipState {
  const votes = s.votes;
  const total = Object.values(votes).reduce((x, y) => x + y, 0);
  if (total < s.threshold) {
    return startDraw({ ...log(s, { k: 'vote', votes, total, need: s.threshold, mutiny: false }), votes: {} }, random);
  }
  // Overthrown: the biggest backer (who isn't silenced) takes command.
  const eligible = Object.keys(votes).filter((p) => votes[p] > 0 && !s.silenced.includes(p));
  const ammo = Object.fromEntries(s.order.map((p) => [p, s.ammo[p] - (votes[p] ?? 0)]));
  if (!eligible.length) {
    return startDraw({ ...log(s, { k: 'vote', votes, total, need: s.threshold, mutiny: false }), votes: {} }, random);
  }
  const top = Math.max(...eligible.map((p) => votes[p]));
  const tied = s.order.filter((p) => eligible.includes(p) && votes[p] === top);
  const next = { ...s, ammo };
  if (tied.length > 1) return log({ ...next, phase: 'tiebreak', tied, votes: {} }, { k: 'vote', votes, total, need: s.threshold, mutiny: true });
  return takeCommand(log(next, { k: 'vote', votes, total, need: s.threshold, mutiny: true, captain: tied[0] }), tied[0]);
}

function takeCommand(s: ShipState, captain: SeatId): ShipState {
  return { ...s, captain, officer: null, helm: null, mutinied: true, phase: 'pick', tied: [], votes: {} };
}

// ---- Applying actions ----

const isSeat = (s: ShipState, x: unknown): x is SeatId => typeof x === 'string' && s.order.includes(x);

function apply(s: ShipState, seat: SeatId, raw: unknown, random: () => number): ShipState | string {
  if (s.result) return 'The voyage is over';
  if (!s.order.includes(seat)) return 'You aren’t aboard';
  const a = (raw ?? {}) as Record<string, unknown>;
  if (a.type === 'resign') {
    if (s.resigned.includes(seat)) return 'You’ve already resigned';
    return log({ ...s, resigned: [...s.resigned, seat] }, { k: 'resign', seat });
  }
  if (s.resigned.includes(seat)) return 'You’ve resigned from this game';
  if (s.overboard.includes(seat)) return 'You’re in the water: you can only watch now';

  switch (a.type) {
    case 'pick': {
      if (s.phase !== 'pick' || seat !== s.captain) return 'Only the captain picks the bridge watch, at the start of a round';
      const ok = watchChoices(s);
      if (!isSeat(s, a.officer) || !isSeat(s, a.helm) || a.officer === a.helm) return 'Pick two different players';
      if (!ok.includes(a.officer) || !ok.includes(a.helm)) return 'Pick players who are aboard and not off watch';
      const next = log({ ...s, officer: a.officer, helm: a.helm }, { k: 'pick', seat, officer: a.officer, helm: a.helm });
      return s.mutinied ? startDraw(next, random) : { ...next, phase: 'vote', votes: {} };
    }
    case 'vote': {
      if (s.phase !== 'vote') return 'There’s no vote now';
      if (seat === s.captain) return 'The captain doesn’t vote';
      if (seat in s.votes) return 'You’ve already voted';
      const n = a.rounds;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > s.ammo[seat]) return `Commit 0 to ${s.ammo[seat]} rounds`;
      const next = { ...s, votes: { ...s.votes, [seat]: n } };
      return voters(next).every((p) => p in next.votes) ? resolveVote(next, random) : next;
    }
    case 'tiebreak': {
      if (s.phase !== 'tiebreak' || seat !== s.captain) return 'Only the old captain breaks the tie';
      if (!isSeat(s, a.target) || !s.tied.includes(a.target)) return 'Pick one of the tied players';
      return takeCommand(log(s, { k: 'tiebreak', seat, captain: a.target }), a.target);
    }
    case 'keep': {
      if (s.phase !== 'draw' || !s.hands[seat]) return 'You have no orders to choose from';
      if (seat in s.kept) return 'You’ve already chosen';
      if (a.index !== 0 && a.index !== 1) return 'Keep the first or the second order';
      const cards = s.hands[seat];
      const kept = cards[a.index], other = cards[1 - a.index];
      let next = secret({ ...s, kept: { ...s.kept, [seat]: kept }, discard: [...s.discard, other] }, seat, { round: s.round, k: 'drew', cards, kept });
      if (!(s.captain in next.kept) || !(s.officer! in next.kept)) return next;
      const two = [next.kept[s.captain], next.kept[s.officer!]];
      const helmCards = randInt(random, 2) ? [two[1], two[0]] : two;
      next = { ...next, phase: 'steer', helmCards };
      return next;
    }
    case 'steer': {
      if (s.phase !== 'steer' || seat !== s.helm) return 'Only the helmsman steers';
      if (a.index !== 0 && a.index !== 1) return 'Discard the first or the second order';
      const played = s.helmCards[1 - a.index];
      const next = secret({ ...s, discard: [...s.discard, s.helmCards[a.index]] }, seat, { round: s.round, k: 'steered', cards: s.helmCards, played });
      return carryOut(next, played, random);
    }
    case 'abandon': {
      if (s.phase !== 'steer' || seat !== s.helm) return 'Only the helmsman can abandon post, at the wheel';
      if (aboard(s).length <= 3) return 'Too few hands left aboard to abandon post';
      return log({ ...s, overboard: [...s.overboard, seat], discard: [...s.discard, ...s.helmCards], helmCards: [], kept: {}, hands: {}, helm: null, phase: 'emergency' }, { k: 'abandon', seat });
    }
    case 'emergency': {
      if (s.phase !== 'emergency' || seat !== s.captain) return 'Only the captain picks the emergency helmsman';
      if (!isSeat(s, a.target) || !emergencyChoices(s).includes(a.target)) return 'Pick a player aboard who isn’t on the bridge';
      return startDraw(log({ ...s, helm: a.target }, { k: 'emergency', seat, helm: a.target }), random);
    }
    case 'target': {
      if (s.phase !== 'target' || seat !== s.captain || !s.target) return 'Only the captain picks, when the chart or an order calls for it';
      if (!isSeat(s, a.target) || !targetChoices(s, s.target).includes(a.target)) return 'You can’t pick that player';
      return resolveTarget(s, a.target, random);
    }
    case 'spot': {
      if (s.phase !== 'spot' || seat !== s.spotter || !s.spotCard) return 'You aren’t the spotter';
      if (typeof a.keep !== 'boolean') return 'Keep or discard';
      const card = s.spotCard;
      let next = secret(log(s, { k: 'spot', seat, kept: a.keep }), seat, { round: s.round, k: 'spot', card, kept: a.keep });
      next = a.keep ? { ...next, deck: [card, ...next.deck] } : { ...next, discard: [...next.discard, card] };
      return advance({ ...next, spotter: null, spotCard: null }, random);
    }
    case 'contraband': {
      if (s.phase !== 'contraband') return 'No contraband to deal with';
      if (s.roles[seat] !== 'fixer') return 'Only the Fixer deals in contraband';
      if (s.acked.includes(seat)) return 'You’ve made your move';
      const r = fixerMove(s, seat, a);
      return typeof r === 'string' ? r : ack(r, seat, random);
    }
    case 'ack': {
      if (s.phase !== 'contraband') return 'Nothing to wait for';
      if (s.roles[seat] === 'fixer') return 'Make your move first';
      if (s.acked.includes(seat)) return 'Done already';
      return ack(s, seat, random);
    }
    default:
      return 'Unknown move';
  }
}

const voters = (s: ShipState) => aboard(s).filter((p) => p !== s.captain);
export const emergencyChoices = (s: ShipState) => aboard(s).filter((p) => p !== s.captain && p !== s.officer);

function ack(s: ShipState, seat: SeatId, random: () => number): ShipState {
  const next = { ...s, acked: [...s.acked, seat] };
  if (aboard(next).every((p) => next.acked.includes(p))) return advance(log({ ...next, acked: [] }, { k: 'contraband', done: true }), random);
  return next;
}

function fixerMove(s: ShipState, fixer: SeatId, a: Record<string, unknown>): ShipState | string {
  const round = s.round;
  if (a.option === 'bribe') {
    if (!isSeat(s, a.target) || !bribable(s).includes(a.target)) return 'You can’t bribe that player (inspected, interrogated, overboard or yours already)';
    const t = a.target;
    return secret(secret({ ...s, faction: { ...s.faction, [t]: 'bm' } }, fixer, { round, k: 'bribe', target: t }), t, { round, k: 'bribed', by: fixer });
  }
  if (a.option === 'cash') {
    const gifts = typeof a.gifts === 'string' ? a.gifts.split(',').filter(Boolean) : [];
    if (!gifts.length || gifts.length > 3 || !gifts.every((g) => isSeat(s, g) && !s.overboard.includes(g))) return 'Hand out one to three rounds to players aboard';
    let next = { ...s, ammo: { ...s.ammo } };
    for (const g of gifts) next.ammo[g] += 1;
    next = secret(next, fixer, { round, k: 'stash', gifts });
    for (const g of new Set(gifts)) if (g !== fixer) next = secret(next, g, { round, k: 'cash', n: gifts.filter((x) => x === g).length });
    return next;
  }
  if (a.option === 'bridge') {
    const seen = Object.fromEntries([s.captain, s.officer, s.helm].filter((p): p is SeatId => !!p).map((p) => [p, s.faction[p]]));
    return secret(s, fixer, { round, k: 'bridge', seen });
  }
  return 'Choose a bribe, a cash stash or a look at the bridge';
}

function resolveTarget(s: ShipState, t: SeatId, random: () => number): ShipState {
  const kind = s.target!;
  const seat = s.captain;
  let next: ShipState = { ...s, target: null };
  switch (kind) {
    case 'inspect':
      next = secret(log(next, { k: 'action', seat, action: kind, target: t }), seat, { round: s.round, k: 'inspect', target: t, faction: s.faction[t] });
      next = { ...next, checked: next.checked.includes(t) ? next.checked : [...next.checked, t] };
      break;
    case 'interrogate': {
      const others = (['navy', 'spy', 'bm'] as Faction[]).filter((f) => f !== s.faction[t]);
      const not = others[randInt(random, 2)];
      next = log(next, { k: 'action', seat, action: kind, target: t, not });
      next = { ...next, checked: next.checked.includes(t) ? next.checked : [...next.checked, t] };
      break;
    }
    case 'silence':
      next = log({ ...next, silenced: [...next.silenced, t] }, { k: 'action', seat, action: kind, target: t });
      break;
    case 'sharks':
      next = log({ ...next, overboard: [...next.overboard, t] }, { k: 'action', seat, action: kind, target: t });
      if (s.roles[t] === 'fixer') return finish(next, 'bm', 'the Fixer going to the sharks: a body was never found');
      break;
    case 'intercept': {
      next = log(next, { k: 'intercept', seat, target: t });
      next = secret(next, t, { round: s.round, k: 'intercept', cards: s.discard.slice(-3) });
      break;
    }
    case 'spotter': {
      next = ensureDeck(log(next, { k: 'spotter', seat, target: t }), 1, random);
      const [card, ...deck] = next.deck;
      return { ...next, deck, phase: 'spot', spotter: t, spotCard: card };
    }
  }
  return advance(next, random);
}

// ---- Who must act, timeouts ----

export function waitingFor(s: ShipState): SeatId[] {
  if (s.result) return [];
  switch (s.phase) {
    case 'pick': case 'tiebreak': case 'emergency': case 'target': return [s.captain];
    case 'vote': return voters(s).filter((p) => !(p in s.votes));
    case 'draw': return [s.captain, s.officer!].filter((p) => !(p in s.kept));
    case 'steer': return [s.helm!];
    case 'spot': return s.spotter ? [s.spotter] : [];
    case 'contraband': return aboard(s).filter((p) => !s.acked.includes(p));
  }
}

/** The automatic choice when time runs out (or for a player who resigned). */
function autoMove(s: ShipState, seat: SeatId, random: () => number): ShipState {
  if (!waitingFor(s).includes(seat)) return s;
  let a: ShipAction;
  switch (s.phase) {
    case 'pick': {
      const ok = watchChoices(s);
      const i = randInt(random, ok.length);
      let j = randInt(random, ok.length - 1);
      if (j >= i) j++;
      a = { type: 'pick', officer: ok[i], helm: ok[j] };
      break;
    }
    case 'vote': a = { type: 'vote', rounds: 0 }; break;
    case 'tiebreak': a = { type: 'tiebreak', target: pickOne(s.tied, random) }; break;
    case 'draw': a = { type: 'keep', index: 0 }; break;
    case 'steer': a = { type: 'steer', index: randInt(random, 2) }; break;
    case 'emergency': a = { type: 'emergency', target: pickOne(emergencyChoices(s), random) }; break;
    case 'target': a = { type: 'target', target: pickOne(targetChoices(s, s.target!), random) }; break;
    case 'spot': a = { type: 'spot', keep: true }; break;
    case 'contraband': a = s.roles[seat] === 'fixer' ? { type: 'contraband', option: 'bridge' } : { type: 'ack' }; break;
  }
  const before = s.log.length;
  const r = apply(s, seat, a, random);
  if (typeof r === 'string') throw new Error(`Automatic move failed: ${r}`);
  return { ...r, log: r.log.map((e, i) => (i >= before && 'seat' in e && e.seat === seat ? { ...e, auto: true } : e)) };
}

/** Play for players who resigned, until someone else has to act. */
function autoplay(s: ShipState, random: () => number): ShipState {
  let next = s;
  for (let guard = 0; guard < 20000 && !next.result; guard++) {
    if (aboard(next).every((p) => next.resigned.includes(p))) return finish(next, null, 'everyone aboard resigning');
    const due = waitingFor(next).find((p) => next.resigned.includes(p));
    if (!due) return next;
    next = autoMove(next, due, random);
  }
  return next.result ? next : finish(next, null, 'the ship drifting');
}

// ---- The view ----

function viewOf(s: ShipState, viewer: SeatId | null): ShipView {
  const over = !!s.result;
  const me = viewer !== null && s.order.includes(viewer) ? viewer : null;
  const waiting = waitingFor(s);
  const fixer = fixerOf(s);
  let you: ShipView['you'] = null;
  if (me) {
    const role = s.roles[me];
    const partners = role === 'fixer' ? s.order.filter((p) => p !== me && s.faction[p] === 'bm')
      : s.faction[me] === 'bm' ? [fixer] : [];
    you = {
      seat: me, role, faction: s.faction[me], ammo: s.ammo[me],
      spies: role === 'spy' ? s.order.filter((p) => s.roles[p] === 'spy') : null,
      partners,
      hand: !over && s.phase === 'draw' && s.hands[me] && !(me in s.kept) ? s.hands[me] : null,
      helmCards: !over && s.phase === 'steer' && s.helm === me ? s.helmCards : null,
      spotCard: !over && s.phase === 'spot' && s.spotter === me ? s.spotCard : null,
      toAct: waiting.includes(me),
      vote: me in s.votes ? s.votes[me] : null,
      fixerMove: !over && s.phase === 'contraband' && role === 'fixer',
      bribable: !over && s.phase === 'contraband' && role === 'fixer' ? bribable(s) : [],
      secrets: s.secrets[me] ?? [],
    };
  }
  const choices = over ? [] : s.phase === 'pick' ? watchChoices(s) : s.phase === 'emergency' ? emergencyChoices(s)
    : s.phase === 'target' && s.target ? targetChoices(s, s.target) : s.phase === 'tiebreak' ? s.tied : [];
  return {
    order: s.order, chart: s.chart, threshold: s.threshold, ship: s.ship, round: s.round,
    phase: over ? null : s.phase, captain: s.captain, officer: s.officer, helm: s.helm, offWatch: s.offWatch,
    overboard: s.overboard, silenced: s.silenced, checked: s.checked, resigned: s.resigned, mutinied: s.mutinied,
    voted: s.phase === 'vote' ? Object.keys(s.votes) : [], tied: s.tied, target: s.target, choices,
    spotter: s.spotter, waiting, deckCount: s.deck.length, discardCount: s.discard.length, played: s.played,
    log: s.log, you,
    reveal: over ? { roles: s.roles, faction: s.faction, ammo: s.ammo } : null,
    result: s.result,
  };
}

// ---- The module ----

const base: GameModule<ShipState, Record<string, never>> = {
  id: 'ship2shore',
  name: 'Ship2Shore',
  description: '5-11 players. 1943: the Royal Navy, enemy spies and a black-market Fixer each steer the SS Marigold for a different port. Who goes to the sharks?',
  howToPlay: {
    goal: 'Steer the SS Marigold into your faction’s port: Plymouth for the Royal Navy, the U-boat rendezvous for the spies, Lisbon for the Black Market. Your faction wins together, even those of you in the water.',
    sections: [
      { title: 'Who’s who', points: [
        'Everyone is dealt a secret role. The Royal Navy are the majority. The spies (one to four) see each other at the start. The Fixer works alone (with one Smuggler in an 11-player game) and can bribe others onto the Black Market’s side.',
        'If the Fixer is thrown to the sharks, the Black Market wins at once: a body was never found.',
        'Everyone starts with three rounds of ammunition. How many you have is your secret.',
      ] },
      { title: 'A round', points: [
        'The captain picks a first officer and a helmsman. Last round’s helmsman is off watch (in games of 8 or more, last round’s first officer and captain too).',
        'Vote of no confidence: everyone but the captain secretly commits rounds. If the total reaches the threshold (3 for 5-7 players, 4 for 8-9, 5 for 10-11), the captain is overthrown: the biggest backer takes command (the old captain breaks a tie) and picks a new watch, and everyone who committed loses those rounds. Otherwise all rounds go back.',
        'The captain and the first officer each draw two course orders and keep one. The helmsman sees the two kept orders, not who kept which, discards one and the ship sails on the other. Nobody on the bridge may talk while plotting; afterwards anyone may claim anything.',
        'A helmsman can abandon post instead: both orders are discarded unseen, they go overboard, and the captain picks an emergency helmsman.',
      ] },
      { title: 'Orders and the chart', points: [
        'Each order moves the ship one sea area: north-east (towards Plymouth), south-west (towards the rendezvous) or south (towards Lisbon). Then any chart action on the new area happens, then the order’s own effect.',
        'Shore leave: the player with the fewest orders carried out takes command. Arms locker / Confiscated: the helmsman gains / loses a round. Radio intercept: someone the captain picks reads the last three discards. Spotter: someone the captain picks looks at the top order and keeps or discards it. Contraband: the Fixer bribes someone, hands out up to three rounds, or looks at the bridge watch’s allegiances.',
        'Chart actions: kit inspection (the captain secretly sees someone’s allegiance), interrogation (everyone sees one faction a player is not), radio silence (that player keeps quiet and can’t be captain), sharks (the captain throws someone overboard). Players who’ve been inspected or interrogated can’t be bribed.',
        'The short chart (5-7 players) and the long chart (8-11, with a resupply line that tops everyone up to three rounds).',
      ] },
      { title: 'Timing and leaving', points: [
        'Out of time: the captain’s picks are made at random, you commit no rounds, you keep your first order, the helmsman discards at random, a spotter keeps the card and the Fixer looks at the bridge.',
        'A player who resigns can’t win; their part is played automatically from then on.',
        'Players in the water watch: they can’t act, but they still win with their faction.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  minPlayers: 5,
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'The Bay of Biscay, 1943',

  create(_c, _now, ctx: GameContext) {
    const order = ctx.seats;
    const n = order.length;
    const counts = roleCounts(n);
    const pool: Role[] = (['navy', 'spy', 'fixer', 'smuggler'] as Role[]).flatMap((r) => Array<Role>(counts[r]).fill(r));
    const dealt = shuffle(pool, ctx.random);
    const roles = Object.fromEntries(order.map((p, i) => [p, dealt[i] ?? 'navy'])) as Record<SeatId, Role>;
    const captain = order[randInt(ctx.random, n)];
    const s: ShipState = {
      config: {}, order, chart: chartFor(n).id, threshold: thresholdFor(n), roles,
      faction: Object.fromEntries(order.map((p) => [p, ROLES[roles[p]].faction])),
      ammo: Object.fromEntries(order.map((p) => [p, START_AMMO])),
      carried: Object.fromEntries(order.map((p) => [p, 0])),
      overboard: [], silenced: [], checked: [], resigned: [],
      ship: { a: 0, b: 0 }, round: 0, captain, officer: null, helm: null, offWatch: [], phase: 'pick', mutinied: false,
      votes: {}, tied: [], hands: {}, kept: {}, helmCards: [], deck: shuffle(FULL_DECK, ctx.random), discard: [], played: [],
      todo: [], target: null, spotter: null, spotCard: null, acked: [], secrets: {}, log: [], result: null,
    };
    return newRound(s);
  },

  act(s, seat, raw, _now, ctx) {
    const r = apply(s, seat, raw, ctx.random);
    return typeof r === 'string' ? { error: r } : { state: autoplay(r, ctx.random) };
  },

  turn: waitingFor,
  timeout(s, seat, _now, ctx) {
    if (s.result || !waitingFor(s).includes(seat)) return s;
    return autoplay(autoMove(s, seat, ctx.random), ctx.random);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,
  view: (s, _now, viewer) => viewOf(s, viewer),
};

export const ship2shore = withHistory(base, { keys: ['officer', 'helm', 'rounds', 'target', 'index', 'keep', 'option', 'gifts'] });
