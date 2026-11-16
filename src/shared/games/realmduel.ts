// Realm Duel: a two-player creature card duel (docs/creature-duel.md). Each
// player holds a few fantasy creatures; every round both secretly choose a
// creature and an attack style, then the two fight. Last player with
// creatures standing wins. Rules after Edward Thomson's fantasy-card-game
// (MIT); the creatures, names and artwork are Playhall's own.

import type { GameModule, GameResult, SeatId } from '../game';

export const ELEMENTS = ['fire', 'water', 'earth', 'air', 'light', 'shadow'] as const;
export type Element = (typeof ELEMENTS)[number];
export const STYLES = ['melee', 'ranged', 'magic'] as const;
export type Style = (typeof STYLES)[number];
export type Ability = 'swift' | 'undertow' | 'shield' | 'gust' | 'mend' | 'poison';
export type CreatureId = 'emberfox' | 'tidecaller' | 'stonehorn' | 'galewing' | 'lumenstag' | 'duskmaw';

export interface Creature {
  id: CreatureId;
  name: string;
  element: Element;
  str: number; agi: number; int: number; def: number; mag: number;
  hp: number;
  ability: Ability;
  abilityName: string;
  abilityText: string;
}

/** The six starters (docs/creature-duel.md, Pieces). A draft: balance by simulation. */
export const CREATURES: Record<CreatureId, Creature> = {
  emberfox: { id: 'emberfox', name: 'Emberfox', element: 'fire', str: 6, agi: 9, int: 5, def: 4, mag: 6, hp: 28, ability: 'swift', abilityName: 'Swift', abilityText: 'Strikes first when Agility is tied.' },
  tidecaller: { id: 'tidecaller', name: 'Tidecaller', element: 'water', str: 4, agi: 6, int: 8, def: 5, mag: 8, hp: 30, ability: 'undertow', abilityName: 'Undertow', abilityText: 'A magic hit stuns 1 time in 3.' },
  stonehorn: { id: 'stonehorn', name: 'Stonehorn', element: 'earth', str: 9, agi: 3, int: 4, def: 9, mag: 2, hp: 40, ability: 'shield', abilityName: 'Shield', abilityText: 'Takes half damage in its first fight.' },
  galewing: { id: 'galewing', name: 'Galewing', element: 'air', str: 5, agi: 8, int: 6, def: 3, mag: 6, hp: 26, ability: 'gust', abilityName: 'Gust', abilityText: 'A ranged hit stuns 1 time in 4.' },
  lumenstag: { id: 'lumenstag', name: 'Lumen Stag', element: 'light', str: 6, agi: 6, int: 7, def: 6, mag: 7, hp: 32, ability: 'mend', abilityName: 'Mend', abilityText: 'Heals 4 after each round it fights.' },
  duskmaw: { id: 'duskmaw', name: 'Duskmaw', element: 'shadow', str: 7, agi: 6, int: 6, def: 5, mag: 8, hp: 30, ability: 'poison', abilityName: 'Poison bite', abilityText: 'A melee hit poisons.' },
};
export const CREATURE_IDS = Object.keys(CREATURES) as CreatureId[];

/** Which element each one beats: Fire > Air > Earth > Water > Fire; Light and Shadow beat each other. */
export const BEATS: Record<Element, Element> = { fire: 'air', air: 'earth', earth: 'water', water: 'fire', light: 'shadow', shadow: 'light' };
export const ADVANTAGE = 1.5;
export const POISON_DAMAGE = 2;
export const POISON_ROUNDS = 3;
export const MEND = 4;
export const UNDERTOW_CHANCE = 1 / 3;
export const GUST_CHANCE = 1 / 4;
/** A safety net: after this many rounds the game is decided on what's left. */
export const MAX_ROUNDS = 50;

export const STYLE_NAME: Record<Style, string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };

/** How hard a creature hits with a style: Strength or Agility count double; magic is Magic + Intellect. */
export function attackValue(c: Creature, style: Style): number {
  return style === 'melee' ? 2 * c.str : style === 'ranged' ? 2 * c.agi : c.mag + c.int;
}
/** What the defender takes off: Defence against melee and ranged, Intellect against magic. */
export function defenceValue(c: Creature, style: Style): number {
  return style === 'magic' ? c.int : c.def;
}

