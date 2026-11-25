import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  realmDuel, damage, attackValue, autoChoice, newFighter, deal, CREATURES, CREATURE_IDS, MAX_ROUNDS, POISON_ROUNDS,
  type CreatureId, type RealmState, type RealmView, type Style,
} from './realmduel';
import { score } from '../scoring';

/** A random source that returns the given numbers in turn, then 0.99. */
const seq = (...xs: number[]) => () => (xs.length ? xs.shift()! : 0.99);
const ctx = (random: () => number = Math.random) => ({ seats: ['amber', 'teal'], random });
const ok = (r: ReturnType<typeof realmDuel.act>): RealmState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof realmDuel.act>) => ('error' in r ? r.error : null);
/** A game with these hands, past the draft (as an old save or a test setup). */
function game(amber: CreatureId[], teal: CreatureId[]): RealmState {
  const s = realmDuel.create({ hand: 3 }, 0, ctx());
  const hands = { amber: amber.map(newFighter), teal: teal.map(newFighter) };
  return { ...s, phase: 'fight', hands, dealt: hands };
}
/** Finish a draft with the given kinds, one pick per turn. */
function draftAll(s: RealmState, kinds: CreatureId[]): RealmState {
  for (const kind of kinds) s = ok(realmDuel.act(s, realmDuel.turn!(s)[0], { type: 'draft', kind }, 0, ctx()));
  return s;
}
/** Both choose, amber first; returns the state after the round. */
function round(s: RealmState, a: [number, Style], t: [number, Style], random: () => number = seq()): RealmState {
  s = ok(realmDuel.act(s, 'amber', { type: 'choose', creature: a[0], style: a[1] }, 0, ctx(random)));
  return ok(realmDuel.act(s, 'teal', { type: 'choose', creature: t[0], style: t[1] }, 0, ctx(random)));
}
const C = CREATURES;

test('the draft: one pool of 30, snake order, no duplicates, the chosen hand sizes', () => {
  const s = realmDuel.create(realmDuel.parseConfig({}), 0, ctx());
  assert.equal(s.phase, 'draft');
  assert.equal(s.draft!.pool.length, 30);
  assert.deepEqual(s.draft!.order, ['amber', 'teal', 'teal', 'amber', 'amber', 'teal']);
  assert.equal(s.hands.amber.length, 0);
  assert.ok(err(realmDuel.act(s, 'teal', { type: 'draft', kind: 'emberfox' }, 0, ctx())), 'not your turn');
  const first = ok(realmDuel.act(s, 'amber', { type: 'draft', kind: 'emberfox' }, 0, ctx()));
  assert.ok(err(realmDuel.act(first, 'teal', { type: 'draft', kind: 'emberfox' }, 0, ctx())), 'already taken');
  const done = draftAll(first, ['tidecaller', 'galewing', 'stonehorn', 'lumenstag', 'duskmaw']);
  assert.equal(done.phase, 'fight');
  assert.deepEqual(done.draft!.taken, {
    amber: ['emberfox', 'stonehorn', 'lumenstag'], teal: ['tidecaller', 'galewing', 'duskmaw'],
  });
  assert.deepEqual(done.hands.amber.map((f) => f.kind), done.draft!.taken.amber);
  assert.deepEqual(done.dealt.teal.map((f) => f.kind), done.draft!.taken.teal);
  assert.ok(done.hands.amber.every((f) => f.hp === C[f.kind].hp));
  const six = realmDuel.create(realmDuel.parseConfig({ hand: 6 }), 0, ctx());
  assert.equal(six.draft!.order.length, 12);
  assert.deepEqual(realmDuel.parseConfig({ hand: 99 }), { hand: 3 });
  const oldDeal = deal(CREATURE_IDS.length, Math.random);
  assert.equal(oldDeal.length, 30, 'the old deal helper still draws from the whole roster');
  assert.equal(new Set(oldDeal.map((f) => f.kind)).size, 30);
});

test('a draft timeout picks a strong available creature and keeps the turn moving', () => {
  let s = realmDuel.create(realmDuel.parseConfig({}), 0, ctx());
  s = realmDuel.timeout!(s, 'amber', 0, ctx());
  assert.equal(s.draft!.taken.amber[0], 'dawnsentinel');
  assert.deepEqual(realmDuel.turn!(s), ['teal']);
  const v = realmDuel.view(s, 0, 'amber') as RealmView;
  assert.equal(v.phase, 'draft');
  assert.equal(v.draft!.next, 'teal');
  assert.equal(v.hands.amber.length, 0);
});

