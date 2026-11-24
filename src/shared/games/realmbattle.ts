// Realm Battle (#34): Realm Duel's creatures for more than two. Team battles
// (2 against 2, 3 against 3: Amber, Violet and Lime against Teal, Rose and
// Blue) or a free-for-all for three or four. Each player has their own hand.
// Every round everyone secretly picks a creature, an attack style and a
// target (a player on the other side); then all the fighters strike in
// Agility order. A player with nothing standing is out; the last team (or
// player) with creatures standing wins. Uses Realm Duel's creatures, damage
// and elements (realmduel.ts).

import type { GameResult, SeatDef, SeatId } from '../game';
import {
  CREATURES, MEND, POISON_DAMAGE, POISON_ROUNDS, STYLES, STYLE_NAME, UNDERTOW_CHANCE, GUST_CHANCE,
  bestStyle, damage, deal, type Fighter, type FighterView, type Style,
} from './realmduel';
import { withHistory, type GameHistory } from './history';

export const SEATS = ['amber', 'teal', 'violet', 'rose', 'lime', 'blue'];
const LABEL: Record<string, string> = { amber: 'Amber', teal: 'Teal', violet: 'Violet', rose: 'Rose', lime: 'Lime', blue: 'Blue' };
export type Mode = '2v2' | '3v3' | 'ffa';
export interface BattleConfig { mode: Mode; hand: 2 | 3 }
export const MAX_ROUNDS = 60;
export const TEAM_NAMES = ['Sun', 'Moon'];

export interface BChoice { creature: number; style: Style; target: SeatId }

