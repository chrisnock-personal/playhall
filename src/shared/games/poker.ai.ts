// Texas Hold'em for AI players (#32): the hand in words from one seat's own
// view (its two cards, the board, the pot and what it costs to stay in, with
// the rule bot's estimate of the chance of winning), and the legal moves as
// options. The model makes every decision, and can talk at the table: a
// little bluster, never a word about its cards.

import { bestHand, type PokerView } from './poker';
import { equity } from './card.bots';
import type { AiGame, AiOption } from '../ai';
import type { SeatId } from '../game';

const RANK: Record<string, string> = { T: '10', J: 'jack', Q: 'queen', K: 'king', A: 'ace' };
const SUIT: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const cardWords = (c: string) => `${RANK[c[0]] ?? c[0]} of ${SUIT[c[1]]}`;

function describe(view: unknown, seat: SeatId, names: Record<SeatId, string>): string {
  const v = view as PokerView;
  const n = (p: SeatId) => (p === seat ? 'you' : names[p] ?? p);
  const lines: string[] = [];
  lines.push(`You are ${names[seat] ?? seat}, playing Texas Hold'em with play chips (no real money). Hand ${v.hand}; blinds ${v.blinds[0]}/${v.blinds[1]}.`);
  if (v.hole) lines.push(`Your cards: ${v.hole.map(cardWords).join(' and ')}.`);
  lines.push(v.board.length ? `The board (${v.street}): ${v.board.map(cardWords).join(', ')}.` : 'No shared cards yet (before the flop).');
  if (v.hole && v.board.length >= 3) lines.push(`Your best hand now: ${bestHand([...v.hole, ...v.board]).name}.`);
  const opponents = v.order.filter((p) => p !== seat && v.inHand[p] && !v.folded[p]);
  if (v.hole) lines.push(`Against ${opponents.length} other player${opponents.length === 1 ? '' : 's'} still in, your chance of winning is roughly ${Math.round(equity(v.hole, v.board, Math.max(1, opponents.length), Math.random, 150) * 100)}%.`);
  lines.push(`Pot ${v.pot}. To call: ${v.toCall}. Your chips: ${v.chips[seat]}. Others: ${v.order.filter((p) => p !== seat && !v.out.includes(p)).map((p) => `${n(p)} ${v.chips[p]}${v.folded[p] ? ' (folded)' : ''}`).join(', ')}.`);
  const log = v.log.slice(-8).map((e) => `${n(e.seat)} ${e.text}`);
  if (log.length) lines.push(`Recent: ${log.join('; ')}.`);
  return lines.join('\n');
}

function options(view: unknown, seat: SeatId): AiOption[] {
  const v = view as PokerView;
  if (v.result || v.toAct !== seat || !v.hole) return [];
  const stack = v.chips[seat];
  const mine = v.bet[seat] ?? 0;
  const out: AiOption[] = [];
  if (v.toCall > 0) out.push({ label: 'Fold', action: { type: 'fold' } });
  out.push(v.toCall > 0 ? { label: `Call ${Math.min(v.toCall, stack)}`, action: { type: 'call' } } : { label: 'Check', action: { type: 'check' } });
  if (v.canRaise && stack > v.toCall) {
    const all = mine + stack;
    if (v.minRaiseTo < all) out.push({ label: `Raise to ${v.minRaiseTo} (the smallest raise)`, action: { type: 'raise', to: v.minRaiseTo } });
    const potSize = Math.max(v.minRaiseTo, mine + v.toCall + v.pot);
    if (potSize < all && potSize !== v.minRaiseTo) out.push({ label: `Raise to ${potSize} (about the pot)`, action: { type: 'raise', to: potSize } });
  }
  // All in raises, so only when raising is allowed (after a short all-in it isn't), or when calling takes everything anyway.
  if ((v.canRaise && stack > v.toCall) || (stack <= v.toCall && v.toCall > 0)) out.push({ label: `All in (${stack})`, action: { type: 'allin' } });
  return out;
}

export const pokerAi: AiGame = {
  describe,
  options,
  question: () => 'Your move in this betting round.',
  // Table talk is part of poker: bluster is fine, saying what you hold isn't required.
  canTalk: () => true,
};