/** One hit: attack minus defence (at least 1), +50% against the element you
 *  beat (rounded down), halved (rounded up) when the defender is Shielded. */
export function damage(attacker: Creature, defender: Creature, style: Style, shielded = false): { damage: number; advantage: boolean } {
  const advantage = BEATS[attacker.element] === defender.element;
  let d = Math.max(1, attackValue(attacker, style) - defenceValue(defender, style));
  if (advantage) d = Math.floor(d * ADVANTAGE);
  if (shielded) d = Math.ceil(d / 2);
  return { damage: d, advantage };
}

/** The style a creature hits hardest with (ties go melee, ranged, magic). */
export function bestStyle(c: Creature): Style {
  return STYLES.reduce((best, s) => (attackValue(c, s) > attackValue(c, best) ? s : best), 'melee' as Style);
}

export interface Fighter {
  kind: CreatureId;
  hp: number;
  /** Rounds of poison left (0 = not poisoned). */
  poison: number;
  stunned: boolean;
  shielded: boolean;
  /** Has fought in a round, so both players have seen it. */
  revealed: boolean;
}

export interface Choice { creature: number; style: Style }

export interface Pick {
  creature: number;
  kind: CreatureId;
  style: Style;
  hpBefore: number;
  hpAfter: number;
  /** Damage this creature's attack did (0 if it missed or never struck). */
  dealt: number;
  /** Whether its attack got the element bonus. */
  advantage: boolean;
  /** Stunned and lost its attack; or knocked out before it could strike. */
  missed: 'stunned' | 'knocked out' | null;
  ko: boolean;
}

export interface Round {
  n: number;
  picks: Record<SeatId, Pick>;
  /** Who struck first. */
  first: SeatId;
  /** What happened, in plain words, in order. */
  lines: string[];
  /** Both hands after the round, for replays. Never sent to players. */
  after: Record<SeatId, Fighter[]>;
}

export interface RealmConfig { hand: 3 | 6 }

export interface RealmState {
  config: RealmConfig;
  hands: Record<SeatId, Fighter[]>;
  /** The deal, for replays. Never sent to players. */
  dealt: Record<SeatId, Fighter[]>;
  choices: Record<SeatId, Choice | null>;
  rounds: Round[];
  resigned: SeatId | null;
  result: GameResult | null;
}

/** A creature as one viewer sees it: null when it's the opponent's and still face down. */
export interface FighterView extends Fighter { maxHp: number }

export interface RoundView { n: number; picks: Record<SeatId, Pick>; first: SeatId; lines: string[] }

export interface RealmView {
  you: SeatId | null;
  round: number;
  hands: Record<SeatId, (FighterView | null)[]>;
  /** Who has locked in a choice for this round (never what they chose). */
  locked: Record<SeatId, boolean>;
  /** Your own locked choice, if you've made one. */
  mine: Choice | null;
  rounds: RoundView[];
  result: GameResult | null;
}

export const SEATS = ['amber', 'teal'] as const;
const other = (s: SeatId): SeatId => (s === 'amber' ? 'teal' : 'amber');
const LABEL: Record<string, string> = { amber: 'Amber', teal: 'Teal' };

export function newFighter(kind: CreatureId): Fighter {
  return { kind, hp: CREATURES[kind].hp, poison: 0, stunned: false, shielded: CREATURES[kind].ability === 'shield', revealed: false };
}

/** Each player's own random draw from the six (so a hand of three is a secret). */
export function deal(n: number, random: () => number): Fighter[] {
  const pool = [...CREATURE_IDS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n).map(newFighter);
}

const standing = (hand: Fighter[]) => hand.filter((f) => f.hp > 0).length;
const totalHp = (hand: Fighter[]) => hand.reduce((n, f) => n + f.hp, 0);

