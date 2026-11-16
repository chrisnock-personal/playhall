// Ship2Shore for AI players (#32): the position in words, from one seat's own
// view, and the legal moves as numbered options for a language model to pick
// from. Only what that seat could know goes in.

import { CHARTS, FACTIONS, HEADINGS, ORDERS, ROLES, orderHeading, orderKind, portOdds, posKey, sailFrom, type Faction, type LogEntry, type Order, type ShipView } from './ship2shore';
import type { AiGame, AiOption } from '../ai';
import type { SeatId } from '../game';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const FACTION_WORDS: Record<Faction, string> = { navy: 'Royal Navy', spy: 'enemy spies', bm: 'Black Market' };

function odds(v: ShipView, at = v.ship) {
  const o = portOdds(CHARTS[v.chart])[posKey(at)];
  return `U-boats ${pct(o.spy)}, Lisbon ${pct(o.bm)}, Plymouth ${pct(o.navy)}`;
}

/** An order in words, with the chance it gives your side's port. */
function orderWords(v: ShipView, o: Order): string {
  const to = sailFrom(CHARTS[v.chart], v.ship, orderHeading(o));
  const mine = portOdds(CHARTS[v.chart])[posKey(to)][v.you!.faction];
  return `${ORDERS[orderKind(o)].title} on the ${HEADINGS[orderHeading(o)]}: your side's chance from there ${pct(mine)}`;
}

function logLine(e: LogEntry, n: (s: SeatId) => string): string | null {
  switch (e.k) {
    case 'round': return `Round ${e.n}: ${n(e.captain)} is captain.`;
    case 'pick': return `${n(e.seat)} picked ${n(e.officer)} as first officer and ${n(e.helm)} as helmsman.`;
    case 'vote': return `Vote of no confidence: ${e.total} of ${e.need} rounds (${Object.entries(e.votes).filter(([, x]) => x > 0).map(([p, x]) => `${n(p)} ${x}`).join(', ') || 'nobody'}); ${e.mutiny ? `mutiny${e.captain ? `, ${n(e.captain)} takes command` : ''}` : 'the captain stays'}.`;
    case 'order': return `The ship sailed on a ${HEADINGS[orderHeading(e.order)]} order (${ORDERS[orderKind(e.order)].title}).`;
    case 'action': return e.target ? `${n(e.seat)} used ${e.action} on ${n(e.target)}${e.not ? `: not ${FACTION_WORDS[e.not]}` : ''}.` : null;
    case 'abandon': return `${n(e.seat)} abandoned post and jumped overboard.`;
    case 'shoreleave': return `Shore leave: ${n(e.captain)} takes command.`;
    case 'contraband': return 'Contraband: the Fixer made a secret move.';
    case 'resupply': return 'Resupplied: everyone back up to three rounds.';
    default: return null;
  }
}

function describe(view: unknown, seat: SeatId, names: Record<SeatId, string>): string {
  const v = view as ShipView;
  const y = v.you!;
  const n = (s: SeatId) => (s === seat ? 'you' : names[s] ?? s);
  const role = ROLES[y.role];
  const lines: string[] = [];
  lines.push(`You are ${names[seat] ?? seat}, playing Ship2Shore: a hidden-role game aboard the SS Marigold in 1943. The Royal Navy want Plymouth, the enemy spies want the U-boat rendezvous, the Black Market want Lisbon. Every player's side is secret.`);
  lines.push(`Your role: ${role.title}. You are on the ${FACTION_WORDS[y.faction]} side${y.faction !== role.faction ? ' (you were bribed)' : ''}: ${FACTIONS[y.faction].port} is where you want the ship.`);
  if (y.spies) lines.push(`The spies (your side): ${y.spies.map(n).join(', ')}.`);
  if (y.partners.length) lines.push(`Black Market people you know: ${y.partners.map(n).join(', ')}.`);
  if (y.role === 'fixer') lines.push('If you are thrown to the sharks, the Black Market wins at once, so you may want to look suspicious.');
  lines.push(`You have ${y.ammo} rounds of ammunition (secret). Players aboard: ${v.order.filter((p) => !v.overboard.includes(p)).map(n).join(', ')}.${v.overboard.length ? ` In the water: ${v.overboard.map(n).join(', ')}.` : ''}`);
  lines.push(`Round ${v.round}. Captain: ${n(v.captain)}${v.officer ? `, first officer ${n(v.officer)}` : ''}${v.helm ? `, helmsman ${n(v.helm)}` : ''}. Mutiny needs ${v.threshold} rounds.`);
  lines.push(`Your side's chance of reaching ${FACTIONS[y.faction].port} from where the ship is now: ${pct(portOdds(CHARTS[v.chart])[posKey(v.ship)][y.faction])} (all ports: ${odds(v)}). Orders with a higher chance for your side help you.`);
  const secrets = y.secrets.slice(-4).map((x) => {
    if (x.k === 'inspect') return `You inspected ${n(x.target)}: ${FACTION_WORDS[x.faction]}.`;
    if (x.k === 'bridge') return `You saw the bridge: ${Object.entries(x.seen).map(([p, f]) => `${n(p)} ${FACTION_WORDS[f]}`).join(', ')}.`;
    if (x.k === 'drew') return `Round ${x.round}: you drew ${x.cards.map((c) => HEADINGS[orderHeading(c)]).join(' and ')}, kept ${HEADINGS[orderHeading(x.kept)]}.`;
    if (x.k === 'steered') return `Round ${x.round}: at the wheel you saw ${x.cards.map((c) => HEADINGS[orderHeading(c)]).join(' and ')}.`;
    if (x.k === 'bribed') return `${n(x.by)} is the Fixer and bribed you.`;
    return null;
  }).filter(Boolean);
  if (secrets.length) lines.push(`What only you know: ${secrets.join(' ')}`);
  const log = v.log.map((e) => logLine(e, n)).filter((l): l is string => !!l).slice(-8);
  if (log.length) lines.push(`Recent events: ${log.join(' ')}`);
  return lines.join('\n');
}

