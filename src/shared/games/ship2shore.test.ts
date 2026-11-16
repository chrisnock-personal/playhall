import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ship2shore as g, roleCounts, thresholdFor, chartFor, CHARTS, FULL_DECK, SEATS, aboard, actionAt, portAt,
  type ShipState, type ShipView, type Order, type Role, type Faction,
} from './ship2shore';
import { score } from '../scoring';

function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}
const seats = (n: number) => SEATS.slice(0, n);
const ctx = (s: ShipState | number, random = seeded(7)) => ({ seats: typeof s === 'number' ? seats(s) : s.order, random });
const ok = (r: ReturnType<typeof g.act>): ShipState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
const act = (s: ShipState, seat: string, a: unknown, random = seeded(3)) => ok(g.act(s, seat, a, 0, ctx(s, random)));
const view = (s: ShipState, viewer: string | null) => g.view(s, 0, viewer) as ShipView;

const ROLES5: Record<string, Role> = { amber: 'navy', teal: 'navy', violet: 'navy', rose: 'spy', lime: 'fixer' };
/** A fixed table: amber captain, roles as given, the ship at `ship`, a known deck. */
function table(roles: Record<string, Role> = ROLES5, extra: Partial<ShipState> = {}): ShipState {
  const s = g.create({}, 0, ctx(Object.keys(roles).length));
  const order = Object.keys(roles);
  const faction = Object.fromEntries(order.map((p) => [p, ({ navy: 'navy', spy: 'spy', fixer: 'bm', smuggler: 'bm' } as Record<Role, Faction>)[roles[p]]]));
  const { history: _h, ...rest } = s;
  return { ...rest, order, roles, faction, captain: 'amber', log: [], ...extra };
}
/** Pick, everyone votes 0, both keep their first card, the helmsman discards `discard`. */
function round(s: ShipState, officer: string, helm: string, deck: Order[], discard = 1): ShipState {
  let x = act({ ...s, deck: [...deck, ...s.deck] }, s.captain, { type: 'pick', officer, helm });
  for (const p of g.turn!(x)) x = act(x, p, { type: 'vote', rounds: 0 });
  assert.equal(x.phase, 'draw');
  x = act(x, x.captain, { type: 'keep', index: 0 });
  x = act(x, officer, { type: 'keep', index: 0 });
  assert.equal(x.phase, 'steer');
  return act(x, helm, { type: 'steer', index: discard });
}

test('dealing: roles, chart and threshold by player count', () => {
  const expected: Record<number, [number, number, number]> = { 5: [3, 1, 0], 6: [3, 2, 0], 7: [4, 2, 0], 8: [4, 3, 0], 9: [5, 3, 0], 10: [5, 4, 0], 11: [5, 4, 1] };
  for (let n = 5; n <= 11; n++) {
    const c = roleCounts(n);
    assert.deepEqual([c.navy, c.spy, c.smuggler], expected[n]);
    assert.equal(c.fixer, 1);
    assert.equal(c.navy + c.spy + c.fixer + c.smuggler, n);
    for (let k = 0; k < 20; k++) {
      const s = g.create({}, 0, ctx(n, seeded(k + 1)));
      const roles = Object.values(s.roles);
      for (const r of ['navy', 'spy', 'fixer', 'smuggler'] as Role[]) assert.equal(roles.filter((x) => x === r).length, c[r], `${n} players, ${r}`);
      assert.equal(s.chart, n <= 7 ? 'short' : 'long');
      assert.equal(s.threshold, n <= 7 ? 3 : n <= 9 ? 4 : 5);
      assert.ok(s.order.includes(s.captain));
      assert.equal(s.phase, 'pick');
      assert.equal(s.round, 1);
      assert.ok(Object.values(s.ammo).every((a) => a === 3));
      assert.equal(s.deck.length, FULL_DECK.length);
    }
  }
  assert.equal(thresholdFor(7), 3);
  assert.equal(chartFor(8).id, 'long');
  assert.equal(g.minPlayers, 5);
  assert.equal(g.seats.length, 11);
  assert.equal(FULL_DECK.length, 28);
});

