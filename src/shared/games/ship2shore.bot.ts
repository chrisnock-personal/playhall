// A Ship2Shore bot (#18): plays a seat from that seat's own view, so it knows
// only what a person in that seat would (its role, the spies or partners it
// was shown, its own secrets, the public log). It steers for its faction's
// port by weighing each order by where it leads (portOdds), backs friends,
// suspects nobody it has no reason to, and as Black Market crew it will feed
// its own Fixer to the sharks, since that wins.

import { CHARTS, orderHeading, portOdds, posKey, sailFrom, type Faction, type Order, type ShipView } from './ship2shore';
import type { SeatId } from '../game';

type You = NonNullable<ShipView['you']>;

const pickOne = <T,>(xs: T[], random: () => number): T => xs[Math.floor(random() * xs.length)];

/** Who this seat knows to be on its side, and who it knows isn't. */
function allegiances(v: ShipView, y: You): { friends: Set<SeatId>; enemies: Set<SeatId> } {
  const friends = new Set<SeatId>(), enemies = new Set<SeatId>();
  const known: Record<SeatId, Faction> = {};
  if (y.spies) for (const p of y.spies) known[p] = 'spy';
  for (const p of y.partners) known[p] = 'bm';
  for (const x of y.secrets) {
    if (x.k === 'inspect') known[x.target] = x.faction;
    if (x.k === 'bridge') Object.assign(known, x.seen);
  }
  // Interrogations in the public log rule a faction out.
  for (const e of v.log) {
    if (e.k === 'action' && e.action === 'interrogate' && e.target && e.not === y.faction && !(e.target in known)) enemies.add(e.target);
  }
  for (const [p, f] of Object.entries(known)) {
    if (p === y.seat) continue;
    (f === y.faction ? friends : enemies).add(p);
  }
  return { friends, enemies };
}

/** How likely an order is to bring the ship to `faction`'s port in the end. */
function worth(v: ShipView, order: Order, faction: Faction): number {
  const chart = CHARTS[v.chart];
  return portOdds(chart)[posKey(sailFrom(chart, v.ship, orderHeading(order)))][faction];
}

/** Friends first, then anyone not known to be an enemy, then anyone. */
function prefer(choices: SeatId[], friends: Set<SeatId>, enemies: Set<SeatId>, random: () => number): SeatId {
  const f = choices.filter((p) => friends.has(p));
  if (f.length) return pickOne(f, random);
  const neutral = choices.filter((p) => !enemies.has(p));
  return pickOne(neutral.length ? neutral : choices, random);
}

/** Enemies first, then anyone who isn't a friend, then anyone. */
function suspect(choices: SeatId[], friends: Set<SeatId>, enemies: Set<SeatId>, random: () => number): SeatId {
  const e = choices.filter((p) => enemies.has(p));
  if (e.length) return pickOne(e, random);
  const others = choices.filter((p) => !friends.has(p));
  return pickOne(others.length ? others : choices, random);
}

/** The action this seat takes now, or null when it has nothing to do. */
export function ship2shoreBot(view: unknown, random: () => number): unknown | null {
  const v = view as ShipView;
  const y = v.you;
  if (!v || !y || v.result || !y.toAct) return null;
  const { friends, enemies } = allegiances(v, y);
  const mine = y.faction;

  switch (v.phase) {
    case 'pick': {
      const officer = prefer(v.choices, friends, enemies, random);
      const helm = prefer(v.choices.filter((p) => p !== officer), friends, enemies, random);
      return { type: 'pick', officer, helm };
    }
    case 'vote': {
      if (friends.has(v.captain) || y.ammo === 0) return { type: 'vote', rounds: 0 };
      if (enemies.has(v.captain)) return { type: 'vote', rounds: Math.min(y.ammo, 2) };
      return { type: 'vote', rounds: random() < 0.15 ? 1 : 0 };
    }
    case 'tiebreak':
      return { type: 'tiebreak', target: prefer(v.tied, friends, enemies, random) };
    case 'emergency':
      return { type: 'emergency', target: prefer(v.choices, friends, enemies, random) };
    case 'draw': {
      const hand = y.hand;
      if (!hand) return null;
      return { type: 'keep', index: worth(v, hand[0], mine) >= worth(v, hand[1], mine) ? 0 : 1 };
    }
    case 'steer': {
      const cards = y.helmCards;
      if (!cards) return null;
      // Discard the one that does less for us.
      return { type: 'steer', index: worth(v, cards[0], mine) >= worth(v, cards[1], mine) ? 1 : 0 };
    }
    case 'target': {
      const kind = v.target;
      const choices = v.choices;
      if (!kind || !choices.length) return null;
      if (kind === 'intercept' || kind === 'spotter') return { type: 'target', target: choices.includes(y.seat) ? y.seat : prefer(choices, friends, enemies, random) };
      if (kind === 'sharks' && mine === 'bm' && y.role !== 'fixer') {
        // The Fixer overboard wins it for the Black Market.
        const fixer = choices.find((p) => y.partners.includes(p));
        if (fixer && random() < 0.8) return { type: 'target', target: fixer };
      }
      return { type: 'target', target: suspect(choices, friends, enemies, random) };
    }
    case 'spot': {
      const card = y.spotCard;
      if (!card) return null;
      const here = portOdds(CHARTS[v.chart])[posKey(v.ship)][mine];
      return { type: 'spot', keep: worth(v, card, mine) >= here };
    }
    case 'contraband': {
      if (!y.fixerMove) return { type: 'ack' };
      const r = random();
      if (y.bribable.length && r < 0.5) return { type: 'contraband', option: 'bribe', target: pickOne(y.bribable, random) };
      if (r < 0.8) {
        const gifts = [y.seat, ...y.partners.filter((p) => !v.overboard.includes(p))].slice(0, 3);
        return { type: 'contraband', option: 'cash', gifts: gifts.join(',') };
      }
      return { type: 'contraband', option: 'bridge' };
    }
    default:
      return null;
  }
}
