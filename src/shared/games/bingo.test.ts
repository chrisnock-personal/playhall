import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bingo as g, makeCard75, makeTicket, rowsDone, callWords, type BingoState } from './bingo';

function seeded(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
const ctx = { seats: ['amber', 'teal'], random: seeded(7) };
const ok = (r: ReturnType<typeof g.act>): BingoState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);

test('a 90-ball ticket: five numbers a row, one to three a column, in the right tens, sorted down', () => {
  for (let k = 0; k < 200; k++) {
    const t = makeTicket(seeded(k + 1));
    assert.deepEqual(t.map((row) => row.filter((n) => n !== null).length), [5, 5, 5]);
    for (let c = 0; c < 9; c++) {
      const col = t.map((row) => row[c]).filter((n): n is number => n !== null);
      assert.ok(col.length >= 1 && col.length <= 3);
      for (const n of col) assert.equal(n === 90 ? 8 : Math.floor(n / 10), c);
      assert.deepEqual(col, [...col].sort((a, b) => a - b));
    }
  }
});

test('the calls come on the clock; marking only called numbers on your ticket', () => {
  let s = g.create(g.defaultConfig, 0, ctx);
  assert.equal(g.tick(s, 1000), null, 'not before the lead-in');
  s = g.tick(s, g.nextDeadline(s)!)!;
  const first = s.calls[0];
  const mine = s.tickets.amber[0].flat().filter((n): n is number => n !== null);
  const notCalled = mine.find((n) => n !== first)!;
  assert.match(err(g.act(s, 'amber', { type: 'mark', n: notCalled }, 0, ctx)) ?? '', /hasn’t been called/);
  if (!mine.includes(first)) assert.match(err(g.act(s, 'amber', { type: 'mark', n: first }, 0, ctx)) ?? '', /isn’t on your ticket/);
  assert.equal(callWords(22), 'Two little ducks, 22');
  assert.equal(callWords(6), 'On its own, number 6');
  assert.equal(callWords(37), '3 and 7, 37');
});

test('prizes in order: one line, two lines, then a full house ends it; auto-mark keeps up', () => {
  let s = g.create(g.defaultConfig, 0, ctx);
  s = ok(g.act(s, 'amber', { type: 'auto', on: true }, 0, ctx));
  while (!s.result) s = g.tick(s, g.nextDeadline(s)!)!;
  assert.deepEqual(s.prizes.map((p) => p.stage), ['one line', 'two lines', 'full house']);
  assert.deepEqual(s.prizes.at(-1)!.winners, ['amber'], 'teal never marked anything');
  assert.equal(rowsDone(s.tickets.amber, s.marked.amber), 3);
  assert.equal(s.result.winner, 'amber');
  assert.deepEqual(s.result.placings, [['amber'], ['teal']]);
});

test('75-ball: a 5×5 card with a free centre; lines across, down and diagonally', () => {
  const card = makeCard75(seeded(5));
  assert.equal(card.length, 5);
  assert.equal(card[2][2], null);
  card.forEach((row) => row.forEach((n, c) => { if (n !== null) assert.equal(Math.floor((n - 1) / 15), c, 'B I N G O columns'); }));
  // The diagonal through the free centre.
  const diag = [card[0][0], card[1][1], card[3][3], card[4][4]] as number[];
  assert.equal(rowsDone([card], diag), 1);
  assert.equal(callWords(12, 75), 'B 12');
});

test('a 75-ball game: calls 1-75, ending on a full card', () => {
  const ctx75 = { seats: ['amber'], random: seeded(9) };
  let s = g.create({ speed: 4, tickets: 1, balls: 75 }, 0, ctx75);
  assert.equal(s.calls.length, 75);
  s = ok(g.act(s, 'amber', { type: 'auto', on: true }, 0, ctx75));
  while (!s.result) s = g.tick(s, g.nextDeadline(s)!)!;
  assert.equal(s.prizes.at(-1)!.stage, 'full house');
});

test('pausing stops the calls; starting them again carries on', () => {
  let s = g.create(g.defaultConfig, 0, ctx);
  s = ok(g.act(s, 'amber', { type: 'pause' }, 0, ctx));
  assert.equal(g.nextDeadline(s), null);
  assert.equal(g.tick(s, 10_000_000), null);
  s = ok(g.act(s, 'teal', { type: 'resume' }, 50_000, ctx));
  assert.equal(g.nextDeadline(s), 56_000);
});