function decide(s: RealmState): GameResult | null {
  const a = standing(s.hands.amber), t = standing(s.hands.teal);
  if (!a && !t) return { winner: null, reason: 'both sides being knocked out at once' };
  if (!a) return { winner: 'teal', reason: 'knocking out every creature' };
  if (!t) return { winner: 'amber', reason: 'knocking out every creature' };
  if (s.rounds.length >= MAX_ROUNDS) {
    const by = (x: number, y: number) => (x > y ? 'amber' : x < y ? 'teal' : null);
    const winner = by(a, t) ?? by(totalHp(s.hands.amber), totalHp(s.hands.teal));
    return { winner, reason: `the ${MAX_ROUNDS}-round limit` };
  }
  return null;
}

/** Both choices are in: the two creatures fight. */
export function resolve(s: RealmState, random: () => number): RealmState {
  const hands: Record<SeatId, Fighter[]> = { amber: s.hands.amber.map((f) => ({ ...f })), teal: s.hands.teal.map((f) => ({ ...f })) };
  const choice = s.choices as Record<SeatId, Choice>;
  const lines: string[] = [];
  const f = (seat: SeatId) => hands[seat][choice[seat].creature];
  const c = (seat: SeatId) => CREATURES[f(seat).kind];
  const name = (seat: SeatId) => `${LABEL[seat]}’s ${c(seat).name}`;
  const picks: Record<SeatId, Pick> = {};
  for (const seat of SEATS) {
    f(seat).revealed = true;
    picks[seat] = { creature: choice[seat].creature, kind: f(seat).kind, style: choice[seat].style, hpBefore: f(seat).hp, hpAfter: 0, dealt: 0, advantage: false, missed: null, ko: false };
  }
  lines.push(`${name('amber')} (${STYLE_NAME[choice.amber.style].toLowerCase()}) meets ${name('teal')} (${STYLE_NAME[choice.teal.style].toLowerCase()}).`);

  // Initiative: higher Agility strikes first; a tie goes to Swift, else a coin.
  const agi = { amber: c('amber').agi, teal: c('teal').agi };
  const swift = (seat: SeatId) => c(seat).ability === 'swift';
  let first: SeatId;
  if (agi.amber !== agi.teal) first = agi.amber > agi.teal ? 'amber' : 'teal';
  else if (swift('amber') !== swift('teal')) first = swift('amber') ? 'amber' : 'teal';
  else first = random() < 0.5 ? 'amber' : 'teal';
  lines.push(`${name(first)} strikes first${agi.amber === agi.teal ? (swift(first) && !swift(other(first)) ? ' (Swift)' : ' (a tie, settled by a coin)') : ''}.`);

  for (const seat of [first, other(first)]) {
    const me = f(seat), foe = f(other(seat)), style = choice[seat].style;
    if (me.hp <= 0) { picks[seat].missed = 'knocked out'; continue; }
    if (me.stunned) {
      me.stunned = false;
      picks[seat].missed = 'stunned';
      lines.push(`${name(seat)} is stunned and loses its attack.`);
      continue;
    }
    const hit = damage(c(seat), c(other(seat)), style, foe.shielded);
    foe.hp = Math.max(0, foe.hp - hit.damage);
    picks[seat].dealt = hit.damage;
    picks[seat].advantage = hit.advantage;
    const extras = [hit.advantage ? `${c(seat).element} beats ${c(other(seat)).element}, +50%` : '', foe.shielded ? 'shielded, half damage' : ''].filter(Boolean);
    lines.push(`${name(seat)} hits for ${hit.damage}${extras.length ? ` (${extras.join('; ')})` : ''}.`);
    if (foe.hp <= 0) { lines.push(`${name(other(seat))} is knocked out!`); continue; }
    const ability = c(seat).ability;
    if ((ability === 'undertow' && style === 'magic' && random() < UNDERTOW_CHANCE) || (ability === 'gust' && style === 'ranged' && random() < GUST_CHANCE)) {
      foe.stunned = true;
      lines.push(`${c(seat).abilityName}: ${name(other(seat))} is stunned and will lose its next attack.`);
    }
    if (ability === 'poison' && style === 'melee') {
      foe.poison = POISON_ROUNDS;
      lines.push(`Poison bite: ${name(other(seat))} is poisoned (${POISON_DAMAGE} a round for ${POISON_ROUNDS} rounds).`);
    }
  }
  // A shield lasts for one fight.
  for (const seat of SEATS) f(seat).shielded = false;

  // End of the round: poison bites every poisoned creature, then Mend.
  for (const seat of SEATS) {
    hands[seat].forEach((x) => {
      if (x.hp <= 0 || x.poison <= 0) return;
      x.hp = Math.max(0, x.hp - POISON_DAMAGE);
      x.poison -= 1;
      lines.push(`Poison: ${LABEL[seat]}’s ${CREATURES[x.kind].name} loses ${POISON_DAMAGE}${x.hp <= 0 ? ' and is knocked out!' : '.'}`);
    });
  }
  for (const seat of SEATS) {
    const me = f(seat);
    if (me.hp > 0 && c(seat).ability === 'mend' && me.hp < c(seat).hp) {
      const healed = Math.min(MEND, c(seat).hp - me.hp);
      me.hp += healed;
      lines.push(`Mend: ${name(seat)} heals ${healed}.`);
    }
  }
  for (const seat of SEATS) {
    picks[seat].hpAfter = f(seat).hp;
    picks[seat].ko = f(seat).hp <= 0;
    if (f(seat).hp <= 0) { f(seat).poison = 0; f(seat).stunned = false; }
  }
  const round: Round = { n: s.rounds.length + 1, picks, first, lines, after: { amber: hands.amber.map((x) => ({ ...x })), teal: hands.teal.map((x) => ({ ...x })) } };
  const next: RealmState = { ...s, hands, choices: { amber: null, teal: null }, rounds: [...s.rounds, round] };
  return { ...next, result: decide(next) };
}

