import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LADDER, checkLadder, ladderProgress } from './progression';
import { GAMES } from './games';

const ids = Object.keys(GAMES);

test('the default ladder is valid and has every game', () => {
  assert.ok('ladder' in checkLadder(DEFAULT_LADDER, ids));
  assert.deepEqual(DEFAULT_LADDER.tiers.flatMap((t) => t.games).sort(), [...ids].sort());
});

test('ladder checks: known games, once each, rising wins', () => {
  assert.match((checkLadder({ tiers: [] }, ids) as { error: string }).error, /at least one/);
  assert.match((checkLadder({ tiers: [{ games: ['nope'], wins: 3 }] }, ids) as { error: string }).error, /doesn’t exist/);
  assert.match((checkLadder({ tiers: [{ games: ['chess'], wins: 3 }, { games: ['chess'], wins: 5 }] }, ids) as { error: string }).error, /only one tier/);
  assert.match((checkLadder({ tiers: [{ games: ['chess'], wins: 5 }, { games: ['ludo'], wins: 5 }] }, ids) as { error: string }).error, /more wins/);
  assert.match((checkLadder({ tiers: [{ games: [], wins: 5 }] }, ids) as { error: string }).error, /first tier/);
});

test('wins in open games open the next tier; wins in locked games don’t count', () => {
  const ladder = { tiers: [{ games: ['ludo', 'snakes'], wins: 3 }, { games: ['checkers'], wins: 5 }, { games: ['chess'], wins: 9 }] };
  assert.deepEqual(ladderProgress(ladder, {}), { open: 1, allowed: ['ludo', 'snakes'], wins: 0, next: 3 });
  assert.equal(ladderProgress(ladder, { ludo: 2, chess: 10 }).open, 1, 'chess wins from before don’t count');
  const two = ladderProgress(ladder, { ludo: 2, snakes: 1 });
  assert.equal(two.open, 2);
  assert.deepEqual(two.allowed, ['ludo', 'snakes', 'checkers']);
  assert.equal(two.next, 5);
  const top = ladderProgress(ladder, { ludo: 3, checkers: 2, chess: 1 });
  assert.equal(top.open, 3);
  assert.equal(top.next, null);
});