test('damage maths: attack values, defence, intellect, a floor of 1', () => {
  assert.equal(attackValue(C.stonehorn, 'melee'), 18);
  assert.equal(attackValue(C.emberfox, 'ranged'), 18);
  assert.equal(attackValue(C.tidecaller, 'magic'), 16);
  // Stonehorn melee vs Lumen Stag: 18 - Defence 6.
  assert.deepEqual(damage(C.stonehorn, C.lumenstag, 'melee'), { damage: 12, advantage: false });
  // Tidecaller magic vs Duskmaw: 16 - Intellect 6.
  assert.deepEqual(damage(C.tidecaller, C.duskmaw, 'magic'), { damage: 10, advantage: false });
  // Stonehorn's magic (6) against Lumen Stag's Intellect 7: still 1.
  assert.equal(damage(C.stonehorn, C.lumenstag, 'magic').damage, 1);
  // Shielded halves, rounding up.
  assert.equal(damage(C.stonehorn, C.lumenstag, 'melee', true).damage, 6);
  assert.equal(damage(C.duskmaw, C.stonehorn, 'ranged', true).damage, 2); // 12 - 9 = 3, halved up
});

test('element advantage: +50% against the element you beat, both ways for Light and Shadow', () => {
  // Fire beats Air: Emberfox ranged 18 - Galewing Defence 3 = 15, x1.5 = 22.
  assert.deepEqual(damage(C.emberfox, C.galewing, 'ranged'), { damage: 22, advantage: true });
  assert.equal(damage(C.galewing, C.emberfox, 'ranged').advantage, false, 'Air doesn’t beat Fire');
  assert.ok(damage(C.galewing, C.stonehorn, 'ranged').advantage, 'Air beats Earth');
  assert.ok(damage(C.stonehorn, C.tidecaller, 'melee').advantage, 'Earth beats Water');
  assert.ok(damage(C.tidecaller, C.emberfox, 'magic').advantage, 'Water beats Fire');
  assert.ok(damage(C.lumenstag, C.duskmaw, 'magic').advantage && damage(C.duskmaw, C.lumenstag, 'magic').advantage);
  // Rounded down: Lumen Stag magic 14 - Duskmaw Intellect 6 = 8, x1.5 = 12.
  assert.equal(damage(C.lumenstag, C.duskmaw, 'magic').damage, 12);
});

test('first strike: higher Agility first; a knock-out stops the reply', () => {
  // Emberfox (Agility 9) vs Galewing (8): 22 ranged, then Galewing hits back.
  let s = round(game(['emberfox'], ['galewing']), [0, 'ranged'], [0, 'melee']);
  const r = s.rounds[0];
  assert.equal(r.first, 'amber');
  assert.equal(r.picks.amber.dealt, 22);
  assert.equal(s.hands.teal[0].hp, 26 - 22);
  assert.equal(r.picks.teal.dealt, Math.max(1, 10 - 4));
  // Next round Emberfox finishes Galewing first; Galewing never strikes.
  s = round(s, [0, 'ranged'], [0, 'ranged']);
  assert.equal(s.hands.teal[0].hp, 0);
  assert.equal(s.rounds[1].picks.teal.missed, 'knocked out');
  assert.equal(s.hands.amber[0].hp, 28 - 6);
});

test('Swift wins an Agility tie; other ties are a coin toss', () => {
  // No other starter matches Emberfox's Agility 9, so lend Galewing a 9 for this test.
  const agi = C.galewing.agi;
  C.galewing.agi = 9;
  try {
    const r = round(game(['galewing'], ['emberfox']), [0, 'magic'], [0, 'magic'], seq(0.1)).rounds[0];
    assert.equal(r.first, 'teal');
    assert.match(r.lines[1], /Swift/);
  } finally { C.galewing.agi = agi; }
  // Lumen Stag and Duskmaw both have Agility 6: a coin (random < .5 = amber).
  let s = round(game(['lumenstag'], ['duskmaw']), [0, 'magic'], [0, 'magic'], seq(0.1));
  assert.equal(s.rounds[0].first, 'amber');
  s = round(game(['lumenstag'], ['duskmaw']), [0, 'magic'], [0, 'magic'], seq(0.9));
  assert.equal(s.rounds[0].first, 'teal');
  // Two Emberfoxes (all-six games): both Swift, a coin again.
  s = round(game(['emberfox'], ['emberfox']), [0, 'melee'], [0, 'melee'], seq(0.9));
  assert.equal(s.rounds[0].first, 'teal');
});

