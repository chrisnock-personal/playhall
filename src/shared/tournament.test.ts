import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketOrder, finished, pairRound, points, roundsFor, standings, type Round } from './tournament';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const play = (r: Round, pick: (a: string, b: string) => 'a' | 'b' | 'draw'): Round =>
  r.map((m) => (m.b ? { ...m, result: pick(m.a, m.b), how: 'game' as const } : m));
const seedWins = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? 'a' : 'b') as 'a' | 'b';

test('a seeded bracket: 1 v 8, 4 v 5, 2 v 7, 3 v 6', () => {
  assert.deepEqual(bracketOrder(8), [0, 7, 3, 4, 1, 6, 2, 5]);
});

test('knockout: byes for the top seeds, winners meet, the top two meet in the final', () => {
  const seeds = ids(6);
  let rounds: Round[] = [];
  const r1 = pairRound('knockout', seeds, rounds);
  assert.equal(r1.length, 4);
  assert.deepEqual(r1.filter((m) => !m.b).map((m) => m.a).sort(), ['p1', 'p2'], 'the top two seeds get byes');
  rounds = [play(r1, seedWins)];
  rounds.push(play(pairRound('knockout', seeds, rounds), seedWins));
  const final = pairRound('knockout', seeds, rounds);
  assert.equal(final.length, 1);
  assert.deepEqual([final[0].a, final[0].b], ['p1', 'p2']);
  rounds.push(play(final, seedWins));
  assert.ok(finished('knockout', seeds, rounds, 0));
  assert.equal(standings('knockout', seeds.map((id) => ({ id, name: id })), rounds)[0].id, 'p1');
});

test('round robin: everyone meets everyone once, with a bye each round when odd', () => {
  for (const n of [4, 5, 6]) {
    const seeds = ids(n);
    const rounds: Round[] = [];
    for (let r = 0; r < roundsFor('roundrobin', n, 0); r++) rounds.push(play(pairRound('roundrobin', seeds, rounds), seedWins));
    const met = new Set(rounds.flat().filter((m) => m.b).map((m) => [m.a, m.b].sort().join('|')));
    assert.equal(met.size, (n * (n - 1)) / 2, `${n} players: every pair once`);
    assert.ok(rounds.every((r) => new Set(r.flatMap((m) => [m.a, m.b]).filter(Boolean)).size === n), 'everyone once a round');
    assert.ok(finished('roundrobin', seeds, rounds, 0));
  }
});

test('Swiss: pairs on the same score, no rematches, one bye each at most', () => {
  const seeds = ids(7);
  const rounds: Round[] = [];
  for (let r = 0; r < 3; r++) rounds.push(play(pairRound('swiss', seeds, rounds), seedWins));
  const pairs = rounds.flat().filter((m) => m.b).map((m) => [m.a, m.b].sort().join('|'));
  assert.equal(new Set(pairs).size, pairs.length, 'no rematches');
  const byes = rounds.flat().filter((m) => !m.b).map((m) => m.a);
  assert.equal(new Set(byes).size, byes.length, 'nobody gets two byes');
  assert.equal(points(rounds).p1, 3, 'the top seed wins every game');
  assert.ok(finished('swiss', seeds, rounds, 3));
  const table = standings('swiss', seeds.map((id) => ({ id, name: id })), rounds);
  assert.equal(table[0].id, 'p1');
});

test('draws are half a point each', () => {
  const r: Round[] = [[{ a: 'x', b: 'y', room: null, result: 'draw', how: 'game' }]];
  assert.deepEqual(points(r), { x: 0.5, y: 0.5 });
});