test('the role reveal: spies see each other, the Fixer and the Smuggler see each other, the Navy see nobody', () => {
  const s = g.create({}, 0, ctx(11, seeded(5)));
  const spies = s.order.filter((p) => s.roles[p] === 'spy');
  const fixer = s.order.find((p) => s.roles[p] === 'fixer')!;
  const smuggler = s.order.find((p) => s.roles[p] === 'smuggler')!;
  for (const p of s.order) {
    const v = view(s, p).you!;
    assert.equal(v.role, s.roles[p]);
    if (s.roles[p] === 'spy') assert.deepEqual(v.spies, spies); else assert.equal(v.spies, null);
    if (p === fixer) assert.deepEqual(v.partners, [smuggler]);
    else if (p === smuggler) assert.deepEqual(v.partners, [fixer]);
    else assert.deepEqual(v.partners, []);
  }
});

test('a round: pick the watch, a vote, plotting, the ship sails; off watch next round', () => {
  let s = table();
  assert.deepEqual(g.turn!(s), ['amber']);
  assert.match(err(g.act(s, 'amber', { type: 'pick', officer: 'amber', helm: 'teal' }, 0, ctx(s))) ?? '', /aboard and not off watch/);
  assert.match(err(g.act(s, 'amber', { type: 'pick', officer: 'teal', helm: 'teal' }, 0, ctx(s))) ?? '', /two different/);
  assert.match(err(g.act(s, 'teal', { type: 'pick', officer: 'rose', helm: 'violet' }, 0, ctx(s))) ?? '', /Only the captain/);
  s = act({ ...s, deck: ['ne.steady', 'sw.steady', 's.steady', 'sw.steady', ...s.deck] }, 'amber', { type: 'pick', officer: 'teal', helm: 'violet' });
  assert.equal(s.phase, 'vote');
  assert.deepEqual(new Set(g.turn!(s)), new Set(['teal', 'violet', 'rose', 'lime']));
  assert.match(err(g.act(s, 'amber', { type: 'vote', rounds: 1 }, 0, ctx(s))) ?? '', /captain doesn’t vote/);
  assert.match(err(g.act(s, 'teal', { type: 'vote', rounds: 4 }, 0, ctx(s))) ?? '', /0 to 3/);
  s = act(s, 'teal', { type: 'vote', rounds: 1 });
  assert.deepEqual(view(s, null).voted, ['teal']);
  assert.equal(JSON.stringify(view(s, 'rose')).includes('"teal":1'), false, 'votes stay secret until all are in');
  for (const p of ['violet', 'rose', 'lime']) s = act(s, p, { type: 'vote', rounds: 0 });
  assert.equal(s.phase, 'draw');
  const voteLog = s.log.find((e) => e.k === 'vote');
  assert.ok(voteLog && voteLog.k === 'vote' && !voteLog.mutiny && voteLog.total === 1);
  assert.equal(s.ammo.teal, 3, 'rounds go back after a failed vote');
  assert.deepEqual(s.hands.amber, ['ne.steady', 'sw.steady']);
  assert.deepEqual(s.hands.teal, ['s.steady', 'sw.steady']);
  assert.deepEqual(view(s, 'amber').you!.hand, ['ne.steady', 'sw.steady']);
  assert.equal(view(s, 'violet').you!.hand, null);
  assert.deepEqual(new Set(g.turn!(s)), new Set(['amber', 'teal']));
  s = act(s, 'amber', { type: 'keep', index: 0 });
  assert.match(err(g.act(s, 'amber', { type: 'keep', index: 1 }, 0, ctx(s))) ?? '', /already chosen/);
  s = act(s, 'teal', { type: 'keep', index: 0 });
  assert.equal(s.phase, 'steer');
  assert.deepEqual(new Set(view(s, 'violet').you!.helmCards), new Set(['ne.steady', 's.steady']));
  assert.equal(view(s, 'amber').you!.helmCards, null);
  const south = s.helmCards.indexOf('s.steady');
  s = act(s, 'violet', { type: 'steer', index: south }); // discard the south order: sail north-east
  assert.deepEqual(s.ship, { a: 1, b: 0 });
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'pick');
  assert.deepEqual(s.offWatch, ['violet']);
  assert.equal(s.carried.amber, 1);
  assert.match(err(g.act(s, 'amber', { type: 'pick', officer: 'violet', helm: 'teal' }, 0, ctx(s))) ?? '', /off watch/);
  assert.ok(s.secrets.violet.some((x) => x.k === 'steered'));
  assert.ok(s.secrets.amber.some((x) => x.k === 'drew'));
});

