// The camera table: any real board game, played on someone's own table. The
// host points a camera (a phone on a stand) at the board and moves the
// pieces; Playhall keeps the seats, whose turn it is, a shared dice roller
// (rolled here, on the server), a score pad, the move timer and the chat.
// At the end the host enters the places and every player confirms them; only
// then does the game count. A dispute means it doesn't (docs/phase2.md).
//
// The game's name is typed by the host ("Catan", "our house rules"), and
// results are filed under it for a leaderboard per name.

import type { GameContext, GameModule, GameResult, SeatDef, SeatId } from '../game';
import { randInt } from './history';

/** Seat ids are the kit's player colours (src/client/kit/kit.tsx). */
const SEATS: SeatDef[] = [
  { id: 'amber', label: 'Amber' }, { id: 'teal', label: 'Teal' }, { id: 'violet', label: 'Violet' }, { id: 'rose', label: 'Rose' },
  { id: 'lime', label: 'Lime' }, { id: 'blue', label: 'Blue' }, { id: 'red', label: 'Red' }, { id: 'slate', label: 'Slate' },
];
export const MIN_SEATS = 2;
export const MAX_SEATS = SEATS.length;
export const NAME_MAX = 60;
/** The dice the roller has. */
export const DICE = [4, 6, 8, 10, 12, 20] as const;
/** Most dice in one roll. */
export const MAX_DICE = 10;
/** Score pad limits (whole numbers). */
export const SCORE_MAX = 99_999;
/** Rolls kept in the state (the chat keeps them all). */
const ROLLS_KEPT = 20;

export interface CameraTableConfig {
  /** The game being played, as the host typed it. */
  name: string;
  seats: number;
  /** Players may change their own score on the pad (the host can always). */
  playersScore: boolean;
}

export interface Roll {
  id: number;
  /** Who rolled: their seat, or null for a host who isn't seated. */
  by: SeatId | null;
  name: string;
  dice: { sides: number; value: number }[];
  total: number;
}

export interface Proposal {
  /** Seats in finishing order, ties grouped. */
  placings: SeatId[][];
  confirmed: SeatId[];
  disputed: SeatId[];
  /** Goes up each time the host proposes again (so a stale confirm can't land). */
  version: number;
}

export interface CameraTableState {
  config: CameraTableConfig;
  /** The seats in play, in turn order. */
  order: SeatId[];
  /** Index into `order` of whose turn it is. */
  turn: number;
  /** Goes up each time the turn comes back round to the first player. */
  round: number;
  scores: Record<SeatId, number>;
  rolls: Roll[];
  rollCount: number;
  proposal: Proposal | null;
  /** The last proposal that was disputed, so the host can see what was. */
  disputed: Proposal | null;
  result: GameResult | null;
}

export type CameraTableView = CameraTableState;

export type CameraTableAction =
  /** Pass the turn on (the player whose turn it is, or the host). The host
   *  may name the seat whose turn it becomes. */
  | { type: 'next'; seat?: SeatId }
  /** Roll these dice (their sides), e.g. [6, 6]. */
  | { type: 'roll'; dice: number[] }
  /** Set a score, or change it by `delta`. */
  | { type: 'score'; seat: SeatId; value?: number; delta?: number }
  // Host only:
  | { type: 'propose'; placings: SeatId[][] }
  | { type: 'withdraw' }
  /** End the game without a result: it doesn't count. */
  | { type: 'abandon' }
  // Each player, on a proposed result:
  | { type: 'confirm'; version: number }
  | { type: 'dispute'; version: number };

/** A typed game name made safe and tidy: no control characters, single
 *  spaces, at most 60 characters. */
export function tidyName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
}

/** The leaderboard key for a game name: "  CATAN " and "Catan" are one game. */
export function nameKey(name: string): string {
  return tidyName(name).normalize('NFKC').toLowerCase();
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

type Actor = { seat: SeatId | null; host: boolean; name: string };

function nameOf(ctx: GameContext, seat: SeatId): string {
  return ctx.names?.[seat] ?? SEATS.find((s) => s.id === seat)?.label ?? seat;
}

function describeRoll(dice: Roll['dice']): string {
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d.sides, (counts.get(d.sides) ?? 0) + 1);
  const what = [...counts].map(([sides, n]) => `${n > 1 ? n : ''}d${sides}`).join(' + ');
  const values = dice.map((d) => d.value);
  return values.length === 1 ? `${values[0]} (${what})` : `${values.join(' + ')} = ${values.reduce((a, b) => a + b, 0)} (${what})`;
}

function describePlacings(placings: SeatId[][], ctx: GameContext): string {
  let place = 1;
  return placings.map((group) => {
    const s = `${ordinal(place)} ${group.map((seat) => nameOf(ctx, seat)).join(' and ')}`;
    place += group.length;
    return s;
  }).join(', ');
}

