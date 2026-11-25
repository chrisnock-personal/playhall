// A Bounty Board computer player (#18). It looks only at its own view (board,
// dollars, shop and legal moves), takes the material it can get without
// hanging a piece, and buys the first affordable gadget that fits. Gentle
// plays with noise and never shops; strong takes the best move with little
// noise and always shops.

import type { SeatId } from '../game';
import type { BotLevel } from '../bots';
import { BOUNTY, GADGETS, gadgetInfo, pieceValue, applyMove, movesFrom, type BountyMove, type BountyView, type GadgetId, type BountyPiece } from './bountyboard';
import type { BountyBuy } from './bountyboard';

const CENTRE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 5, 5, 5, 5, 5, 5, 0,
  0, 5, 10, 10, 10, 10, 5, 0,
  0, 5, 10, 20, 20, 10, 5, 0,
  0, 5, 10, 20, 20, 10, 5, 0,
  0, 5, 10, 10, 10, 10, 5, 0,
  0, 5, 5, 5, 5, 5, 5, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const URGENCY: Record<GadgetId, number> = {
  vest: 10, longrifle: 8, ladder: 7, spurs: 7, reward: 6,
  bountyhunter: 5, ironhorse: 5, railswitch: 4, sidewinder: 3, lasso: 3,
};

/** Is this square attacked by the given side right now? */
function attacked(board: (BountyPiece | null)[], square: number, side: 'white' | 'black'): boolean {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.side !== side) continue;
    if (movesFrom(board, i, true).some((m) => m.capture === square)) return true;
  }
  return false;
}

function moveScore(v: BountyView, m: BountyMove): number {
  const mover = v.board[m.from]!;
  let score = CENTRE[m.to] / 4;
  if (m.capture !== undefined) {
    const victim = v.board[m.capture]!;
    const reward = v.board.some((p) => p?.side === v.turn && p.gadgets.includes('reward')) ? 3 : 0;
    score += 10 * pieceValue(victim) + 2 * (BOUNTY[victim.kind] + victim.gadgets.length * 2 + reward);
  }
  if (m.pull !== undefined) score += 6;
  if (m.via !== undefined) score += 3;
  const landed = applyMove(v.board, m.from, m);
  if (landed.vested) score += 2;
  if (landed.promoted) score += 25;
  const home = m.pull === undefined ? m.to : m.from;
  const foe = v.turn === 'white' ? 'black' : 'white';
  // A piece that will simply be taken back is a bad move, even if it captured.
  if (m.pull === undefined && attacked(landed.board, home, foe)) {
    score -= pieceValue(mover) * 4;
  }
  return score;
}

function chooseBuy(v: BountyView, random: () => number): BountyBuy | undefined {
  if (v.shop !== 'open') return undefined;
  const dollars = v.dollars[v.turn];
  let best: BountyBuy | undefined;
  let bestScore = -Infinity;
  for (const gadget of GADGETS) {
    if (gadget.cost > dollars) continue;
    for (let square = 0; square < 64; square++) {
      const p = v.board[square];
      if (!p || p.side !== v.turn || p.kind === 'king') continue;
      const info = gadgetInfo(gadget.id)!;
      if (info.who !== 'any' && info.who !== p.kind) continue;
      if (p.gadgets.length >= 2 || p.gadgets.includes(gadget.id)) continue;
      let score = URGENCY[gadget.id] + pieceValue(p) / 10 + random() * 3;
      if (gadget.id === 'spurs' && p.kind === 'pawn') score += (p.side === 'white' ? 7 - Math.floor(square / 8) : Math.floor(square / 8));
      if (score > bestScore) { bestScore = score; best = { gadget: gadget.id, square }; }
    }
  }
  return best;
}

/** The move this bot picks in a view (exported for tests). */
export function chooseBountyMove(v: BountyView, random: () => number, level: BotLevel = 'fair'): BountyMove | null {
  if (!v.legal.length) return null;
  const noise = level === 'gentle' ? 60 : level === 'strong' ? 1 : 12;
  let best: BountyMove[] = [];
  let bestScore = -Infinity;
  for (const m of v.legal) {
    const score = moveScore(v, m) + random() * noise;
    if (score > bestScore + 0.001) { bestScore = score; best = [m]; }
    else if (Math.abs(score - bestScore) < 0.001) best.push(m);
  }
  return best[Math.floor(random() * best.length)] ?? null;
}

export function bountyBoardBot(view: unknown, seat: SeatId, random: () => number, _words?: unknown, level: BotLevel = 'fair'): unknown | null {
  const v = view as BountyView;
  if (v.result || v.turn !== seat) return null;
  const move = chooseBountyMove(v, random, level);
  if (!move) return null;
  const buy = level === 'gentle' ? undefined : chooseBuy(v, random);
  return { type: 'move', ...move, ...(buy ? { buy } : {}) };
}