test('off watch in games of 8 or more: last round’s helmsman, first officer and captain', () => {
  const roles: Record<string, Role> = { amber: 'navy', teal: 'navy', violet: 'navy', rose: 'navy', lime: 'spy', blue: 'spy', coral: 'spy', slate: 'fixer' };
  let s = table(roles, { chart: 'long', threshold: 4 });
  s = round(s, 'teal', 'violet', ['ne.steady', 'ne.steady', 'ne.steady', 'ne.steady']);
  assert.equal(s.round, 2);
  assert.deepEqual(new Set(s.offWatch), new Set(['violet', 'teal', 'amber']));
});

test('vote of no confidence: the biggest backer takes command, rounds are lost, no second vote', () => {
  let s = act(table(), 'amber', { type: 'pick', officer: 'teal', helm: 'violet' });
  s = act(s, 'teal', { type: 'vote', rounds: 1 });
  s = act(s, 'rose', { type: 'vote', rounds: 2 });
  s = act(s, 'violet', { type: 'vote', rounds: 0 });
  s = act(s, 'lime', { type: 'vote', rounds: 0 });
  assert.equal(s.captain, 'rose');
  assert.equal(s.ammo.rose, 1);
  assert.equal(s.ammo.teal, 2);
  assert.equal(s.phase, 'pick');
  assert.equal(s.officer, null);
  s = act(s, 'rose', { type: 'pick', officer: 'amber', helm: 'lime' });
  assert.equal(s.phase, 'draw', 'straight to plotting after a mutiny');
});

test('a tied mutiny: the old captain picks; silenced players can’t take command', () => {
  let s = act(table(), 'amber', { type: 'pick', officer: 'teal', helm: 'violet' });
  for (const [p, n] of [['teal', 2], ['rose', 2], ['violet', 0], ['lime', 0]] as const) s = act(s, p, { type: 'vote', rounds: n });
  assert.equal(s.phase, 'tiebreak');
  assert.deepEqual(s.tied, ['teal', 'rose']);
  assert.deepEqual(g.turn!(s), ['amber']);
  assert.match(err(g.act(s, 'amber', { type: 'tiebreak', target: 'lime' }, 0, ctx(s))) ?? '', /tied/);
  s = act(s, 'amber', { type: 'tiebreak', target: 'teal' });
  assert.equal(s.captain, 'teal');

  let t = act(table(ROLES5, { silenced: ['rose'] }), 'amber', { type: 'pick', officer: 'teal', helm: 'violet' });
  for (const [p, n] of [['teal', 1], ['rose', 3], ['violet', 0], ['lime', 0]] as const) t = act(t, p, { type: 'vote', rounds: n });
  assert.equal(t.captain, 'teal', 'the silenced top backer is passed over');
});