function choose(s: RealmState, seat: SeatId, choice: Choice, random: () => number): RealmState {
  const next = { ...s, choices: { ...s.choices, [seat]: choice } };
  return next.choices.amber && next.choices.teal ? resolve(next, random) : next;
}

/** The pick the move timer makes: the healthiest creature standing, with the style it hits hardest with. */
export function autoChoice(hand: Fighter[]): Choice {
  let best = -1;
  hand.forEach((f, i) => { if (f.hp > 0 && (best < 0 || f.hp > hand[best].hp)) best = i; });
  return { creature: best, style: bestStyle(CREATURES[hand[best].kind]) };
}

function viewOf(s: RealmState, viewer: SeatId | null): RealmView {
  const showAll = !!s.result;
  const hand = (seat: SeatId) => s.hands[seat].map((f) => (showAll || seat === viewer || f.revealed ? { ...f, maxHp: CREATURES[f.kind].hp } : null));
  return {
    you: viewer && (SEATS as readonly string[]).includes(viewer) ? viewer : null,
    round: s.rounds.length + 1,
    hands: { amber: hand('amber'), teal: hand('teal') },
    locked: { amber: !!s.choices.amber, teal: !!s.choices.teal },
    mine: viewer && !s.result ? s.choices[viewer] ?? null : null,
    rounds: s.rounds.map(({ n, picks, first, lines }) => ({ n, picks, first, lines })),
    result: s.result,
  };
}

