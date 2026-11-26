import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seaBattle, randomFleet, checkFleet, cellsFor, FLEET, SIZE, type SeaState, type SeaView } from './seabattle';

let seed = 11;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ctx = { seats: ['amber', 'teal'], random };
const ok = (r: ReturnType<typeof seaBattle.act>): SeaState => { if ('error' in r) throw new Error(r.error); return r.state; };

test('a random fleet has every ship, in a line, on the board, without overlaps', () => {
  for (let i = 0; i < 50; i++) {
    const fleet = randomFleet(random);
    assert.deepEqual(fleet.map((s) => s.cells.length), FLEET.map((f) => f.size));
    const all = fleet.flatMap((s) => s.cells);
    assert.equal(new Set(all).size, all.length);
    for (const s of fleet) {
      const step = s.cells[1] - s.cells[0];
      assert.ok(step === 1 || step === SIZE);
      if (step === 1) assert.equal(Math.floor(s.cells[0] / SIZE), Math.floor(s.cells.at(-1)! / SIZE), 'doesn’t wrap a row');
    }
  }
});

test('fleets are hidden: each player sees only their own, watchers neither', () => {
  const s = seaBattle.create({}, 0, ctx);
  const amber = seaBattle.view(s, 0, 'amber') as SeaView;
  assert.ok(amber.fleets.amber && !amber.fleets.teal);
  const watcher = seaBattle.view(s, 0, null) as SeaView;
  assert.deepEqual(watcher.fleets, {});
});

test('placing, then firing in turns; hits, sinking and winning', () => {
  let s = seaBattle.create({}, 0, ctx);
  assert.ok('error' in seaBattle.act(s, 'amber', { type: 'fire', cell: 0 }, 0, ctx), 'not before both are ready');
  s = ok(seaBattle.act(s, 'amber', { type: 'shuffle' }, 0, ctx));
  s = ok(seaBattle.act(s, 'amber', { type: 'ready' }, 0, ctx));
  assert.ok('error' in seaBattle.act(s, 'amber', { type: 'shuffle' }, 0, ctx), 'no shuffling once ready');
  assert.deepEqual(seaBattle.turn!(s), ['teal']);
  s = ok(seaBattle.act(s, 'teal', { type: 'ready' }, 0, ctx));
  assert.equal(s.phase, 'firing');
  // Amber fires at every teal ship square; teal fires at empty water in between.
  const targets = s.fleets.teal.flatMap((sh) => sh.cells);
  const water = Array.from({ length: 100 }, (_, i) => i).filter((i) => !s.fleets.amber.some((sh) => sh.cells.includes(i)));
  targets.forEach((cell, i) => {
    s = ok(seaBattle.act(s, 'amber', { type: 'fire', cell }, 0, ctx));
    if (!s.result) s = ok(seaBattle.act(s, 'teal', { type: 'fire', cell: water[i] }, 0, ctx));
  });
  assert.deepEqual(s.result, { winner: 'amber', reason: 'sinking the whole fleet' });
  assert.equal(s.shots.amber.filter((x) => x.sunk).length, 5);
  assert.ok('error' in seaBattle.act(s, 'teal', { type: 'fire', cell: 99 }, 0, ctx));
  assert.ok((seaBattle.view(s, 0, null) as SeaView).fleets.teal, 'fleets revealed at the end');
});

test('no firing twice at the same square', () => {
  let s = seaBattle.create({}, 0, ctx);
  s = ok(seaBattle.act(s, 'amber', { type: 'ready' }, 0, ctx));
  s = ok(seaBattle.act(s, 'teal', { type: 'ready' }, 0, ctx));
  s = ok(seaBattle.act(s, 'amber', { type: 'fire', cell: 5 }, 0, ctx));
  s = ok(seaBattle.act(s, 'teal', { type: 'fire', cell: 5 }, 0, ctx));
  assert.ok('error' in seaBattle.act(s, 'amber', { type: 'fire', cell: 5 }, 0, ctx));
});