test('abandoning post: overboard, an emergency helmsman, fresh orders; not with three aboard', () => {
  let s = act(table(), 'amber', { type: 'pick', officer: 'teal', helm: 'violet' });
  for (const p of ['teal', 'violet', 'rose', 'lime']) s = act(s, p, { type: 'vote', rounds: 0 });
  s = act(act(s, 'amber', { type: 'keep', index: 0 }), 'teal', { type: 'keep', index: 1 });
  const discards = s.discard.length;
  s = act(s, 'violet', { type: 'abandon' });
  assert.ok(s.overboard.includes('violet'));
  assert.equal(s.discard.length, discards + 2);
  assert.equal(s.phase, 'emergency');
  assert.match(err(g.act(s, 'amber', { type: 'emergency', target: 'teal' }, 0, ctx(s))) ?? '', /isn’t on the bridge/);
  assert.match(err(g.act(s, 'violet', { type: 'vote', rounds: 0 }, 0, ctx(s))) ?? '', /in the water/);
  s = act(s, 'amber', { type: 'emergency', target: 'rose' });
  assert.equal(s.helm, 'rose');
  assert.equal(s.phase, 'draw');

  let t = act(table(ROLES5, { overboard: ['rose', 'lime'] }), 'amber', { type: 'pick', officer: 'teal', helm: 'violet' });
  for (const p of ['teal', 'violet']) t = act(t, p, { type: 'vote', rounds: 0 });
  t = act(act(t, 'amber', { type: 'keep', index: 0 }), 'teal', { type: 'keep', index: 0 });
  assert.match(err(g.act(t, 'violet', { type: 'abandon' }, 0, ctx(t))) ?? '', /Too few/);
});

/** Sail one order from `ship` (no vote), so it lands on the chart area we want. */
function sail(s: ShipState, order: Order, officer = 'teal', helm = 'violet'): ShipState {
  return round(s, officer, helm, [order, 'ne.steady', 'ne.steady', 'ne.steady'], 1);
}
const findArea = (chart: 'short' | 'long', action: string) => {
  for (const [k, v] of Object.entries(CHARTS[chart].actions)) if (v === action) { const [a, b] = k.split(',').map(Number); return { a, b }; }
  throw new Error(action);
};

test('kit inspection: the captain alone sees an allegiance; that player can’t be bribed', () => {
  const at = findArea('short', 'inspect');
  let s = sail(table(ROLES5, { ship: { a: at.a + 1, b: at.b } }), 'sw.steady');
  assert.equal(s.phase, 'target');
  assert.equal(s.target, 'inspect');
  assert.deepEqual(g.turn!(s), ['amber']);
  assert.match(err(g.act(s, 'amber', { type: 'target', target: 'amber' }, 0, ctx(s))) ?? '', /can’t pick/);
  s = act(s, 'amber', { type: 'target', target: 'rose' });
  assert.deepEqual(s.secrets.amber.at(-1), { round: 1, k: 'inspect', target: 'rose', faction: 'spy' });
  assert.ok(s.checked.includes('rose'));
  assert.equal(JSON.stringify(view(s, 'teal')).includes('"faction":"spy"'), false);
  assert.equal(s.phase, 'pick');
});

test('interrogation shows everyone a faction the player is not; radio silence; sharks', () => {
  const q = findArea('short', 'interrogate');
  for (let k = 0; k < 10; k++) {
    let s = sail(table(ROLES5, { ship: { a: q.a + 1, b: q.b } }), 'sw.steady');
    s = act(s, 'amber', { type: 'target', target: 'lime' }, seeded(k + 1));
    const e = s.log.find((x) => x.k === 'action' && x.action === 'interrogate');
    assert.ok(e && e.k === 'action' && e.not && e.not !== 'bm');
    assert.ok(s.checked.includes('lime'));
  }
  const r = findArea('short', 'silence');
  let s = sail(table(ROLES5, { ship: { a: r.a + 1, b: r.b } }), 'sw.steady');
  s = act(s, 'amber', { type: 'target', target: 'rose' });
  assert.deepEqual(s.silenced, ['rose']);
  assert.ok(view(s, null).silenced.includes('rose'));

  const x = findArea('short', 'sharks');
  s = sail(table(ROLES5, { ship: { a: x.a + 1, b: x.b } }), 'sw.steady');
  assert.equal(s.target, 'sharks');
  s = act(s, 'amber', { type: 'target', target: 'rose' });
  assert.deepEqual(s.overboard, ['rose']);
  assert.equal(s.result, null);
  // Only three aboard: nobody goes to the sharks.
  s = sail(table(ROLES5, { ship: { a: x.a + 1, b: x.b }, overboard: ['rose', 'lime'] }), 'sw.steady');
  assert.equal(s.phase, 'pick');
  assert.ok(s.log.some((e) => e.k === 'action' && e.action === 'sharks' && e.target === null));
});