test('Shield: Stonehorn takes half damage in its first fight only', () => {
  let s = round(game(['emberfox'], ['stonehorn']), [0, 'ranged'], [0, 'magic']);
  // Emberfox ranged 18 - 9 = 9, halved up = 5.
  assert.equal(s.rounds[0].picks.amber.dealt, 5);
  assert.equal(s.hands.teal[0].shielded, false);
  s = round(s, [0, 'ranged'], [0, 'magic']);
  assert.equal(s.rounds[1].picks.amber.dealt, 9);
});

test('Undertow: a magic hit stuns 1 in 3, and the stun costs the next attack (even this round)', () => {
  // Tidecaller (Agility 6) vs Stonehorn (3): Tidecaller first; roll .2 < 1/3 stuns.
  let s = round(game(['tidecaller'], ['stonehorn']), [0, 'magic'], [0, 'melee'], seq(0.2));
  assert.equal(s.rounds[0].picks.teal.missed, 'stunned');
  assert.equal(s.hands.amber[0].hp, 30);
  assert.equal(s.hands.teal[0].stunned, false, 'the stun is used up');
  // No stun on a roll of .5, nor from a melee hit.
  s = round(game(['tidecaller'], ['stonehorn']), [0, 'magic'], [0, 'melee'], seq(0.5));
  assert.equal(s.rounds[0].picks.teal.missed, null);
  s = round(game(['tidecaller'], ['stonehorn']), [0, 'melee'], [0, 'melee'], seq(0));
  assert.equal(s.rounds[0].picks.teal.missed, null);
});

test('Gust: a ranged hit stuns 1 in 4; a stun on a creature that already struck waits for its next fight', () => {
  // Emberfox (9) strikes first, then Galewing's ranged hit stuns it (roll .1).
  let s = round(game(['emberfox', 'stonehorn'], ['galewing']), [0, 'melee'], [0, 'ranged'], seq(0.1));
  assert.ok(s.hands.amber[0].stunned);
  assert.ok(s.rounds[0].lines.some((l) => l.startsWith('Gust')));
  // Resting Emberfox keeps the stun; it loses its attack when it next fights.
  s = round(s, [1, 'magic'], [0, 'magic']);
  assert.ok(s.hands.amber[0].stunned);
  s = round(s, [0, 'melee'], [0, 'magic']);
  assert.equal(s.rounds[2].picks.amber.missed, 'stunned');
  // Roll .3: no stun.
  s = round(game(['emberfox'], ['galewing']), [0, 'melee'], [0, 'ranged'], seq(0.3));
  assert.equal(s.hands.amber[0].stunned, false);
});

test('Poison bite: a melee hit poisons for 2 a round, three rounds, even resting', () => {
  // Duskmaw (6) vs Stonehorn (3): Duskmaw first, melee 14 - 9 = 5, shielded 3.
  let s = round(game(['duskmaw'], ['stonehorn', 'galewing']), [0, 'melee'], [0, 'magic']);
  assert.equal(s.hands.teal[0].poison, POISON_ROUNDS - 1);
  assert.equal(s.hands.teal[0].hp, 34 - 3 - 2);
  s = round(s, [0, 'magic'], [1, 'magic']);
  assert.equal(s.hands.teal[0].hp, 34 - 3 - 4, 'poison bites in the hand too');
  s = round(s, [0, 'magic'], [1, 'magic']);
  assert.equal(s.hands.teal[0].hp, 34 - 3 - 6);
  assert.equal(s.hands.teal[0].poison, 0);
  s = round(s, [0, 'magic'], [1, 'magic']);
  assert.equal(s.hands.teal[0].hp, 34 - 3 - 6, 'it wears off');
  // Magic and ranged don't poison.
  s = round(game(['duskmaw'], ['stonehorn']), [0, 'magic'], [0, 'magic']);
  assert.equal(s.hands.teal[0].poison, 0);
});

test('Mend: Lumen Stag heals 4 after a round it fights, never above full', () => {
  // Stonehorn melee 18 - 6 = 12 on Lumen Stag; Mend back 4.
  let s = round(game(['lumenstag', 'galewing'], ['stonehorn']), [0, 'magic'], [0, 'melee']);
  assert.equal(s.hands.amber[0].hp, 32 - 12 + 4);
  // Only 1 damage from Stonehorn's magic: heals just that.
  s = round(game(['lumenstag'], ['stonehorn']), [0, 'magic'], [0, 'magic']);
  assert.equal(s.hands.amber[0].hp, 32);
  assert.ok(s.rounds[0].lines.some((l) => l.includes('heals 1')));
});