function options(view: unknown, seat: SeatId, names: Record<SeatId, string>): AiOption[] {
  const v = view as ShipView;
  const y = v.you;
  if (!y || !y.toAct || v.result) return [];
  const n = (s: SeatId) => (s === seat ? 'yourself' : names[s] ?? s);
  switch (v.phase) {
    case 'pick': {
      const out: AiOption[] = [];
      for (const o of v.choices) for (const h of v.choices) if (o !== h) out.push({ label: `First officer ${n(o)}, helmsman ${n(h)}`, action: { type: 'pick', officer: o, helm: h } });
      return out.slice(0, 24);
    }
    case 'vote':
      return Array.from({ length: y.ammo + 1 }, (_, k) => ({ label: k === 0 ? `Back the captain (${n(v.captain)}): commit 0 rounds` : `Commit ${k} round${k === 1 ? '' : 's'} against ${n(v.captain)}`, action: { type: 'vote', rounds: k } }));
    case 'tiebreak': return v.tied.map((p) => ({ label: `Hand command to ${n(p)}`, action: { type: 'tiebreak', target: p } }));
    case 'emergency': return v.choices.map((p) => ({ label: `${n(p)} as emergency helmsman`, action: { type: 'emergency', target: p } }));
    case 'draw': return (y.hand ?? []).map((o, i) => ({ label: `Keep ${orderWords(v, o)}`, action: { type: 'keep', index: i } }));
    case 'steer': return (y.helmCards ?? []).map((o, i) => ({ label: `Discard ${HEADINGS[orderHeading(o)]}; sail on ${orderWords(v, y.helmCards![1 - i])}`, action: { type: 'steer', index: i } }));
    case 'target': return v.choices.map((p) => ({ label: `${v.target === 'sharks' ? 'Throw' : 'Pick'} ${n(p)}${v.target === 'sharks' ? ' to the sharks' : ''}`, action: { type: 'target', target: p } }));
    case 'spot': return y.spotCard ? [
      { label: `Leave ${orderWords(v, y.spotCard)} on top`, action: { type: 'spot', keep: true } },
      { label: 'Discard it', action: { type: 'spot', keep: false } },
    ] : [];
    case 'contraband':
      if (!y.fixerMove) return [{ label: 'Carry on', action: { type: 'ack' } }];
      return [
        ...y.bribable.map((p) => ({ label: `Bribe ${n(p)} onto the Black Market's side`, action: { type: 'contraband', option: 'bribe', target: p } })),
        { label: 'Look at the bridge watch (see their sides)', action: { type: 'contraband', option: 'bridge' } },
        { label: `Hand out cash: a round to yourself${y.partners.length ? ` and ${y.partners.slice(0, 2).map(n).join(' and ')}` : ''}`, action: { type: 'contraband', option: 'cash', gifts: [seat, ...y.partners].slice(0, 3).join(',') } },
      ];
    default: return [];
  }
}

/** What this decision is, in a line, for the prompt. */
function question(view: unknown): string {
  const v = view as ShipView;
  switch (v.phase) {
    case 'pick': return 'You are the captain: pick a first officer and a helmsman for this round.';
    case 'vote': return 'Vote of no confidence in the captain: commit rounds in secret, or back them.';
    case 'draw': return 'Plotting the course: keep one of your two orders (the other is discarded unseen). No talking on the bridge now.';
    case 'steer': return 'You are at the wheel: discard one of the two kept orders; the ship sails on the other. No talking on the bridge now.';
    case 'target': return `The captain must pick a player: ${v.target}.`;
    case 'spot': return 'Spotter: leave the top order of the deck where it is, or discard it.';
    case 'contraband': return v.you?.fixerMove ? 'You are the Fixer: make your contraband move.' : 'Contraband aboard: the Fixer is making a secret move.';
    case 'tiebreak': return 'You were overthrown and the biggest backers tied: who takes command?';
    case 'emergency': return 'Your helmsman jumped overboard: pick an emergency helmsman.';
    default: return 'Your move.';
  }
}

/** Table talk is allowed except on the bridge while plotting and under radio silence. */
function canTalk(view: unknown, seat: SeatId): boolean {
  const v = view as ShipView;
  if (v.silenced.includes(seat) || v.overboard.includes(seat)) return false;
  return !(v.phase === 'draw' || v.phase === 'steer');
}

/** The model makes the social choices: the watch, votes, who to pick, the
 *  Fixer's deal. The rule bot keeps and steers orders by their odds. */
function modelDecides(view: unknown): boolean {
  const v = view as ShipView;
  if (v.phase === 'contraband') return !!v.you?.fixerMove;
  return ['pick', 'vote', 'tiebreak', 'emergency', 'target'].includes(v.phase ?? '');
}

export const ship2shoreAi: AiGame = { describe, options, question, canTalk, modelDecides };