test('the Fixer thrown to the sharks: the Black Market wins at once, bribed players with it', () => {
  const x = findArea('short', 'sharks');
  let s = sail(table(ROLES5, { ship: { a: x.a + 1, b: x.b } }), 'sw.steady');
  s = { ...s, faction: { ...s.faction, teal: 'bm' } };
  s = act(s, 'amber', { type: 'target', target: 'lime' });
  assert.ok(s.result);
  assert.deepEqual(s.result!.placings, [['teal', 'lime'], ['amber', 'violet', 'rose']]);
  assert.equal(s.result!.teamWin, true);
  assert.match(s.result!.reason, /body was never found/);
  const sc = score(s.result!, s.order);
  assert.equal(sc.teal.points, 3);
  assert.equal(sc.lime.points, 3);
  assert.equal(sc.amber.points, 0);
  assert.equal(sc.lime.outcome, 'win');
});

test('each port wins for its faction, the players in the water included', () => {
  const cases: [Order, { a: number; b: number }, Faction, string[]][] = [
    ['ne.steady', { a: 3, b: 1 }, 'navy', ['amber', 'teal', 'violet']],
    ['sw.steady', { a: -3, b: 1 }, 'spy', ['rose']],
    ['s.steady', { a: 1, b: 4 }, 'bm', ['lime']],
  ];
  for (const [order, ship, f, winners] of cases) {
    const s = sail(table(ROLES5, { ship, overboard: ['violet'] }), order, 'teal', 'rose');
    assert.ok(s.result, f);
    assert.deepEqual(s.result!.placings![0], winners);
    assert.equal(s.result!.winner, winners.length === 1 ? winners[0] : null);
    assert.equal(portAt(CHARTS.short, s.ship), f);
    const v = view(s, null);
    assert.deepEqual(v.reveal!.roles, s.roles, 'everything is revealed at the end');
    for (const w of winners) assert.equal(score(s.result!, s.order)[w].points, 3);
  }
});

test('orders: shore leave, arms locker, confiscated', () => {
  const quiet = { a: 0, b: 0 };
  assert.equal(actionAt(CHARTS.short, { a: 1, b: 0 }), null);
  let s = sail(table(ROLES5, { ship: quiet, carried: { amber: 2, teal: 1, violet: 1, rose: 0, lime: 0 } }), 'ne.shoreleave');
  assert.equal(s.captain, 'rose', 'the fewest orders carried out, round the table from the captain');
  s = sail(table(ROLES5, { ship: quiet, silenced: ['rose'], carried: { amber: 2, teal: 1, violet: 1, rose: 0, lime: 0 } }), 'ne.shoreleave');
  assert.equal(s.captain, 'lime', 'silenced players are passed over');
  s = sail(table(ROLES5, { ship: quiet }), 'ne.armslocker');
  assert.equal(s.ammo.violet, 4);
  s = sail(table(ROLES5, { ship: quiet }), 'ne.confiscated');
  assert.equal(s.ammo.violet, 2);
});

test('radio intercept and the spotter', () => {
  // A start whose south-west neighbour has no chart action.
  const free = (() => { for (let b = 0; b < 5; b++) for (let a = -2; a <= 3; a++) if (!actionAt(CHARTS.short, { a: a - 1, b })) return { a, b }; throw new Error(); })();
  let s = sail(table(ROLES5, { ship: free, discard: ['s.steady', 'ne.steady', 'sw.spotter', 'ne.confiscated'] }), 'sw.intercept');
  assert.equal(s.target, 'intercept');
  s = act(s, 'amber', { type: 'target', target: 'rose' });
  const seen = s.secrets.rose.at(-1)!;
  assert.equal(seen.k, 'intercept');
  assert.equal(seen.k === 'intercept' && seen.cards.length, 3);
  assert.ok(s.log.some((e) => e.k === 'intercept' && e.target === 'rose'));

  s = sail(table(ROLES5, { ship: free }), 'sw.spotter');
  s = act(s, 'amber', { type: 'target', target: 'teal' });
  assert.equal(s.phase, 'spot');
  assert.deepEqual(g.turn!(s), ['teal']);
  const card = s.spotCard!;
  assert.equal(view(s, 'teal').you!.spotCard, card);
  assert.equal(view(s, 'amber').you!.spotCard, null);
  const kept = act(s, 'teal', { type: 'spot', keep: true });
  assert.equal(kept.deck[0], card);
  const binned = act(s, 'teal', { type: 'spot', keep: false });
  assert.equal(binned.discard.at(-1), card);
});

