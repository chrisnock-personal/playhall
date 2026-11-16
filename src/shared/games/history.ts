// Replays for games with luck (dice, shuffles) and hidden hands. Such a game
// can't be rebuilt from its final state, so it keeps a compact history: the
// seats it started with, every action that was accepted (or move timer that
// ran out), and the dice and shuffles as the whole numbers that came up. A
// replay plays the game again from the start with the same numbers and shows
// what a watcher saw after each step.
//
// A game opts in by drawing every random number through randInt() and
// wrapping its module in withHistory(). Its state keeps `history` (optional,
// so games saved before it existed still load; they just can't be replayed).

import type { GameContext, GameModule, GameResult, SeatId } from '../game';

export interface HistoryStep {
  /** The seat that acted. */
  s: SeatId;
  /** The action as accepted (only the fields the game reads), or absent
   *  when the move timer ran out (`t`). */
  a?: Record<string, unknown>;
  /** The move timer ran out for this seat. */
  t?: 1;
  /** Whole numbers drawn during this step (dice, shuffles), in order. */
  r?: number[];
}

export interface GameHistory {
  /** The seats in play when the game was created, in seat order. */
  seats: SeatId[];
  /** Numbers drawn while creating the game (the first deal). */
  r: number[];
  steps: HistoryStep[];
}

type Tape = (() => number) & { ints?: number[]; replay?: { ints: number[]; pos: number } };

/** A whole number in [0, n), from the room's random numbers. While a game is
 *  recorded it's noted down; during a replay it's read back. */
export function randInt(random: () => number, n: number): number {
  const t = random as Tape;
  if (t.replay) {
    const v = t.replay.ints[t.replay.pos++];
    if (v === undefined) throw new Error('The replay ran out of recorded numbers');
    return v;
  }
  const v = Math.floor(random() * n);
  t.ints?.push(v);
  return v;
}

function recording(random: () => number): Tape & { ints: number[] } {
  const t = (() => random()) as Tape & { ints: number[] };
  t.ints = [];
  return t;
}

function replaying(ints: number[]): Tape {
  const t = (() => { throw new Error('This game draws numbers without randInt'); }) as Tape;
  t.replay = { ints, pos: 0 };
  return t;
}

/** Keep only the fields `keys` from an action (and only plain values), so a
 *  history never stores more than the game reads. */
export function pick(raw: unknown, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const a = (raw ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    const v = a[k];
    if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)) out[k] = v;
  }
  return out;
}

interface WithHistory { history?: GameHistory; result: GameResult | null }

/** Wrap a game so it keeps its history and can replay it. `keys` are the
 *  action fields the game reads; `frame` turns a replayed state into what
 *  the replay shows (default: a watcher's view). */
export function withHistory<S extends WithHistory, C>(
  game: GameModule<S, C>,
  opts: { keys: string[]; frame?: (state: S, view: (state: S) => unknown) => unknown },
): GameModule<S, C> {
  const base = game;
  return {
    ...game,
    keepsHistory: true,

    create(config, now, ctx) {
      const random = recording(ctx.random);
      const state = base.create.call(base, config, now, { ...ctx, random });
      return { ...state, history: { seats: [...ctx.seats], r: random.ints, steps: [] } };
    },

    act(state, seat, action, now, ctx) {
      const random = recording(ctx.random);
      const r = base.act.call(base, state, seat, action, now, { ...ctx, random });
      if ('error' in r || !state.history) return r;
      const step: HistoryStep = { s: seat, a: pick(action, ['type', ...opts.keys]) };
      if (random.ints.length) step.r = random.ints;
      return { state: { ...r.state, history: { ...state.history, steps: [...state.history.steps, step] } } };
    },

    ...(base.timeout ? {
      timeout(state: S, seat: SeatId, now: number, ctx: GameContext): S {
        const random = recording(ctx.random);
        const next = base.timeout!.call(base, state, seat, now, { ...ctx, random });
        if (next === state || !state.history) return next;
        const step: HistoryStep = { s: seat, t: 1 };
        if (random.ints.length) step.r = random.ints;
        return { ...next, history: { ...state.history, steps: [...state.history.steps, step] } };
      },
    } : {}),

    replay(state) {
      const h = state.history;
      if (!h) return [];
      const view = (s: S) => base.view.call(base, s, 0, null);
      const frame = (s: S) => (opts.frame ? opts.frame(s, view) : view(s));
      const ctx = (ints: number[]): GameContext => ({ seats: h.seats, random: replaying(ints), isWord: () => true });
      const config = (state as { config?: C }).config ?? base.defaultConfig;
      let s: S;
      try {
        s = base.create.call(base, config, 0, ctx(h.r));
      } catch {
        return [];
      }
      const frames = [frame(s)];
      for (const step of h.steps) {
        try {
          if (step.t) s = base.timeout!.call(base, s, step.s, 0, ctx(step.r ?? []));
          else {
            const r = base.act.call(base, s, step.s, step.a, 0, ctx(step.r ?? []));
            if ('error' in r) break;
            s = r.state;
          }
        } catch {
          break;
        }
        frames.push(frame(s));
      }
      // End on the real result, should the replay not have reached it.
      if (!base.result(s) && state.result) frames[frames.length - 1] = frame({ ...s, result: state.result });
      return frames;
    },
  };
}