test('hidden choices: the opponent sees only that you locked in; hidden cards stay hidden', () => {
  let s = game(['emberfox', 'stonehorn', 'galewing'], ['tidecaller', 'duskmaw', 'lumenstag']);
  assert.deepEqual(realmDuel.turn!(s), ['amber', 'teal']);
  s = ok(realmDuel.act(s, 'amber', { type: 'choose', creature: 1, style: 'melee' }, 0, ctx()));
  assert.deepEqual(realmDuel.turn!(s), ['teal']);
  const mine = realmDuel.view(s, 0, 'amber') as RealmView;
  assert.deepEqual(mine.mine, { creature: 1, style: 'melee' });
  for (const viewer of ['teal', null]) {
    const v = realmDuel.view(s, 0, viewer) as RealmView;
    assert.equal(v.locked.amber, true);
    assert.equal(v.mine, null);
    assert.deepEqual(v.hands.amber, [null, null, null], 'amber’s cards are face down');
    const text = JSON.stringify(v);
    assert.ok(!text.includes('stonehorn') && !text.includes('melee'), 'nothing about amber’s choice leaks');
  }
  assert.ok(err(realmDuel.act(s, 'amber', { type: 'choose', creature: 0, style: 'ranged' }, 0, ctx())), 'no changing a locked choice');
  // After the round, the two fighters are face up; the rest stay hidden.
  s = ok(realmDuel.act(s, 'teal', { type: 'choose', creature: 2, style: 'magic' }, 0, ctx()));
  const v = realmDuel.view(s, 0, 'teal') as RealmView;
  assert.deepEqual(v.hands.amber.map((f) => f?.kind ?? null), [null, 'stonehorn', null]);
  assert.equal((realmDuel.view(s, 0, 'teal') as RealmView).hands.teal.length, 3);
  assert.ok(!JSON.stringify(v).includes('"after"'), 'replay snapshots aren’t sent');
  assert.ok(!JSON.stringify(v).includes('emberfox'));
  assert.equal(v.rounds[0].picks.amber.kind, 'stonehorn');
});

test('bad input is refused', () => {
  let s = game(['emberfox'], ['galewing']);
  assert.ok(err(realmDuel.act(s, 'amber', { type: 'choose', creature: 5, style: 'melee' }, 0, ctx())));
  assert.ok(err(realmDuel.act(s, 'amber', { type: 'choose', creature: 0, style: 'laser' }, 0, ctx())));
  assert.ok(err(realmDuel.act(s, 'violet', { type: 'choose', creature: 0, style: 'melee' }, 0, ctx())));
  assert.ok(err(realmDuel.act(s, 'amber', { type: 'dance' }, 0, ctx())));
  s = { ...s, hands: { ...s.hands, amber: [{ ...s.hands.amber[0], hp: 0 }] } };
  assert.match(err(realmDuel.act(s, 'amber', { type: 'choose', creature: 0, style: 'melee' }, 0, ctx())) ?? '', /knocked out/);
});

test('knock-outs and the win: last with creatures standing wins 3 points', () => {
  let s = game(['emberfox'], ['galewing']);
  s = round(s, [0, 'ranged'], [0, 'ranged']);
  s = round(s, [0, 'ranged'], [0, 'ranged']);
  assert.deepEqual(s.result, { winner: 'amber', reason: 'knocking out every creature' });
  assert.deepEqual(realmDuel.turn!(s), []);
  assert.equal(score(s.result!, ['amber', 'teal']).amber.points, 3);
  // At the end everything is shown.
  const v = realmDuel.view(s, 0, null) as RealmView;
  assert.ok(v.hands.teal.every((f) => f));
  assert.ok(err(realmDuel.act(s, 'amber', { type: 'choose', creature: 0, style: 'melee' }, 0, ctx())));
});

test('both sides falling at once is a draw', () => {
  let s = game(['duskmaw'], ['stonehorn']);
  s = { ...s, hands: { amber: [{ ...s.hands.amber[0], hp: 1, poison: 2, stunned: true }], teal: [{ ...s.hands.teal[0], hp: 1, poison: 2, stunned: true }] } };
  s = round(s, [0, 'magic'], [0, 'magic']);
  assert.equal(s.result?.winner, null);
});

test('the round limit decides on creatures standing, then Health', () => {
  let s = game(['stonehorn'], ['stonehorn']);
  s = { ...s, rounds: Array(MAX_ROUNDS - 1).fill({ n: 0, picks: {}, first: 'amber', lines: [], after: s.hands }) };
  s = round(s, [0, 'magic'], [0, 'melee']);
  assert.equal(s.rounds.length, MAX_ROUNDS);
  assert.equal(s.result?.winner, 'teal');
  assert.match(s.result!.reason, /limit/);
});

