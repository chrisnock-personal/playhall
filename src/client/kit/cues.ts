// Which sounds a change at the table makes (#29), worked out from the old
// and new room snapshots alone, so everyone hears the same thing when the
// change reaches them (watchers on a delay hear it when they see it). No DOM
// here: the sound engine (sound.ts) plays what this returns, and
// cues.test.ts checks it. The timings line up with the animations in
// motion.tsx (#28): both use TIMING.

import type { RoomSnapshot } from '../../shared/protocol';
import type { SnakesView } from '../../shared/games/snakes';
import type { LudoView } from '../../shared/games/ludo';
import type { FourView } from '../../shared/games/fourinarow';
import type { CheckersView } from '../../shared/games/checkers';
import type { ChessView } from '../../shared/games/chess';
import type { SeaView } from '../../shared/games/seabattle';
import type { BlackjackView } from '../../shared/games/blackjack';
import type { PokerView } from '../../shared/games/poker';
import type { ClashView } from '../../shared/games/colourclash';
import type { LetterworksView } from '../../shared/games/letterworks';
import type { RealmView } from '../../shared/games/realmduel';
import type { ManorView } from '../../shared/games/manormystery';
import type { CameraTableView } from '../../shared/games/cameratable';
import type { ShipView } from '../../shared/games/ship2shore';

export type Sound =
  | 'dice' | 'shuffle' | 'card' | 'draw' | 'flip' | 'chip' | 'chips'
  | 'move' | 'capture' | 'drop' | 'climb' | 'slide' | 'place'
  | 'launch' | 'hit' | 'sink' | 'splash'
  | 'turn' | 'warn' | 'tick' | 'win' | 'end';

export const SOUNDS: Sound[] = [
  'dice', 'shuffle', 'card', 'draw', 'flip', 'chip', 'chips', 'move', 'capture', 'drop', 'climb', 'slide', 'place',
  'launch', 'hit', 'sink', 'splash', 'turn', 'warn', 'tick', 'win', 'end',
];

/** A sound and when to play it, in ms after the change arrives. */
export interface Cue { sound: Sound; at: number }

/** Shared timings (ms), so a sound lands with its animation. All short:
 *  nothing runs past ~0.6 s, so the next player's move timer isn't eaten. */
export const TIMING = {
  /** The die tumbles for this long. */
  die: 420,
  /** A token starts along its path this long after the roll shows. */
  pathStart: 180,
  /** ...and takes at most this long to get there. */
  path: 420,
  /** A Four in a Row disc falls for this long. */
  drop: 320,
  /** One checkers hop (a plain move is one hop). */
  hop: 200,
  /** A Sea Battle missile's flight before it lands. */
  shot: 320,
  /** Between cards dealt one after another. */
  deal: 90,
  /** A card or chip flying to its place. */
  fly: 320,
  /** A shuffle. */
  shuffle: 380,
} as const;

const cue = (sound: Sound, at = 0): Cue => ({ sound, at: Math.round(at) });
const sig = (x: unknown) => JSON.stringify(x ?? null);
/** `n` of a sound one after another (capped, so a big deal stays short). */
function run(sound: Sound, n: number, start: number, gap: number, max = 6): Cue[] {
  return Array.from({ length: Math.max(0, Math.min(n, max)) }, (_, i) => cue(sound, start + i * gap));
}

/** How long a token takes over a path of `steps` (each up to 160 ms, all
 *  within `max`). */
export const pathTime = (steps: number, max: number = TIMING.path) => Math.min(max, 160 * Math.max(0, steps));
/** How long each step of a path takes when it has `steps` of them. */
export const stepTime = (steps: number) => (steps > 0 ? pathTime(steps) / steps : 0);

// ---- per game: old view (null when the game has just started) -> new view ----

type Detect = (prev: any, next: any) => Cue[]; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Snakes and Ladders: the roll, the walk, then up a ladder or down a snake. */
export function snakesCues(prev: SnakesView | null, next: SnakesView): Cue[] {
  const l = next.last;
  if (!l || !prev || sig(prev.last) === sig(l)) return [];
  const out = [cue('dice')];
  const walked = snakesWalk(l.from, l.value).length - 1;
  const steps = walked + (l.via ? 1 : 0);
  const t = pathTime(steps) / Math.max(1, steps);
  if (walked) out.push(cue('move', TIMING.pathStart + t * 0.5));
  if (l.via) out.push(cue(l.via === 'ladder' ? 'climb' : 'slide', TIMING.pathStart + walked * t));
  return out;
}

/** The squares a Snakes and Ladders token walks through for a roll, before
 *  any ladder or snake (it bounces back off 100). Starts with `from`. */
export function snakesWalk(from: number, value: number): number[] {
  const out = [from];
  let at = from, dir = 1;
  for (let i = 0; i < value; i++) {
    if (at === 100) dir = -1;
    at += dir;
    out.push(at);
  }
  return out;
}