test('placing your own fleet: checked on the server', () => {
  const own = [
    { name: 'Carrier', cells: cellsFor(0, 5, false)! },
    { name: 'Battleship', cells: cellsFor(20, 4, true)! },
    { name: 'Cruiser', cells: cellsFor(22, 3, false)! },
    { name: 'Submarine', cells: cellsFor(55, 3, true)! },
    { name: 'Destroyer', cells: cellsFor(98, 2, false)! },
  ];
  assert.equal(checkFleet(own), null);
  assert.equal(cellsFor(98, 3, false), null, 'off the right edge');
  assert.match(checkFleet(own.slice(0, 4))!, /all five/);
  assert.match(checkFleet([...own.slice(0, 4), { name: 'Destroyer', cells: [1, 2] }])!, /overlap/);
  assert.match(checkFleet([...own.slice(0, 4), { name: 'Destroyer', cells: [9, 10] }])!, /straight line/, 'no wrapping round a row');
  let s = seaBattle.create({}, 0, ctx);
  s = ok(seaBattle.act(s, 'amber', { type: 'place', ships: own }, 0, ctx));
  assert.deepEqual(s.fleets.amber.find((x) => x.name === 'Battleship')!.cells, [20, 30, 40, 50]);
  s = ok(seaBattle.act(s, 'amber', { type: 'ready' }, 0, ctx));
  assert.ok('error' in seaBattle.act(s, 'amber', { type: 'place', ships: own }, 0, ctx), 'no moving ships once ready');
});

test('cellsFor only returns squares on the board', () => {
  assert.deepEqual(cellsFor(23, 4, false), [23, 24, 25, 26], 'across');
  assert.deepEqual(cellsFor(23, 4, true), [23, 33, 43, 53], 'down');
  assert.equal(cellsFor(-11, 2, false), null, 'negative row and column, across');
  assert.equal(cellsFor(-1, 2, false), null, 'negative column, across');
  assert.equal(cellsFor(-10, 2, true), null, 'negative row, down');
  assert.equal(cellsFor(-11, 2, true), null, 'negative row and column, down');
  assert.equal(cellsFor(99, 2, false), null, 'past the right edge');
  assert.equal(cellsFor(99, 2, true), null, 'past the bottom edge');
  assert.equal(cellsFor(100, 2, false), null, 'past the board');
  assert.equal(cellsFor(0.5, 2, false), null, 'not a square');
});

test('ships starting off the board are rejected by checkFleet and place', () => {
  const valid = [
    { name: 'Carrier', cells: cellsFor(0, 5, false)! },
    { name: 'Battleship', cells: cellsFor(20, 4, true)! },
    { name: 'Cruiser', cells: cellsFor(22, 3, false)! },
    { name: 'Submarine', cells: cellsFor(55, 3, true)! },
    { name: 'Destroyer', cells: cellsFor(98, 2, false)! },
  ];
  assert.equal(checkFleet(valid), null, 'a full fleet across and down');
  let placed = seaBattle.create({}, 0, ctx);
  placed = ok(seaBattle.act(placed, 'amber', { type: 'place', ships: valid }, 0, ctx));
  assert.deepEqual(placed.fleets.amber.map((s) => s.name), valid.map((s) => s.name));

  const offBoard = [
    [-11, -10], // the repro: starts before the board, across
    [-1, 0],    // starts in column -1, across
    [-10, 0],   // starts in row -1, down
    [-21, -11], // starts before the board, down
    [100, 101], // starts past the board, across
  ];
  for (const cells of offBoard) {
    const ships = [...valid.slice(0, 4), { name: 'Destroyer', cells }];
    assert.match(checkFleet(ships)!, /on the board/, `checkFleet ${cells}`);
    const s = seaBattle.create({}, 0, ctx);
    const fleet = s.fleets.amber;
    const result = seaBattle.act(s, 'amber', { type: 'place', ships }, 0, ctx);
    assert.ok('error' in result && /on the board/.test(result.error), `place ${cells}`);
    assert.equal(s.fleets.amber, fleet, 'the fleet is left untouched');
  }
});