test('contraband: everyone answers; the Fixer bribes, stashes cash or looks at the bridge', () => {
  const free = (() => { for (let b = 0; b < 4; b++) for (let a = -3; a <= 3; a++) if (!actionAt(CHARTS.short, { a, b: b + 1 })) return { a, b }; throw new Error(); })();
  const base = sail(table(ROLES5, { ship: free }), 's.contraband');
  assert.equal(base.phase, 'contraband');
  assert.deepEqual(new Set(g.turn!(base)), new Set(base.order), 'everyone is asked, so the Fixer isn’t singled out');
  assert.equal(view(base, 'lime').you!.fixerMove, true);
  assert.equal(view(base, 'amber').you!.fixerMove, false);
  assert.match(err(g.act(base, 'amber', { type: 'contraband', option: 'bridge' }, 0, ctx(base))) ?? '', /Only the Fixer/);
  assert.match(err(g.act(base, 'lime', { type: 'ack' }, 0, ctx(base))) ?? '', /move first/);
  const ackAll = (s: ShipState) => { for (const p of ['amber', 'teal', 'violet', 'rose']) s = act(s, p, { type: 'ack' }); return s; };

  let s = ackAll(act(base, 'lime', { type: 'contraband', option: 'bribe', target: 'teal' }));
  assert.equal(s.faction.teal, 'bm');
  assert.equal(s.phase, 'pick');
  assert.deepEqual(view(s, 'teal').you!.partners, ['lime']);
  assert.deepEqual(view(s, 'lime').you!.partners, ['teal']);
  assert.equal(view(s, 'amber').you!.partners.length, 0);
  assert.ok(!JSON.stringify(view(s, 'amber')).includes('bribe'));

  assert.match(err(g.act({ ...base, checked: ['teal'] }, 'lime', { type: 'contraband', option: 'bribe', target: 'teal' }, 0, ctx(base))) ?? '', /can’t bribe/);

  s = ackAll(act(base, 'lime', { type: 'contraband', option: 'cash', gifts: 'teal,teal,lime' }));
  assert.equal(s.ammo.teal, 5);
  assert.equal(s.ammo.lime, 4);
  assert.deepEqual(s.secrets.teal.at(-1), { round: 1, k: 'cash', n: 2 });
  assert.match(err(g.act(base, 'lime', { type: 'contraband', option: 'cash', gifts: 'a,b,c,d' }, 0, ctx(base))) ?? '', /one to three/);

  s = ackAll(act(base, 'lime', { type: 'contraband', option: 'bridge' }));
  const look = s.secrets.lime.at(-1)!;
  assert.deepEqual(look.k === 'bridge' && look.seen, { amber: 'navy', teal: 'navy', violet: 'navy' });
});

test('the resupply line tops everyone up to three rounds', () => {
  const roles: Record<string, Role> = { amber: 'navy', teal: 'navy', violet: 'navy', rose: 'navy', lime: 'spy', blue: 'spy', coral: 'spy', slate: 'fixer' };
  const row = CHARTS.long.resupplyRow!;
  const a = (() => { for (let x = -4; x <= 4; x++) if (!actionAt(CHARTS.long, { a: x, b: row })) return x; throw new Error(); })();
  const s = sail(table(roles, { chart: 'long', ship: { a, b: row - 1 }, ammo: { amber: 0, teal: 1, violet: 5, rose: 3, lime: 0, blue: 0, coral: 0, slate: 2 } }), 's.steady');
  assert.equal(s.ammo.amber, 3);
  assert.equal(s.ammo.violet, 5);
  assert.ok(s.log.some((e) => e.k === 'resupply'));
});

