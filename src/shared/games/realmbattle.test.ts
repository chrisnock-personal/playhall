import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realmBattle as g, alive, autoChoice, enemiesOf, type BattleState } from './realmbattle';
import { newFighter } from './realmduel';

const ok = (r: ReturnType<typeof g.act>): BattleState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
const seats4 = ['amber', 'teal', 'violet', 'rose'];
const ctx = { seats: seats4, random: () => 0.4 };

test('teams: Amber and Violet (Sun) against Teal and Rose (Moon); seats by mode', () => {
  const s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  assert.deepEqual(s.team, { amber: 0, teal: 1, violet: 0, rose: 1 });
  assert.deepEqual(enemiesOf(s, 'amber'), ['teal', 'rose']);
  assert.equal(g.seatsFor!({ mode: '3v3', hand: 3 }).length, 6);
  const ffa = g.create({ mode: 'ffa', hand: 3 }, 0, { seats: ['amber', 'teal', 'violet'], random: () => 0.4 });
  assert.deepEqual(enemiesOf(ffa, 'amber'), ['teal', 'violet']);
});

test('a round waits for everyone, team mates see each other’s picks, targets must be enemies', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  assert.match(err(g.act(s, 'amber', { type: 'choose', creature: 0, style: 'melee', target: 'violet' }, 0, ctx)) ?? '', /other side/);
  s = ok(g.act(s, 'amber', { type: 'choose', creature: 0, style: 'melee', target: 'teal' }, 0, ctx));
  const violetSees = g.view(s, 0, 'violet') as { teamChoices: Record<string, unknown>; locked: Record<string, boolean> };
  assert.ok(violetSees.teamChoices.amber, 'a team mate sees the pick');
  assert.ok(!(g.view(s, 0, 'teal') as { teamChoices: Record<string, unknown> }).teamChoices.amber, 'the other side doesn’t');
  for (const p of ['teal', 'violet', 'rose']) s = ok(g.act(s, p, { type: 'choose', ...autoChoice(s, p) }, 0, ctx));
  assert.equal(s.rounds.length, 1);
  assert.ok(s.rounds[0].lines.length > 2);
});

test('a fallen target: the hit goes to another enemy', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  // Teal's creature is nearly out; Rose's is fine. Amber (faster) and Violet both target Teal.
  const hands = {
    amber: [newFighter('emberfox')], violet: [newFighter('galewing')],
    teal: [{ ...newFighter('stonehorn'), hp: 1, shielded: false }], rose: [newFighter('lumenstag')],
  };
  s = { ...s, hands };
  s = ok(g.act(s, 'amber', { type: 'choose', creature: 0, style: 'ranged', target: 'teal' }, 0, ctx));
  s = ok(g.act(s, 'violet', { type: 'choose', creature: 0, style: 'ranged', target: 'teal' }, 0, ctx));
  s = ok(g.act(s, 'teal', { type: 'choose', creature: 0, style: 'melee', target: 'amber' }, 0, ctx));
  s = ok(g.act(s, 'rose', { type: 'choose', creature: 0, style: 'melee', target: 'amber' }, 0, ctx));
  assert.ok(s.rounds[0].lines.some((l) => /its target having fallen/.test(l)));
  assert.deepEqual(s.out, [['teal']]);
  assert.deepEqual(alive(s), ['amber', 'teal', 'violet', 'rose'].filter((p) => p !== 'teal'));
});

test('the last team standing wins, both partners scoring', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  s = ok(g.act(s, 'teal', { type: 'resign' }, 0, ctx));
  assert.equal(s.result, null);
  s = ok(g.act(s, 'rose', { type: 'resign' }, 0, ctx));
  assert.deepEqual(s.result?.placings?.[0], ['amber', 'violet']);
  assert.equal(s.result?.teamWin, true);
});

test('each side gets a private team chat and voice, but a free-for-all gets none', () => {
  const s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  assert.deepEqual(g.teamChat!(s, 'amber'), { channel: 'team-0', label: 'Sun team' });
  assert.deepEqual(g.teamChat!(s, 'rose'), { channel: 'team-1', label: 'Moon team' });
  assert.equal(g.teamChat!(s, null), null, 'watchers don’t get a team chat');
  assert.deepEqual(g.teamVoice!(s, 'amber'), { channel: 'team-0', label: 'Sun team voice' });
  assert.deepEqual(g.teamVoice!(s, 'rose'), { channel: 'team-1', label: 'Moon team voice' });
  assert.equal(g.teamVoice!(s, null), null, 'watchers don’t get side voice');
  const ffa = g.create({ mode: 'ffa', hand: 3 }, 0, { seats: seats4, random: () => 0.4 });
  assert.equal(g.teamChat!(ffa, 'amber'), null);
  assert.equal(g.teamVoice!(ffa, 'amber'), null);
});

