// Manor Mystery for AI players (#32): the case in words from one seat's own
// view (its cards, what it has worked out, what has happened), and the
// choices that are about people as options: what to suggest, which card to
// show when asked, whether to accuse. Moving and ending the turn stay with the
// rule bot. An accusation is offered only once the deduction is certain, so
// the model can't throw the game away on a guess.

import { CARDS, OBJECTS, SUSPECTS, type CardId, type ManorView } from './manormystery';
import { deduce } from './manormystery.bot';
import type { AiGame, AiOption } from '../ai';
import type { SeatId } from '../game';

const nm = (c: CardId) => CARDS[c].name;

function describe(view: unknown, seat: SeatId, names: Record<SeatId, string>): string {
  const v = view as ManorView;
  const n = (p: SeatId) => (p === seat ? 'you' : names[p] ?? p);
  const { envelope, open } = deduce(v, seat);
  const lines: string[] = [];
  lines.push(`You are ${names[seat] ?? seat}, playing Manor Mystery: a murder at Blackthorn Hall. A suspect, an object and a room are hidden in the envelope; work them out from the cards you see.`);
  lines.push(`Your cards: ${(v.hand ?? []).map(nm).join(', ')}.`);
  lines.push(`Still possible: suspects ${open.suspect.map(nm).join(', ')}; objects ${open.object.map(nm).join(', ')}; rooms ${open.room.map(nm).join(', ')}.`);
  const known = [envelope.suspect && nm(envelope.suspect), envelope.object && nm(envelope.object), envelope.room && nm(envelope.room)].filter(Boolean);
  if (known.length) lines.push(`You are sure of: ${known.join(', ')}.`);
  lines.push(`You are in ${nm(v.positions[seat])}.`);
  const recent = v.log.slice(-8).map((e) => {
    if (e.kind === 'suggest') return `${n(e.seat)} suggested ${nm(e.suspect)} with ${nm(e.object)} in ${nm(e.room)}`;
    if (e.kind === 'show') return `${n(e.seat)} showed ${n(e.to)} a card${e.card ? ` (${nm(e.card)})` : ''}`;
    if (e.kind === 'pass') return `${n(e.seat)} had none of them`;
    if (e.kind === 'nobody') return 'nobody could show a card';
    if (e.kind === 'accuse') return `${n(e.seat)} accused wrongly`;
    return null;
  }).filter(Boolean);
  if (recent.length) lines.push(`Recently: ${recent.join('; ')}.`);
  return lines.join('\n');
}

function options(view: unknown, seat: SeatId): AiOption[] {
  const v = view as ManorView;
  if (v.result || !v.hand) return [];
  // Asked to show a card: which one.
  if (v.pending?.refuter === seat) return (v.mustShow ?? []).map((c) => ({ label: `Show ${nm(c)}`, action: { type: 'show', card: c } }));
  if (v.turn !== seat || v.pending || v.out.includes(seat) || !v.moved) return [];
  const { envelope, open } = deduce(v, seat);
  const out: AiOption[] = [];
  if (envelope.suspect && envelope.object && envelope.room) out.push({ label: `Accuse ${nm(envelope.suspect)} with ${nm(envelope.object)} in ${nm(envelope.room)} (you are certain)`, action: { type: 'accuse', ...envelope } });
  if (!v.suggested) {
    const sus = (open.suspect.length ? open.suspect : [...SUSPECTS]).slice(0, 4);
    const obj = (open.object.length ? open.object : [...OBJECTS]).slice(0, 4);
    for (const s of sus) for (const o of obj) out.push({ label: `Suggest ${nm(s)} with ${nm(o)} in ${nm(v.positions[seat])}`, action: { type: 'suggest', suspect: s, object: o } });
  }
  return out;
}

export const manorAi: AiGame = {
  describe,
  options,
  question: (view) => ((view as ManorView).pending ? 'You have been asked to show one of these cards to the player who suggested them (only they will see it).' : 'Your turn: make a suggestion (or accuse, if you are certain).'),
  // No table talk: the suggestions are in the game's log already, and a model
  // announcing one suggestion while making another only confuses people.
  canTalk: () => false,
  // The model picks suggestions, which card to show, and when to accuse; the rule bot moves and ends turns.
  modelDecides: (view) => {
    const v = view as ManorView;
    return !!v.pending || (v.moved && !v.suggested) || false;
  },
};