test('timeout picks the healthiest creature with its strongest style, for everyone still choosing', () => {
  const s = game(['galewing', 'stonehorn', 'tidecaller'], ['tidecaller', 'lumenstag']);
  assert.deepEqual(autoChoice(s.hands.amber), { creature: 1, style: 'melee' });
  assert.deepEqual(autoChoice(s.hands.teal), { creature: 1, style: 'magic' });
  const hurt = { ...s, hands: { ...s.hands, amber: s.hands.amber.map((f, i) => (i === 1 ? { ...f, hp: 0 } : f)) } };
  assert.deepEqual(autoChoice(hurt.hands.amber), { creature: 2, style: 'magic' });
  const after = realmDuel.timeout!(s, 'amber', 0, ctx());
  assert.equal(after.rounds.length, 1);
  assert.equal(after.rounds[0].picks.amber.kind, 'stonehorn');
  // Only teal still choosing: just teal is picked for, amber’s choice stands.
  const half = ok(realmDuel.act(s, 'amber', { type: 'choose', creature: 0, style: 'ranged' }, 0, ctx()));
  const done = realmDuel.timeout!(half, 'teal', 0, ctx());
  assert.equal(done.rounds[0].picks.amber.kind, 'galewing');
  assert.equal(done.rounds[0].picks.teal.kind, 'lumenstag');
});

test('resign: the other player wins', () => {
  const s = ok(realmDuel.act(game(['emberfox'], ['galewing']), 'teal', { type: 'resign' }, 0, ctx()));
  assert.deepEqual(s.result, { winner: 'amber', reason: 'resignation' });
});

test('replay: the deal, a frame per round, everything shown at the end', () => {
  let s = game(['emberfox', 'stonehorn'], ['galewing', 'tidecaller']);
  s = round(s, [0, 'ranged'], [0, 'ranged']);
  const mid = realmDuel.replay!(s) as RealmView[];
  assert.equal(mid.length, 2);
  assert.equal(mid[0].phase, 'fight', 'a replay opens on the dealt hands, not the draft');
  assert.deepEqual(mid[0].hands.amber, [null, null], 'a watcher sees face-down cards at first');
  assert.equal(mid[1].hands.amber[0]?.kind, 'emberfox');
  assert.equal(mid[1].hands.amber[1], null);
  s = round(s, [0, 'ranged'], [0, 'ranged']);
  s = ok(realmDuel.act(s, 'teal', { type: 'resign' }, 0, ctx()));
  const frames = realmDuel.replay!(s) as RealmView[];
  assert.equal(frames.length, 3);
  assert.equal(frames[1].rounds.length, 1);
  assert.equal(frames[1].hands.teal[0]?.hp, s.rounds[0].picks.teal.hpAfter);
  assert.equal(frames[2].result?.reason, 'resignation');
  assert.equal(frames[2].hands.teal[1]?.kind, 'tidecaller');
});

test('fuzz: 500 random games all end without errors, health never out of range', () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lengths: number[] = [];
  for (let g = 0; g < 500; g++) {
    const c = ctx(random);
    let s = realmDuel.create({ hand: g % 4 === 0 ? 6 : 3 }, 0, c);
    while (s.phase === 'draft') {
      const seat = realmDuel.turn!(s)[0];
      const kind = s.draft!.pool[Math.floor(random() * s.draft!.pool.length)];
      s = ok(realmDuel.act(s, seat, { type: 'draft', kind }, 0, c));
    }
    for (let i = 0; i < 200 && !s.result; i++) {
      if (random() < 0.05) { s = realmDuel.timeout!(s, realmDuel.turn!(s)[0], 0, c); continue; }
      for (const seat of realmDuel.turn!(s)) {
        const alive = s.hands[seat].map((f, k) => (f.hp > 0 ? k : -1)).filter((k) => k >= 0);
        const pick = { type: 'choose', creature: alive[Math.floor(random() * alive.length)], style: (['melee', 'ranged', 'magic'] as const)[Math.floor(random() * 3)] };
        s = ok(realmDuel.act(s, seat, pick, 0, c));
        if (s.result) break;
      }
      for (const p of ['amber', 'teal']) for (const f of s.hands[p]) assert.ok(f.hp >= 0 && f.hp <= CREATURES[f.kind].hp, `game ${g}: health out of range`);
    }
    assert.ok(s.result, `game ${g} never ended`);
    lengths.push(s.rounds.length);
    const frames = realmDuel.replay!(s) as RealmView[];
    assert.equal(frames.length, s.rounds.length + 1);
  }
  assert.ok(Math.max(...lengths) <= MAX_ROUNDS);
});