test('Mend heals a team mate who is more hurt than the Lumen Stag', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  s = { ...s, hands: {
    amber: [{ ...newFighter('emberfox'), hp: 20 }], violet: [{ ...newFighter('lumenstag'), hp: 10 }],
    teal: [newFighter('stonehorn')], rose: [newFighter('galewing')],
  } };
  for (const [p, choice] of [
    ['amber', { creature: 0, style: 'ranged', target: 'teal' }],
    ['violet', { creature: 0, style: 'ranged', target: 'teal' }],
    ['teal', { creature: 0, style: 'ranged', target: 'amber' }],
    ['rose', { creature: 0, style: 'ranged', target: 'amber' }],
  ] as const) s = ok(g.act(s, p, { type: 'choose', ...choice }, 0, ctx));
  assert.ok(s.rounds[0].lines.some((l) => /Mend: Violet’s Lumen Stag heals Amber’s Emberfox for 4\./.test(l)));
  assert.equal(s.hands.amber[0].hp, 10);
  assert.equal(s.hands.violet[0].hp, 10, 'the Lumen Stag, less hurt, isn’t healed');
});

test('Shield covers a team mate more hurt than the Stonehorn, for that fight', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  s = { ...s, hands: {
    amber: [newFighter('stonehorn')], violet: [{ ...newFighter('emberfox'), hp: 20 }],
    teal: [newFighter('galewing')], rose: [newFighter('tidecaller')],
  } };
  for (const [p, choice] of [
    ['amber', { creature: 0, style: 'melee', target: 'teal' }],
    ['violet', { creature: 0, style: 'ranged', target: 'teal' }],
    ['teal', { creature: 0, style: 'ranged', target: 'violet' }],
    ['rose', { creature: 0, style: 'ranged', target: 'amber' }],
  ] as const) s = ok(g.act(s, p, { type: 'choose', ...choice }, 0, ctx));
  assert.ok(s.rounds[0].lines.some((l) => /Shield: Amber’s Stonehorn covers Violet’s Emberfox\./.test(l)));
  assert.ok(s.rounds[0].lines.some((l) => /\(shielded\)/.test(l)));
  assert.equal(s.hands.violet[0].hp, 14, 'the covered hit did 6, not 12');
});

test('Mend heals the Lumen Stag itself when it is the most hurt on its side', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  s = { ...s, hands: {
    amber: [newFighter('emberfox')], violet: [{ ...newFighter('lumenstag'), hp: 20 }],
    teal: [newFighter('stonehorn')], rose: [newFighter('galewing')],
  } };
  for (const [p, choice] of [
    ['amber', { creature: 0, style: 'ranged', target: 'teal' }],
    ['violet', { creature: 0, style: 'ranged', target: 'teal' }],
    ['teal', { creature: 0, style: 'ranged', target: 'violet' }],
    ['rose', { creature: 0, style: 'ranged', target: 'violet' }],
  ] as const) s = ok(g.act(s, p, { type: 'choose', ...choice }, 0, ctx));
  assert.ok(s.rounds[0].lines.some((l) => /Mend: Violet’s Lumen Stag heals itself for 4\./.test(l)), s.rounds[0].lines.join('\n'));
  assert.equal(s.hands.amber[0].hp, 28, 'the unhurt Emberfox needs nothing');
});

test('Shield stays on the Stonehorn when nobody on its side is more hurt', () => {
  let s = g.create({ mode: '2v2', hand: 3 }, 0, ctx);
  s = { ...s, hands: {
    amber: [newFighter('stonehorn')], violet: [newFighter('emberfox')],
    teal: [newFighter('galewing')], rose: [newFighter('tidecaller')],
  } };
  for (const [p, choice] of [
    ['amber', { creature: 0, style: 'melee', target: 'teal' }],
    ['violet', { creature: 0, style: 'ranged', target: 'teal' }],
    ['teal', { creature: 0, style: 'ranged', target: 'amber' }],
    ['rose', { creature: 0, style: 'ranged', target: 'amber' }],
  ] as const) s = ok(g.act(s, p, { type: 'choose', ...choice }, 0, ctx));
  assert.ok(!s.rounds[0].lines.some((l) => /^Shield: .* covers /.test(l)), 'no cover line');
  assert.ok(s.rounds[0].lines.some((l) => /\(shielded\)/.test(l)), 'the Stonehorn’s own hit is halved');
});