/** Ludo: the roll; a token stepping square by square; a capture. */
export function ludoCues(prev: LudoView | null, next: LudoView): Cue[] {
  if (!prev) return [];
  const out: Cue[] = [];
  if (prev.roll === null && next.roll !== null) out.push(cue('dice'));
  const newEntry = sig(prev.last) !== sig(next.last) && next.last;
  if (!newEntry) return out;
  const l = next.last!;
  if (l.token === null) { if (!out.length) out.push(cue('dice')); return out; }
  const from = prev.tokens[l.seat]?.[l.token] ?? -1;
  const to = next.tokens[l.seat]?.[l.token] ?? from;
  const steps = from === -1 ? 1 : Math.max(1, to - from);
  const t = stepTime(steps);
  out.push(...run('move', steps, t, t, 6));
  if (l.captured.length) out.push(cue('capture', steps * t + 40));
  return out;
}

/** Four in a Row: the disc lands. */
export function fourCues(prev: FourView | null, next: FourView): Cue[] {
  if (!prev || next.moves.length <= prev.moves.length) return [];
  return [cue('drop', TIMING.drop - 20)];
}

/** Checkers: a slide, or a hop per jump with a capture on each landing. */
export function checkersCues(prev: CheckersView | null, next: CheckersView): Cue[] {
  if (!prev || next.moveCount <= prev.moveCount || !next.lastMove) return [];
  const path = next.lastMove;
  const jump = path.length > 2 || (path.length === 2 && Math.abs(path[1] - path[0]) > 9);
  if (!jump) return [cue('move', TIMING.hop - 40)];
  const hops = path.length - 1;
  const t = hopTime(hops);
  return run('capture', hops, t - 30, t, 8);
}

export const hopTime = (hops: number) => Math.min(TIMING.hop, 560 / Math.max(1, hops));

/** Chess: a move or a capture (the board animates the piece itself). */
export function chessCues(prev: ChessView | null, next: ChessView): Cue[] {
  if (!prev || next.san.length <= prev.san.length) return [];
  const san = next.san[next.san.length - 1] ?? '';
  return [cue(san.includes('x') ? 'capture' : 'move', 150)];
}

/** Sea Battle: the launch, then a bang (bigger for a sinking) or a splash. */
export function seaCues(prev: SeaView | null, next: SeaView): Cue[] {
  if (!prev) return [];
  const out: Cue[] = [];
  for (const seat of Object.keys(next.shots)) {
    const before = prev.shots[seat]?.length ?? 0;
    for (const shot of next.shots[seat].slice(before)) {
      out.push(cue('launch'), cue(shot.sunk ? 'sink' : shot.hit ? 'hit' : 'splash', TIMING.shot));
    }
  }
  return out;
}

/** Blackjack: a fresh shoe, bets, cards dealt, the hand paid out. */
export function blackjackCues(prev: BlackjackView | null, next: BlackjackView): Cue[] {
  if (!prev) return [cue('shuffle')];
  const out: Cue[] = [];
  let t = 0;
  if (sig(prev.last) !== sig(next.last) && next.last) { out.push(cue('chips')); t = 200; }
  if (next.shoeLeft > prev.shoeLeft && next.phase === 'playing') { out.push(cue('shuffle', t)); t += TIMING.shuffle; }
  if (Object.keys(next.bets).some((p) => prev.bets[p] == null && next.bets[p] != null)) out.push(cue('chip'));
  let dealt = 0;
  for (const p of next.order) dealt += Math.max(0, (next.cards[p]?.length ?? 0) - (prev.phase === next.phase ? prev.cards[p]?.length ?? 0 : 0));
  dealt += Math.max(0, next.dealer.length - (prev.phase === next.phase ? prev.dealer.length : 0));
  out.push(...run('card', dealt, t, TIMING.deal, 8));
  if (prev.phase === next.phase && next.dealer.some((c, i) => c && prev.dealer[i] === null)) out.push(cue('flip', t));
  return out;
}

/** Hold'em: a new hand (the pot to the winner, a shuffle, the deal), bets,
 *  and the flop, turn and river. */
export function pokerCues(prev: PokerView | null, next: PokerView): Cue[] {
  const n = next.order.filter((p) => next.inHand[p]).length;
  if (!prev) return [cue('shuffle'), ...run('card', n * 2, TIMING.shuffle, TIMING.deal * 0.7, 8)];
  const out: Cue[] = [];
  if (next.hand !== prev.hand) {
    out.push(cue('chips'), cue('shuffle', 200), ...run('card', n * 2, 200 + TIMING.shuffle, TIMING.deal * 0.7, 8));
    return out;
  }
  if (next.order.some((p) => (next.bet[p] ?? 0) > (prev.bet[p] ?? 0))) out.push(cue('chip'));
  else if (next.pot > prev.pot) out.push(cue('chips'));
  const newBoard = next.board.length - prev.board.length;
  if (newBoard > 0) out.push(...run('flip', newBoard, 120, TIMING.deal));
  return out;
}