export interface BattleState {
  config: BattleConfig;
  order: SeatId[];
  /** Team of each player: 0 (Sun) or 1 (Moon); in a free-for-all, each their own. */
  team: Record<SeatId, number>;
  hands: Record<SeatId, Fighter[]>;
  choices: Record<SeatId, BChoice | null>;
  /** Players knocked out of the battle, in the order they went (ties together). */
  out: SeatId[][];
  rounds: { n: number; lines: string[]; picks: Record<SeatId, { kind: string; style: Style; target: SeatId; dealt: number; ko: boolean }> }[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface BattleView {
  you: SeatId | null;
  mode: Mode;
  order: SeatId[];
  team: Record<SeatId, number>;
  round: number;
  hands: Record<SeatId, (FighterView | null)[]>;
  locked: Record<SeatId, boolean>;
  /** Your choice, and your team mates' once they've locked in. */
  teamChoices: Record<SeatId, BChoice>;
  out: SeatId[];
  rounds: BattleState['rounds'];
  result: GameResult | null;
}

const standing = (hand: Fighter[]) => hand.filter((f) => f.hp > 0).length;
export const alive = (s: Pick<BattleState, 'order' | 'hands'>) => s.order.filter((p) => standing(s.hands[p]) > 0);
export const enemiesOf = (s: Pick<BattleState, 'order' | 'hands' | 'team'>, p: SeatId) => alive(s).filter((q) => s.team[q] !== s.team[p]);

function decide(s: BattleState): GameResult | null {
  const left = alive(s);
  const teams = [...new Set(left.map((p) => s.team[p]))];
  const ffa = s.config.mode === 'ffa';
  const placeOut = [...s.out].reverse();
  if (teams.length > 1 && s.rounds.length < MAX_ROUNDS) return null;
  if (!left.length) return { winner: null, placings: placeOut, reason: 'everyone being knocked out at once' };
  if (teams.length === 1) {
    const winners = s.order.filter((p) => s.team[p] === teams[0]);
    const rest = placeOut.map((g) => g.filter((p) => !winners.includes(p))).filter((g) => g.length);
    return ffa
      ? { winner: left[0], placings: [left, ...rest], reason: 'the last player with creatures standing' }
      : { winner: null, placings: [winners, ...rest], reason: 'knocking out the other team', teamWin: true };
  }
  // The round limit: more creatures standing, then more Health, by team.
  const score = (t: number) => s.order.filter((p) => s.team[p] === t).reduce((n, p) => n + standing(s.hands[p]) * 1000 + s.hands[p].reduce((h, f) => h + f.hp, 0), 0);
  const best = [...teams].sort((a, b) => score(b) - score(a))[0];
  const winners = s.order.filter((p) => s.team[p] === best);
  return { winner: winners.length === 1 ? winners[0] : null, placings: [winners, s.order.filter((p) => !winners.includes(p))], reason: `the ${MAX_ROUNDS}-round limit`, ...(ffa ? {} : { teamWin: true }) };
}

/** Everyone has chosen: all the fighters strike, fastest first. */
export function resolveRound(s: BattleState, random: () => number): BattleState {
  const hands: Record<SeatId, Fighter[]> = Object.fromEntries(s.order.map((p) => [p, s.hands[p].map((f) => ({ ...f }))]));
  const fighting = alive(s);
  const ch = s.choices as Record<SeatId, BChoice>;
  const f = (p: SeatId) => hands[p][ch[p].creature];
  const c = (p: SeatId) => CREATURES[f(p).kind];
  const name = (p: SeatId) => `${LABEL[p]}’s ${c(p).name}`;
  const lines: string[] = [];
  const picks: BattleState['rounds'][number]['picks'] = {};
  for (const p of fighting) { f(p).revealed = true; picks[p] = { kind: f(p).kind, style: ch[p].style, target: ch[p].target, dealt: 0, ko: false }; }
  // Agility order; a tie goes to Swift, then a coin.
  const rolls = Object.fromEntries(fighting.map((p) => [p, random()]));
  const order = [...fighting].sort((a, b) => c(b).agi - c(a).agi || Number(c(b).ability === 'swift') - Number(c(a).ability === 'swift') || rolls[a] - rolls[b]);
  lines.push(`Order: ${order.map((p) => name(p)).join(', ')}.`);
  for (const p of order) {
    const me = f(p);
    if (me.hp <= 0) continue;
    if (me.stunned) { me.stunned = false; lines.push(`${name(p)} is stunned and loses its attack.`); continue; }
    // The target's fighter, or (if it's down) another enemy still fighting.
    const live = (q: SeatId) => fighting.includes(q) && s.team[q] !== s.team[p] && f(q).hp > 0;
    // The target's fighter, or (if it has fallen) another enemy still fighting, at random.
    const others = fighting.filter(live);
    const target = live(ch[p].target) ? ch[p].target : others[Math.floor(random() * others.length)];
    if (!target) continue;
    const foe = f(target);
    const hit = damage(c(p), c(target), ch[p].style, foe.shielded);
    foe.hp = Math.max(0, foe.hp - hit.damage);
    picks[p].dealt += hit.damage;
    lines.push(`${name(p)} hits ${name(target)} for ${hit.damage}${hit.advantage ? ` (${c(p).element} beats ${c(target).element})` : ''}${foe.shielded ? ' (shielded)' : ''}${target !== ch[p].target ? ', its target having fallen' : ''}.`);
    if (foe.hp <= 0) { lines.push(`${name(target)} is knocked out!`); picks[target].ko = true; continue; }
    const ab = c(p).ability, st = ch[p].style;
    if ((ab === 'undertow' && st === 'magic' && random() < UNDERTOW_CHANCE) || (ab === 'gust' && st === 'ranged' && random() < GUST_CHANCE)) {
      foe.stunned = true;
      lines.push(`${c(p).abilityName}: ${name(target)} is stunned.`);
    }
    if (ab === 'poison' && st === 'melee') { foe.poison = POISON_ROUNDS; lines.push(`Poison bite: ${name(target)} is poisoned.`); }
  }
  for (const p of fighting) f(p).shielded = false;
  // End of the round: poison, then Mend for those that fought.
  for (const p of s.order) for (const x of hands[p]) {
    if (x.hp <= 0 || x.poison <= 0) continue;
    x.hp = Math.max(0, x.hp - POISON_DAMAGE);
    x.poison -= 1;
    lines.push(`Poison: ${LABEL[p]}’s ${CREATURES[x.kind].name} loses ${POISON_DAMAGE}${x.hp <= 0 ? ' and is knocked out!' : '.'}`);
  }
  for (const p of fighting) {
    const me = f(p), max = c(p).hp;
    if (me.hp > 0 && c(p).ability === 'mend' && me.hp < max) { const h = Math.min(MEND, max - me.hp); me.hp += h; lines.push(`Mend: ${name(p)} heals ${h}.`); }
  }
  for (const p of s.order) for (const x of hands[p]) if (x.hp <= 0) { x.poison = 0; x.stunned = false; }
  const before = alive(s);
  const next: BattleState = { ...s, hands, choices: Object.fromEntries(s.order.map((p) => [p, null])), rounds: [...s.rounds, { n: s.rounds.length + 1, lines, picks }] };
  const gone = before.filter((p) => standing(hands[p]) === 0);
  for (const p of gone) lines.push(`${LABEL[p]} has no creatures left and is out.`);
  const withOut = gone.length ? { ...next, out: [...s.out, gone] } : next;
  return { ...withOut, result: decide(withOut) };
}

/** The pick the move timer (and a simple player) makes: the healthiest creature, its best style, the weakest enemy. */
export function autoChoice(s: Pick<BattleState, 'order' | 'hands' | 'team'>, p: SeatId): BChoice {
  let best = -1;
  s.hands[p].forEach((f, i) => { if (f.hp > 0 && (best < 0 || f.hp > s.hands[p][best].hp)) best = i; });
  const foes = enemiesOf(s, p).sort((a, b) => standing(s.hands[a]) - standing(s.hands[b]) || a.localeCompare(b));
  return { creature: best, style: bestStyle(CREATURES[s.hands[p][best].kind]), target: foes[0] };
}

function choose(s: BattleState, p: SeatId, choice: BChoice, random: () => number): BattleState {
  const next = { ...s, choices: { ...s.choices, [p]: choice } };
  return alive(next).every((q) => next.choices[q]) ? resolveRound(next, random) : next;
}

export const seatsForMode = (mode: Mode): SeatDef[] => SEATS.slice(0, mode === '3v3' ? 6 : 4).map((id, i) => ({ id, label: mode === 'ffa' ? LABEL[id] : `${LABEL[id]} (${TEAM_NAMES[i % 2]})` }));

export const realmBattle = withHistory<BattleState, BattleConfig>({
  id: 'realmbattle',
  name: 'Realm Battle',
  description: 'Realm Duel for more: two teams of two or three, or everyone for themselves. Pick a creature, a style and a target; everyone fights at once.',
  howToPlay: {
    goal: 'Knock out every creature on the other side. In teams, the Sun team (Amber, Violet, Lime) fights the Moon team (Teal, Rose, Blue); in a free-for-all it’s the last player standing.',
    sections: [
      { title: 'A round', points: [
        'Everyone secretly picks one of their creatures still standing, an attack style (Melee, Ranged or Magic, as in Realm Duel) and a target: a player on the other side.',
        'In teams you see your team mates’ picks once they lock in, so you can gang up on one enemy.',
        'When everyone has locked in, all the creatures fight: the fastest (highest Agility) strikes first, and each hits its target’s creature. A creature knocked out before its turn doesn’t strike; if your target’s creature has already fallen, you hit another enemy instead.',
      ] },
      { title: 'Everything else', points: [
        'The creatures, damage, elements and abilities are Realm Duel’s (see its rules).',
        'A player with no creatures standing is out. The last team (or player) with creatures standing wins; in teams, everyone on the winning team scores the win.',
        `After ${MAX_ROUNDS} rounds, the side with more creatures standing (then more Health) wins.`,
        'If the room has a move timer and you run out of time, your healthiest creature attacks the weakest enemy with its strongest style.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: LABEL[id] })),
  seatsFor: (c) => seatsForMode(c.mode),
  minPlayers: 3,
  defaultConfig: { mode: '2v2', hand: 3 },
  parseConfig: (raw) => {
    const r = (raw ?? {}) as Partial<BattleConfig>;
    return { mode: r.mode === '3v3' || r.mode === 'ffa' ? r.mode : '2v2', hand: r.hand === 2 ? 2 : 3 };
  },
  describeConfig: (c) => `${c.mode === 'ffa' ? 'Free-for-all' : c.mode === '3v3' ? '3 against 3' : '2 against 2'} · ${c.hand} creatures each`,

  create(config, _now, ctx) {
    const order = SEATS.filter((p) => ctx.seats.includes(p));
    const team = Object.fromEntries(order.map((p) => [p, config.mode === 'ffa' ? order.indexOf(p) : SEATS.indexOf(p) % 2]));
    return {
      config, order, team, hands: Object.fromEntries(order.map((p) => [p, deal(config.hand, ctx.random)])),
      choices: Object.fromEntries(order.map((p) => [p, null])), out: [], rounds: [], result: null,
    };
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You’re not in this battle' };
    const a = raw as { type?: string; creature?: unknown; style?: unknown; target?: unknown };
    if (a?.type === 'resign') {
      const hands = { ...s.hands, [seat]: s.hands[seat].map((f) => ({ ...f, hp: 0 })) };
      const next: BattleState = { ...s, hands, choices: { ...s.choices, [seat]: null }, out: [...s.out, [seat]] };
      const result = decide({ ...next, rounds: next.rounds });
      if (result) return { state: { ...next, result: { ...result, reason: result.reason === 'everyone being knocked out at once' ? 'resignation' : result.reason } } };
      return { state: alive(next).every((q) => next.choices[q]) ? resolveRound(next, ctx.random) : next };
    }
    if (a?.type !== 'choose') return { error: 'Unknown move' };
    if (!alive(s).includes(seat)) return { error: 'You have no creatures left' };
    if (s.choices[seat]) return { error: 'You’ve already locked in this round' };
    const i = a.creature;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= s.hands[seat].length || s.hands[seat][i].hp <= 0) return { error: 'Choose one of your creatures still standing' };
    if (!STYLES.includes(a.style as Style)) return { error: 'Choose Melee, Ranged or Magic' };
    if (typeof a.target !== 'string' || !enemiesOf(s, seat).includes(a.target)) return { error: 'Choose a player on the other side to attack' };
    return { state: choose(s, seat, { creature: i, style: a.style as Style, target: a.target }, ctx.random) };
  },

  turn: (s) => (s.result ? [] : alive(s).filter((p) => !s.choices[p])),
  timeout(s, _seat, _now, ctx) {
    let next = s;
    for (const p of alive(s)) if (!next.result && !next.choices[p]) next = choose(next, p, autoChoice(next, p), ctx.random);
    return next;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): BattleView {
    const seated = !!viewer && s.order.includes(viewer);
    const showAll = !!s.result;
    const hand = (p: SeatId) => s.hands[p].map((f) => (showAll || p === viewer || f.revealed || (seated && s.team[p] === s.team[viewer!]) ? { ...f, maxHp: CREATURES[f.kind].hp } : null));
    const teamChoices: Record<SeatId, BChoice> = {};
    if (seated) for (const p of s.order) if (s.choices[p] && s.team[p] === s.team[viewer!]) teamChoices[p] = s.choices[p]!;
    return {
      you: seated ? viewer : null, mode: s.config.mode, order: s.order, team: s.team, round: s.rounds.length + 1,
      hands: Object.fromEntries(s.order.map((p) => [p, hand(p)])),
      locked: Object.fromEntries(s.order.map((p) => [p, !!s.choices[p]])),
      teamChoices, out: s.out.flat(), rounds: s.rounds, result: s.result,
    };
  },
}, { keys: ['creature', 'style', 'target'] });

export { STYLE_NAME };