/** Places as entered by the host: every seat in play exactly once. */
function checkPlacings(raw: unknown, order: SeatId[]): SeatId[][] | string {
  if (!Array.isArray(raw) || !raw.length) return 'Enter the places';
  const seen = new Set<SeatId>();
  const out: SeatId[][] = [];
  for (const group of raw) {
    if (!Array.isArray(group) || !group.length) return 'Each place needs at least one player';
    const g: SeatId[] = [];
    for (const seat of group) {
      if (typeof seat !== 'string' || !order.includes(seat)) return 'That player isn’t in this game';
      if (seen.has(seat)) return 'Each player has one place';
      seen.add(seat);
      g.push(seat);
    }
    out.push(g);
  }
  if (seen.size !== order.length) return 'Give every player a place';
  return out;
}

function apply(state: CameraTableState, actor: Actor, raw: unknown, ctx: GameContext): { state: CameraTableState; say?: string[] } | { error: string } {
  if (state.result) return { error: 'The game is over' };
  const a = (raw ?? {}) as Record<string, unknown>;
  const playing = actor.seat !== null && state.order.includes(actor.seat);
  switch (a.type) {
    case 'next': {
      if (state.proposal) return { error: 'The result is being agreed' };
      const current = state.order[state.turn];
      if (!actor.host && actor.seat !== current) return { error: 'It’s not your turn' };
      let turn = (state.turn + 1) % state.order.length;
      if (a.seat !== undefined) {
        if (!actor.host) return { error: 'Only the host can choose whose turn it is' };
        const i = state.order.indexOf(a.seat as SeatId);
        if (i < 0) return { error: 'That player isn’t in this game' };
        turn = i;
      }
      return { state: { ...state, turn, round: turn <= state.turn && a.seat === undefined ? state.round + 1 : state.round } };
    }
    case 'roll': {
      if (!playing && !actor.host) return { error: 'Only players can roll' };
      const dice = a.dice;
      if (!Array.isArray(dice) || !dice.length) return { error: 'Choose some dice' };
      if (dice.length > MAX_DICE) return { error: `At most ${MAX_DICE} dice at once` };
      if (!dice.every((d) => (DICE as readonly unknown[]).includes(d))) return { error: 'Those dice aren’t in the box' };
      const rolled = (dice as number[]).map((sides) => ({ sides, value: randInt(ctx.random, sides) + 1 }));
      const roll: Roll = { id: state.rollCount + 1, by: actor.seat, name: actor.name, dice: rolled, total: rolled.reduce((n, d) => n + d.value, 0) };
      return {
        state: { ...state, rolls: [...state.rolls, roll].slice(-ROLLS_KEPT), rollCount: roll.id },
        say: [`${actor.name} rolled ${describeRoll(rolled)}`],
      };
    }
    case 'score': {
      const seat = a.seat as SeatId;
      if (!state.order.includes(seat)) return { error: 'That player isn’t in this game' };
      if (!actor.host && !(state.config.playersScore && actor.seat === seat)) {
        return { error: state.config.playersScore ? 'You can only change your own score' : 'The host keeps the scores in this room' };
      }
      const old = state.scores[seat] ?? 0;
      const next = typeof a.value === 'number' ? a.value : typeof a.delta === 'number' ? old + a.delta : NaN;
      if (!Number.isInteger(next) || Math.abs(next) > SCORE_MAX) return { error: `Scores are whole numbers up to ${SCORE_MAX}` };
      return { state: { ...state, scores: { ...state.scores, [seat]: next } } };
    }
    case 'propose': {
      if (!actor.host) return { error: 'Only the host enters the result' };
      const placings = checkPlacings(a.placings, state.order);
      if (typeof placings === 'string') return { error: placings };
      // Proposing it is the host's own confirmation, when they play.
      const confirmed = actor.seat && state.order.includes(actor.seat) ? [actor.seat] : [];
      const proposal: Proposal = { placings, confirmed, disputed: [], version: (state.proposal?.version ?? state.disputed?.version ?? 0) + 1 };
      return finishIfAgreed({ ...state, proposal, disputed: null }, [`The host entered the result: ${describePlacings(placings, ctx)}. Each player: confirm it or dispute it.`]);
    }
    case 'withdraw': {
      if (!actor.host) return { error: 'Only the host can do that' };
      if (!state.proposal) return { error: 'There’s no result to take back' };
      return { state: { ...state, proposal: null }, say: ['The host took the result back: play on'] };
    }
    case 'abandon': {
      if (!actor.host) return { error: 'Only the host can do that' };
      const why = state.disputed || state.proposal?.disputed.length ? 'the result being disputed' : 'the host ending it without a result';
      return { state: { ...state, result: { winner: null, reason: why, aborted: true } } };
    }
    case 'confirm':
    case 'dispute': {
      const p = state.proposal;
      if (!p) return { error: 'There’s no result to confirm' };
      if (!playing) return { error: 'Only the players confirm the result' };
      if (a.version !== p.version) return { error: 'The host has changed the result: have another look' };
      const seat = actor.seat!;
      if (a.type === 'confirm') {
        if (p.confirmed.includes(seat)) return { state };
        return finishIfAgreed({ ...state, proposal: { ...p, confirmed: [...p.confirmed, seat] } }, [`${actor.name} confirmed the result`]);
      }
      // A dispute sends it back to the host: revise it, or end without counting.
      return {
        state: { ...state, proposal: null, disputed: { ...p, confirmed: p.confirmed.filter((s) => s !== seat), disputed: [seat] } },
        say: [`${actor.name} disputed the result: the host can revise it, or end the game without it counting`],
      };
    }
    default:
      return { error: 'Unknown action' };
  }
}