test('timeouts make a sensible choice in every phase', () => {
  let s = table();
  s = g.timeout!(s, 'amber', 0, ctx(s));
  assert.equal(s.phase, 'vote');
  assert.ok(s.officer && s.helm && s.officer !== s.helm && s.officer !== 'amber');
  assert.ok(s.log.some((e) => e.k === 'pick' && e.auto));
  assert.equal(g.timeout!(s, 'amber', 0, ctx(s)), s, 'not their turn: no change');
  for (const p of g.turn!(s)) s = g.timeout!(s, p, 0, ctx(s));
  assert.equal(s.phase, 'draw');
  for (const p of g.turn!(s)) s = g.timeout!(s, p, 0, ctx(s));
  assert.equal(s.phase, 'steer');
  s = g.timeout!(s, s.helm!, 0, ctx(s));
  assert.equal(s.round, 2);

  const free = (() => { for (let b = 0; b < 4; b++) for (let a = -3; a <= 3; a++) if (!actionAt(CHARTS.short, { a, b: b + 1 })) return { a, b }; throw new Error(); })();
  let c = sail(table(ROLES5, { ship: free }), 's.contraband');
  for (const p of g.turn!(c)) c = g.timeout!(c, p, 0, ctx(c));
  assert.equal(c.phase, 'pick');
  assert.equal(c.secrets.lime.at(-1)!.k, 'bridge', 'the Fixer looks at the bridge');
});

test('resigning: played automatically, never a winner; everyone aboard resigning ends it', () => {
  let s = act(table(), 'amber', { type: 'resign' });
  assert.ok(s.resigned.includes('amber'));
  assert.notEqual(s.phase, 'pick', 'the resigned captain’s pick was made for them');
  assert.match(err(g.act(s, 'amber', { type: 'vote', rounds: 0 }, 0, ctx(s))) ?? '', /resigned/);
  let t = sail(table(ROLES5, { ship: { a: 3, b: 1 }, resigned: ['teal'] }), 'ne.steady', 'violet', 'rose');
  assert.deepEqual(t.result!.placings, [['amber', 'violet'], ['rose', 'lime'], ['teal']]);
  t = table();
  for (const p of t.order) t = act(t, p, { type: 'resign' });
  assert.ok(t.result?.nobodyWins);
});

// ---- Random play ----

function randomAction(s: ShipState, seat: string, rnd: () => number): Record<string, unknown> {
  const v = view(s, seat);
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  if (rnd() < 0.002) return { type: 'resign' };
  if (rnd() < 0.03) return pick([{ type: 'vote', rounds: 9 }, { type: 'keep', index: 3 }, { type: 'target', target: 'nobody' }, { type: 'steer' }, { type: 'pick' }]);
  switch (s.phase) {
    case 'pick': { const a = pick(v.choices); const b = pick(v.choices.filter((x) => x !== a)); return { type: 'pick', officer: a, helm: b }; }
    case 'vote': return { type: 'vote', rounds: Math.floor(rnd() * (s.ammo[seat] + 1)) };
    case 'tiebreak': case 'emergency': case 'target': return { type: s.phase, target: pick(v.choices) };
    case 'draw': return { type: 'keep', index: rnd() < 0.5 ? 0 : 1 };
    case 'steer': return rnd() < 0.05 ? { type: 'abandon' } : { type: 'steer', index: rnd() < 0.5 ? 0 : 1 };
    case 'spot': return { type: 'spot', keep: rnd() < 0.5 };
    case 'contraband': {
      if (!v.you!.fixerMove) return { type: 'ack' };
      const o = pick(['bribe', 'cash', 'bridge']);
      if (o === 'bribe' && v.you!.bribable.length) return { type: 'contraband', option: 'bribe', target: pick(v.you!.bribable) };
      if (o === 'cash') return { type: 'contraband', option: 'cash', gifts: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(aboard(s))).join(',') };
      return { type: 'contraband', option: 'bridge' };
    }
  }
}