/** Colour Clash: the deal, cards played, cards drawn, a reshuffled pile. */
export function clashCues(prev: ClashView | null, next: ClashView): Cue[] {
  if (!prev) return [cue('shuffle'), ...run('card', 7, TIMING.shuffle, 60, 7)];
  const out: Cue[] = [];
  if (next.top && next.top.id !== prev.top?.id) out.push(cue('card'));
  if (next.drawLeft > prev.drawLeft + 1) out.push(cue('shuffle'));
  else {
    const drawn = Object.keys(next.counts).reduce((a, p) => a + Math.max(0, next.counts[p] - (prev.counts[p] ?? 0)), 0);
    out.push(...run('draw', drawn, out.length ? 160 : 0, TIMING.deal, 4));
  }
  return out;
}

/** Letterworks: the tiles going down, or a swap. */
export function letterworksCues(prev: LetterworksView | null, next: LetterworksView): Cue[] {
  if (!prev || next.moves.length <= prev.moves.length) return [];
  const m = next.moves[next.moves.length - 1];
  if (m.kind === 'play') return run('place', m.tiles?.length ?? 1, 0, 70, 7);
  if (m.kind === 'exchange') return [cue('shuffle')];
  return [];
}

/** Realm Duel: the clash of a round. */
export function realmCues(prev: RealmView | null, next: RealmView): Cue[] {
  if (!prev || next.rounds.length <= prev.rounds.length) return [];
  return [cue('flip'), cue('capture', 220)];
}

/** Manor Mystery: someone walks to another room; a card is shown. */
export function manorCues(prev: ManorView | null, next: ManorView): Cue[] {
  if (!prev) return [];
  const out: Cue[] = [];
  if (Object.keys(next.positions).some((p) => next.positions[p] !== prev.positions[p])) out.push(cue('move'));
  const fresh = next.log.slice(prev.log.length);
  if (next.log.length > prev.log.length && fresh.some((e) => e.kind === 'show')) out.push(cue('flip', out.length ? 150 : 0));
  return out;
}

/** Camera table: the dice roller. */
export function cameraCues(prev: CameraTableView | null, next: CameraTableView): Cue[] {
  if (!prev || next.rollCount <= prev.rollCount) return [];
  return [cue('dice')];
}

/** Ship2Shore: orders passed to you, the ship sailing on. */
export function shipCues(prev: ShipView | null, next: ShipView): Cue[] {
  if (!prev) return [];
  const out: Cue[] = [];
  const cards = (v: ShipView) => v.you?.hand?.length ?? v.you?.helmCards?.length ?? 0;
  const gotCards = cards(next) > 0 && (cards(prev) === 0 || prev.phase !== next.phase);
  if (gotCards) out.push(...run('draw', cards(next), 0, TIMING.deal));
  if (next.ship.a !== prev.ship.a || next.ship.b !== prev.ship.b) out.push(cue('move'), cue('splash', 380));
  return out;
}

export const GAME_CUES: Record<string, Detect> = {
  snakes: snakesCues, ludo: ludoCues, fourinarow: fourCues, checkers: checkersCues, chess: chessCues,
  seabattle: seaCues, blackjack: blackjackCues, poker: pokerCues, colourclash: clashCues,
  letterworks: letterworksCues, realmduel: realmCues, manormystery: manorCues,
  cameratable: cameraCues, ship2shore: shipCues,
};

// ---- the room: whose turn, the end of the game ----

/** Did you win the game that just ended? (Your seat won, or you placed first.) */
export function youWon(snap: RoomSnapshot): boolean {
  const seat = snap.you.seat;
  if (!seat) return false;
  const r = snap.game.result;
  if (r && !r.aborted && r.winner === seat) return true;
  const mine = snap.lastResult?.players.find((p) => p.userId === snap.you.userId);
  return mine?.outcome === 'win';
}

/** Everything one snapshot change should sound like, in time order. */
export function tableCues(prev: RoomSnapshot, next: RoomSnapshot): Cue[] {
  const out: Cue[] = [];
  const started = next.game.status === 'playing' && prev.game.status !== 'playing';
  const detect = GAME_CUES[next.room.gameId];
  if (detect && next.game.view && (next.game.status === 'playing' || prev.game.status === 'playing')) {
    try { out.push(...detect(started ? null : prev.game.view ?? null, next.game.view)); } catch { /* a view we don't understand: stay quiet */ }
  }
  const seat = next.you.seat;
  const settle = out.reduce((m, c) => Math.max(m, c.at), 0);
  if (prev.game.status === 'playing' && next.game.status === 'over' && !next.game.result?.aborted) {
    out.push(cue(youWon(next) ? 'win' : 'end', settle + 250));
  } else if (seat && next.game.status === 'playing' && next.game.turnSeats.includes(seat)
    && !(prev.game.status === 'playing' && prev.you.seat === seat && prev.game.turnSeats.includes(seat))) {
    out.push(cue('turn', settle + 200));
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The move timer running low: a warning at 10 s, then a tick for each of
 *  the last 5. `before` and `now` are ms left. */
export function timerCue(before: number, now: number): Sound | null {
  if (now >= before || now <= 0) return null;
  if (before > 10_000 && now <= 10_000) return 'warn';
  for (let s = 5; s >= 1; s--) if (before > s * 1000 && now <= s * 1000) return 'tick';
  return null;
}