function finishIfAgreed(state: CameraTableState, say: string[]): { state: CameraTableState; say: string[] } {
  const p = state.proposal!;
  if (!state.order.every((s) => p.confirmed.includes(s))) return { state, say };
  const winner = p.placings[0].length === 1 ? p.placings[0][0] : null;
  return { state: { ...state, proposal: p, result: { winner, placings: p.placings, reason: 'the agreed result' } }, say: [...say, 'Everyone confirmed the result'] };
}

export const cameraTable: GameModule<CameraTableState, CameraTableConfig> = {
  id: 'cameratable',
  name: 'Camera table',
  description: 'Any real board game, on your own table: a phone films the board, Playhall keeps turns, dice, scores and the result.',
  howToPlay: {
    goal: 'Play any board game you own on a real table, with friends here or far away. The host films the board and moves the pieces; everyone else watches the board fill the screen.',
    sections: [
      { title: 'Setting up', points: [
        'The host names the game and picks 2 to 8 seats.',
        'The host opens Table camera and scans the code with a phone (or taps Use this device as the table camera). Put the phone on a stand over the board: its picture fills the stage for everyone. The phone needs no account and takes no seat.',
        'Players can turn their own cameras on too: they show on their seat cards as usual.',
      ] },
      { title: 'Playing', points: [
        'Whose turn it is shows on the turn bar. The player whose turn it is (or the host) presses Next turn.',
        'The dice roller rolls any mix of d4, d6, d8, d10, d12 and d20 on the server, and everyone sees the roll in the table chat, so nobody doubts a roll.',
        'The score pad shows everyone’s score. The host can change any score; players can change their own unless the host keeps the scores.',
        'If the room has a move timer, running out of time passes the turn on.',
      ] },
      { title: 'The result', points: [
        'At the end the host enters the places: 1st, 2nd and so on, with ties allowed.',
        'Each player confirms the result with one click. Once everyone has, it counts like any other game: 3 points for a sole winner, 1 each for a shared first place, 1 for second in games of three or more.',
        'If anyone disputes it, it doesn’t count yet: the host can change the places and ask again, or end the game without it counting.',
        'Leaderboards have a Camera table tab per game name, so Catan games compare with Catan games.',
      ] },
    ],
  },
  seats: SEATS,
  minPlayers: MIN_SEATS,
  defaultConfig: { name: '', seats: 4, playersScore: true },
  seatsFor: (config) => SEATS.slice(0, config.seats),
  tableCamera: true,
  keepsDroppedPlayers: true,

  parseConfig(raw) {
    const r = (raw ?? {}) as Partial<CameraTableConfig>;
    const seats = typeof r.seats === 'number' && Number.isInteger(r.seats) ? Math.min(MAX_SEATS, Math.max(MIN_SEATS, r.seats)) : 4;
    return { name: tidyName(r.name) || 'Board game', seats, playersScore: r.playersScore !== false };
  },

  configError(raw) {
    const name = (raw as { name?: unknown } | null)?.name;
    if (typeof name === 'string' && name.trim().length > NAME_MAX) return `Keep the game’s name to ${NAME_MAX} characters`;
    if (!tidyName(name)) return 'Type the name of the game you’re playing';
    return null;
  },

  describeConfig: (c) => `${c.name} · ${c.seats} seats`,

  create(config, _now, ctx) {
    return {
      config, order: [...ctx.seats], turn: 0, round: 1,
      scores: Object.fromEntries(ctx.seats.map((s) => [s, 0])),
      rolls: [], rollCount: 0, proposal: null, disputed: null, result: null,
    };
  },

  act(state, seat, action, _now, ctx) {
    return apply(state, { seat, host: false, name: nameOf(ctx, seat) }, action, ctx);
  },

  hostAct(state, action, _now, ctx) {
    const seat = ctx.host?.seat ?? null;
    return apply(state, { seat, host: true, name: seat ? nameOf(ctx, seat) : ctx.host?.name ?? 'The host' }, action, ctx);
  },

  turn: (s) => (s.result || s.proposal ? [] : [s.order[s.turn]]),

  // The move timer passes the turn on.
  timeout(state, seat) {
    if (state.result || state.proposal || state.order[state.turn] !== seat) return state;
    const turn = (state.turn + 1) % state.order.length;
    return { ...state, turn, round: turn === 0 ? state.round + 1 : state.round };
  },

  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,
  boardName: (s) => s?.config?.name ?? null,
  view: (s) => s,
};
