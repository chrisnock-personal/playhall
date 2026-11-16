// Ship2Shore table talk for bots and AI players: when someone at the table
// asks a player who was on the bridge what orders they had, they answer. A
// Navy bot tells the truth; a spy or Black Market bot lies when the truth
// would give it away (it passed over a Navy order). An AI player is told the
// truth and decides for itself (src/server/rooms/room.ts asks the model).

import { HEADINGS, orderHeading, type Order, type Secret, type ShipView } from './ship2shore';
import type { BotTalk } from '../bots';
import type { SeatId } from '../game';

const short = (name: string) => name.replace(/\s*\((bot|AI)\)\s*$/i, '').trim();
const heading = (o: Order) => HEADINGS[orderHeading(o)].replace(' heading', '');
// Navy, U-boat and Lisbon all take "a" (a U-boat: "you").
const aOrder = (o: Order) => `a ${heading(o)} order`;

/** The latest round this seat had orders in its hands: what it drew or steered. */
function lastBridge(v: ShipView): Extract<Secret, { k: 'drew' | 'steered' }> | null {
  const y = v.you;
  if (!y) return null;
  for (let i = y.secrets.length - 1; i >= 0; i--) {
    const x = y.secrets[i];
    if (x.k === 'drew' || x.k === 'steered') return x;
  }
  return null;
}

/** The job this seat held in the latest round it was on the bridge. */
function jobIn(v: ShipView, seat: SeatId, round: number): string[] {
  const jobs: string[] = [];
  const pick = [...v.log].reverse().find((e) => e.k === 'pick');
  const roundStart = [...v.log].reverse().find((e) => e.k === 'round' && e.n === round);
  if (roundStart && roundStart.k === 'round' && roundStart.captain === seat) jobs.push('captain', 'skipper');
  if (pick && pick.k === 'pick') {
    if (pick.officer === seat) jobs.push('first officer', 'officer', 'mate');
    if (pick.helm === seat) jobs.push('helmsman', 'helm', 'wheel');
  }
  return jobs;
}

const QUESTION = /\?|\b(what|which|why|how come|did you|you had|you have|you got|claim|cards?|orders?)\b/i;

function asked(view: unknown, seat: SeatId, text: string, names: Record<SeatId, string>): boolean {
  const v = view as ShipView;
  const memory = lastBridge(v);
  if (!memory || !QUESTION.test(text)) return false;
  const t = text.toLowerCase();
  // Anyone named: only they answer.
  const mentions = (s: SeatId) => {
    const name = short(names[s] ?? '').toLowerCase();
    return !!name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t);
  };
  const named = Object.keys(names).filter(mentions);
  if (named.length) return named.includes(seat);
  // Nobody named: the bridge in general, or the job it held, in the round it remembers.
  if (memory.round === v.round || memory.round === v.round - 1) {
    if (/\b(bridge|watch|you lot|you three)\b/.test(t)) return true;
    return jobIn(v, seat, memory.round).some((j) => new RegExp(`\\b${j}\\b`).test(t));
  }
  return false;
}

function truth(view: unknown): string | null {
  const v = view as ShipView;
  const x = lastBridge(v);
  if (!x) return null;
  if (x.k === 'drew') return `In round ${x.round} you drew ${aOrder(x.cards[0])} and ${aOrder(x.cards[1])}, and kept the ${heading(x.kept)} one.`;
  return `In round ${x.round} you were at the wheel with ${aOrder(x.cards[0])} and ${aOrder(x.cards[1])}, and the ship sailed on the ${heading(x.played)} one.`;
}

function answer(view: unknown, _seat: SeatId, random: () => number): string | null {
  const v = view as ShipView;
  const y = v.you;
  const x = lastBridge(v);
  if (!y || !x) return null;
  const pickOne = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  const kept = x.k === 'drew' ? x.kept : x.played;
  const other = x.cards[0] === kept ? x.cards[1] : x.cards[0];
  // Passing over a Navy order looks bad: anyone not Navy hides it.
  const lie = y.faction !== 'navy' && orderHeading(other) === 'navy' && orderHeading(kept) !== 'navy';
  const shown = lie ? [kept, kept] : [x.cards[0], x.cards[1]];
  const same = orderHeading(shown[0]) === orderHeading(shown[1]);
  if (x.k === 'drew') {
    return same
      ? pickOne([`I drew two ${heading(kept)} orders, nothing else to keep.`, `Both of mine were ${heading(kept)} orders, honestly.`, `Two ${heading(kept)}s. No choice at all.`])
      : pickOne([`I had ${aOrder(shown[0])} and ${aOrder(shown[1])}, and kept the ${heading(kept)} one.`, `${aOrder(shown[0])[0].toUpperCase()}${aOrder(shown[0]).slice(1)} and ${aOrder(shown[1])}. I passed on the ${heading(other)}.`]);
  }
  return same
    ? pickOne([`At the wheel I had two ${heading(kept)} orders, so that's where she went.`, `Both orders I got were ${heading(kept)}. Ask the other two.`])
    : pickOne([`I was handed ${aOrder(shown[0])} and ${aOrder(shown[1])}, and sailed on the ${heading(kept)} one.`, `${aOrder(shown[0])[0].toUpperCase()}${aOrder(shown[0]).slice(1)} and ${aOrder(shown[1])}; I chose the ${heading(kept)}.`]);
}

/** Talking is allowed except on the bridge while plotting, under radio silence or in the water. */
function canTalk(view: unknown, seat: SeatId): boolean {
  const v = view as ShipView;
  if (!v.you || v.result || v.silenced.includes(seat) || v.overboard.includes(seat)) return false;
  const plotting = v.phase === 'draw' || v.phase === 'steer';
  return !(plotting && [v.captain, v.officer, v.helm].includes(seat));
}

export const ship2shoreTalk: BotTalk = { asked, truth, answer, canTalk };
