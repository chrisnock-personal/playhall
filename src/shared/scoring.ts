// Points for a finished game (user, 2026-11-15):
//   sole winner 3; a shared first place (a draw) 1 each;
//   second place 1 (each, if shared) in games of three or more, when first
//   place isn't shared; everyone else 0.
// In two-player games the loser isn't "second": win 3, draw 1, loss 0.

import type { GameResult, SeatId } from './game';
import type { Outcome } from './protocol';

export interface SeatScore {
  outcome: Outcome;
  points: number;
  /** 1 = first; players sharing a place share its number. */
  place: number;
}

export function placingsOf(result: GameResult, seats: SeatId[]): SeatId[][] {
  if (result.placings?.length) return result.placings;
  if (result.winner) return [[result.winner], seats.filter((s) => s !== result.winner)];
  return [seats];
}

export function score(result: GameResult, seats: SeatId[]): Record<SeatId, SeatScore> {
  // Everyone lost (user, 2026-11-16: an unsolved Manor Mystery scores nothing).
  if (result.nobodyWins) return Object.fromEntries(seats.map((s) => [s, { outcome: 'loss' as Outcome, points: 0, place: 1 }]));
  const placings = placingsOf(result, seats);
  const out: Record<SeatId, SeatScore> = {};
  placings.forEach((group, i) => {
    for (const seat of group) {
      let outcome: Outcome = 'loss';
      let points = 0;
      if (i === 0 && group.length === 1) { outcome = 'win'; points = 3; }
      else if (i === 0) { outcome = 'draw'; points = 1; }
      else if (i === 1 && placings[0].length === 1 && seats.length >= 3) points = 1;
      out[seat] = { outcome, points, place: i + 1 };
    }
  });
  for (const seat of seats) out[seat] ??= { outcome: 'loss', points: 0, place: placings.length + 1 };
  return out;
}
