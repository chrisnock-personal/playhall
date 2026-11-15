import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fourInARow, COLS, ROWS, type FourState, type FourView } from './fourinarow';

const ctx = { seats: ['amber', 'teal'], random: Math.random };
const start = () => fourInARow.create({}, 0, ctx);

function play(cols: number[], state = start()): FourState {
  cols.forEach((col, i) => {
    const r = fourInARow.act(state, i % 2 === 0 ? 'amber' : 'teal', { type: 'drop', col }, i, ctx);
    if ('error' in r) throw new Error(`move ${i} (col ${col}): ${r.error}`);
    state = r.state;
  });
  return state;
}

test('discs fall to the lowest free cell and turns alternate', () => {
  const s = play([3, 3]);
  assert.equal(s.grid[3], 'amber');
  assert.equal(s.grid[COLS + 3], 'teal');
  assert.ok('error' in fourInARow.act(s, 'teal', { type: 'drop', col: 0 }, 9, ctx), 'not teal’s turn');
});

test('four across, up and diagonally win', () => {
  assert.equal(play([0, 0, 1, 1, 2, 2, 3]).result?.winner, 'amber');
  assert.equal(play([0, 1, 0, 1, 0, 1, 0]).result?.winner, 'amber');
  // Amber builds a rising diagonal 0..3.
  const diag = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(diag.result?.winner, 'amber');
  assert.equal(diag.winLine?.length, 4);
});

test('a full column is refused; a full board is a draw', () => {
  const full = play([0, 0, 0, 0, 0, 0]);
  assert.ok('error' in fourInARow.act(full, 'amber', { type: 'drop', col: 0 }, 9, ctx));
  // Fill the board column pairs in an order that never makes four.
  const order: number[] = [];
  for (const pair of [[0, 1], [2, 3], [4, 5]]) for (let i = 0; i < ROWS; i++) order.push(...(i % 3 === 2 ? [pair[1], pair[0]] : pair));
  for (let i = 0; i < ROWS; i++) order.push(6);
  const s = play(order);
  assert.deepEqual(s.result, { winner: null, reason: 'a full board' });
});

test('the view shows whose turn it is and the last disc', () => {
  const v = fourInARow.view(play([4]), 0, null) as FourView;
  assert.equal(v.turn, 'teal');
  assert.equal(v.lastCell, 4);
});

test('replay: one frame per disc, ending on the result', () => {
  const s = play([0, 1, 0, 1, 0, 1, 0]);
  const frames = fourInARow.replay!(s) as FourView[];
  assert.equal(frames.length, 8);
  assert.equal(frames[0].grid.filter(Boolean).length, 0);
  assert.equal(frames[7].result?.winner, 'amber');
});