export const realmDuel: GameModule<RealmState, RealmConfig> = {
  id: 'realmduel',
  name: 'Realm Duel',
  description: 'Two players. Secretly pick a creature and how it attacks; both are revealed together. Last with creatures standing wins.',
  howToPlay: {
    goal: 'Knock out all of your opponent’s creatures while at least one of yours is still standing.',
    sections: [
      { title: 'Your creatures', points: [
        'Each player gets three creatures, drawn at random from the six (or all six, if the host chose that). Your opponent sees your cards face down until each one fights.',
        'Every creature has Strength, Agility, Intellect, Defence and Magic, some Health, an element and a special ability, all shown on its card.',
      ] },
      { title: 'A round', points: [
        'Both players secretly choose one of their creatures still standing and an attack style: Melee (uses Strength), Ranged (Agility) or Magic (Magic + Intellect). Press Lock in.',
        'Nothing is shown until both have locked in; then the two creatures fight.',
        'The one with more Agility strikes first. If it knocks the other out, the other never strikes back.',
        'A hit does twice the Strength (melee) or twice the Agility (ranged), less the defender’s Defence; or Magic + Intellect less the defender’s Intellect (magic). Always at least 1.',
      ] },
      { title: 'Elements', points: [
        'Fire beats Air, Air beats Earth, Earth beats Water and Water beats Fire. Light and Shadow beat each other.',
        'Hitting an element you beat does 50% more damage.',
      ] },
      { title: 'Abilities and effects', points: [
        'Emberfox, Swift: strikes first when Agility is tied. Tidecaller, Undertow: a magic hit stuns 1 time in 3. Galewing, Gust: a ranged hit stuns 1 time in 4.',
        'Stonehorn, Shield: Shielded in its first fight (half damage). Lumen Stag, Mend: heals 4 after each round it fights. Duskmaw, Poison bite: a melee hit poisons.',
        `Stunned: loses its next attack (even later in the same round). Poisoned: loses ${POISON_DAMAGE} Health at the end of each round for ${POISON_ROUNDS} rounds, even resting in your hand.`,
      ] },
      { title: 'Winning', points: [
        'A creature at 0 Health is knocked out and leaves play. The last player with creatures standing wins; if both sides fall at once it’s a draw.',
        `After ${MAX_ROUNDS} rounds the player with more creatures standing wins (then more Health in total).`,
        'If the room has a move timer and you run out of time, your healthiest creature is picked for you, with its strongest attack. You can resign at any time.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: LABEL[id] })),
  defaultConfig: { hand: 3 },
  parseConfig: (raw) => ({ hand: (raw as { hand?: unknown })?.hand === 6 ? 6 : 3 }),
  describeConfig: (c) => (c.hand === 6 ? 'All six creatures each' : 'Three creatures each'),

  create(config, _now, ctx) {
    const hands = { amber: deal(config.hand, ctx.random), teal: deal(config.hand, ctx.random) };
    return { config, hands, dealt: { amber: hands.amber.map((f) => ({ ...f })), teal: hands.teal.map((f) => ({ ...f })) }, choices: { amber: null, teal: null }, rounds: [], resigned: null, result: null };
  },

  act(s, seat, raw, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!(SEATS as readonly string[]).includes(seat)) return { error: 'Not a Realm Duel seat' };
    const action = raw as { type?: string; creature?: unknown; style?: unknown };
    if (action?.type === 'resign') return { state: { ...s, resigned: seat, result: { winner: other(seat), reason: 'resignation' } } };
    if (action?.type !== 'choose') return { error: 'Unknown move' };
    if (s.choices[seat]) return { error: 'You’ve already locked in this round' };
    const i = action.creature;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= s.hands[seat].length) return { error: 'Choose one of your creatures' };
    if (s.hands[seat][i].hp <= 0) return { error: 'That creature is knocked out' };
    if (!STYLES.includes(action.style as Style)) return { error: 'Choose Melee, Ranged or Magic' };
    return { state: choose(s, seat, { creature: i, style: action.style as Style }, ctx.random) };
  },

  /** Simultaneous: everyone who still has to choose this round. */
  turn: (s) => (s.result ? [] : SEATS.filter((p) => !s.choices[p])),
  /** The move timer is shared, so it chooses for everyone still choosing. */
  timeout(s, _seat, _now, ctx) {
    let next = s;
    for (const p of SEATS) if (!next.result && !next.choices[p]) next = choose(next, p, autoChoice(next.hands[p]), ctx.random);
    return next;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  /** What a watcher saw: the deal, then after each round; the last frame shows everything. */
  replay(s) {
    const frames: RealmView[] = [];
    const base: RealmState = { ...s, hands: s.dealt, choices: { amber: null, teal: null }, rounds: [], result: null };
    frames.push(viewOf(base, null));
    s.rounds.forEach((r, i) => frames.push(viewOf({ ...base, hands: r.after, rounds: s.rounds.slice(0, i + 1) }, null)));
    if (s.result) frames[frames.length - 1] = viewOf({ ...s, choices: { amber: null, teal: null } }, null);
    return frames;
  },

  view: (s, _now, viewer) => viewOf(s, viewer),
};
