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