function cardsInPlay(s: ShipState): number {
  let n = s.deck.length + s.discard.length + s.played.length + (s.spotCard ? 1 : 0);
  if (s.phase === 'draw') for (const p of [s.captain, s.officer!]) n += p in s.kept ? 1 : 2;
  if (s.phase === 'steer') n += s.helmCards.length;
  return n;
}

const HIDDEN = ['roles', 'faction', 'ammo', 'deck', 'hands', 'kept', 'helmCards', 'spotCard', 'secrets', 'votes', 'discard'];

function checkPrivacy(s: ShipState) {
  const over = !!s.result;
  for (const viewer of [null, ...s.order]) {
    const v = view(s, viewer);
    for (const k of HIDDEN) assert.ok(!(k in v), `no raw ${k} in a view`);
    if (!over) assert.equal(v.reveal, null);
    if (viewer === null) { assert.equal(v.you, null); continue; }
    const y = v.you!;
    assert.equal(y.role, s.roles[viewer]);
    assert.deepEqual(y.secrets, s.secrets[viewer] ?? []);
    if (s.roles[viewer] !== 'spy') assert.equal(y.spies, null);
    if (s.faction[viewer] !== 'bm') assert.deepEqual(y.partners, []);
    if (!over) {
      const text = JSON.stringify(v);
      if (s.roles[viewer] !== 'fixer') assert.ok(!text.includes('"fixer"'), 'the Fixer stays hidden');
      if (s.roles[viewer] !== 'smuggler') assert.ok(!text.includes('"smuggler"'));
      if (y.hand) assert.deepEqual(y.hand, s.hands[viewer]);
      if (y.helmCards) assert.equal(s.helm, viewer);
      if (y.spotCard) assert.equal(s.spotter, viewer);
    }
  }
}

function playRandom(n: number, seed: number, check: boolean): ShipState {
  const rnd = seeded(seed);
  const c = { seats: seats(n), random: rnd };
  let s = g.create({}, 0, c);
  for (let i = 0; i < 4000 && !s.result; i++) {
    const turn = g.turn!(s);
    assert.ok(turn.length > 0, 'someone always has to act');
    const seat = turn[Math.floor(rnd() * turn.length)];
    if (rnd() < 0.05) { s = g.timeout!(s, seat, 0, c); continue; }
    const r = g.act(s, seat, randomAction(s, seat, rnd), 0, c);
    if (!('error' in r)) s = r.state;
    if (check) {
      assert.ok(aboard(s).length >= 3, 'never fewer than three aboard');
      assert.ok(Object.values(s.ammo).every((a) => a >= 0));
      if (!s.result) assert.equal(cardsInPlay(s), FULL_DECK.length, 'every order accounted for');
      assert.ok(!s.overboard.includes(s.captain));
      if (i % 7 === 0) checkPrivacy(s);
    }
  }
  return s;
}

test('fuzz: hundreds of random games for every player count end cleanly, privately', () => {
  for (let n = 5; n <= 11; n++) {
    for (let k = 0; k < 60; k++) {
      const s = playRandom(n, n * 1000 + k + 1, true);
      assert.ok(s.result, `${n} players, game ${k} finished`);
      checkPrivacy(s);
      const placed = s.result!.placings!.flat();
      assert.deepEqual(new Set(placed), new Set(s.order), 'everyone placed once');
      assert.equal(placed.length, s.order.length);
    }
  }
});

test('replays: one frame per step, watcher views only, roles hidden until the end', () => {
  for (const n of [5, 8, 11]) {
    const s = playRandom(n, 99 + n, false);
    const frames = g.replay!(s) as ShipView[];
    assert.equal(frames.length, s.history!.steps.length + 1);
    frames.slice(0, -1).forEach((f) => {
      assert.equal(f.you, null);
      assert.equal(f.reveal, null);
      assert.ok(!JSON.stringify(f).includes('"fixer"'));
    });
    const last = frames.at(-1)!;
    assert.deepEqual(last.result, s.result);
    assert.deepEqual(last.reveal!.roles, s.roles);
    assert.deepEqual(last.ship, s.ship);
  }
});
