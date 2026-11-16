// Replays of the games with dice, shuffles and hidden hands: played at
// random to the end, each game's replay must arrive at the same table a
// watcher saw, never show what a watcher couldn't, and survive a save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameModule, SeatId } from '../game';
import { snakes } from './snakes';
import { ludo } from './ludo';
import { blackjack } from './blackjack';
import { colourClash, type ClashView } from './colourclash';
import { poker, type PokerView } from './poker';
import { seaBattle, type SeaView } from './seabattle';
import type { BlackjackView } from './blackjack';

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

/** Play a game at random to the end: the listed actions, tried in a random
 *  order, or the move timer running out now and then. */
function playOut<S>(game: GameModule<S, any>, config: unknown, seats: SeatId[], actions: (s: S, seat: SeatId) => unknown[], seed = 7) {
  const random = seeded(seed);
  const ctx = { seats, random };
  let s = game.create(config, 0, ctx);
  for (let i = 0; i < 5000 && !game.result(s); i++) {
    const seat = game.turn!(s)[0];
    assert.ok(seat, 'someone has a move');
    if (random() < 0.1) { s = game.timeout!(s, seat, 0, ctx); continue; }
    const options = actions(s, seat).sort(() => random() - 0.5);
    let done = false;
    for (const a of options) {
      const r = game.act(s, seat, a, 0, ctx);
      if (!('error' in r)) { s = r.state; done = true; break; }
    }
    if (!done) s = game.timeout!(s, seat, 0, ctx);
  }
  assert.ok(game.result(s), 'the game ended');
  // As stored: through JSON.
  return JSON.parse(JSON.stringify(s)) as S;
}

function checkReplay<S extends { history?: { steps: unknown[] } }>(game: GameModule<S, any>, final: S) {
  assert.ok(game.keepsHistory);
  const frames = game.replay!(final);
  assert.equal(frames.length, final.history!.steps.length + 1, 'a frame for the start and after every step');
  assert.deepEqual(frames.at(-1), JSON.parse(JSON.stringify(game.view(final, 0, null))), 'the replay ends where the game did');
  assert.deepEqual(game.replay!({ ...final, history: undefined }), [], 'no history (an older save): no replay');
  return frames;
}

test('Snakes and Ladders replays roll by roll', () => {
  const final = playOut(snakes, {}, ['amber', 'teal', 'violet'], () => [{ type: 'roll' }]);
  const frames = checkReplay(snakes, final);
  assert.deepEqual((frames[0] as { pos: Record<string, number> }).pos, { amber: 0, teal: 0, violet: 0 });
});

test('Ludo replays every roll and move', () => {
  const final = playOut(ludo, {}, ['amber', 'teal'], () => [{ type: 'roll' }, ...[0, 1, 2, 3].map((token) => ({ type: 'move', token }))], 11);
  checkReplay(ludo, final);
});

test('Blackjack replays the deals; the dealer’s hole card stays hidden until the dealer plays', () => {
  const final = playOut(blackjack, { hands: 5 }, ['amber', 'teal'], () => [
    { type: 'bet', amount: 50 }, { type: 'hit' }, { type: 'stand' }, { type: 'double' },
  ]);
  const frames = checkReplay(blackjack, final) as BlackjackView[];
  assert.ok(frames.some((f) => f.phase === 'playing' && f.dealer.includes(null)), 'the hole card is face down mid-hand');
});

test('Colour Clash replays without showing anyone’s hand', () => {
  const final = playOut(colourClash, {}, ['amber', 'teal', 'violet'], (s, seat) => [
    ...s.hands[seat].map((c) => ({ type: 'play', card: c.id, colour: 'teal' })), { type: 'draw' }, { type: 'pass' },
  ], 5);
  const frames = checkReplay(colourClash, final) as ClashView[];
  assert.ok(frames.every((f) => f.hand === null));
});

test('Hold’em replays every hand; hole cards only where the game showed them', () => {
  const final = playOut(poker, { startChips: 1000, blindEvery: 3 }, ['amber', 'teal', 'violet'], (s) => [
    { type: 'call' }, { type: 'check' }, { type: 'raise', to: s.currentBet + s.minRaise }, { type: 'allin' }, { type: 'fold' },
  ], 9);
  const frames = checkReplay(poker, final) as PokerView[];
  assert.ok(frames.every((f) => f.hole === null), 'no one’s own hole cards');
  assert.ok(frames.some((f) => f.hand > 1), 'more than one hand');
});

test('a resignation and a stopped game end the replay on the real result', () => {
  const ctx = { seats: ['amber', 'teal'], random: seeded(3) };
  let s = snakes.create({}, 0, ctx);
  for (let i = 0; i < 4; i++) { const r = snakes.act(s, snakes.turn!(s)[0], { type: 'roll' }, 0, ctx); if (!('error' in r)) s = r.state; }
  const r = snakes.act(s, 'teal', { type: 'resign' }, 0, ctx);
  assert.ok(!('error' in r));
  const frames = snakes.replay!(r.state);
  assert.equal(frames.length, 6);
  assert.deepEqual((frames.at(-1) as { result: unknown }).result, { winner: 'amber', reason: 'everyone else resigning' });
  // The room ending a game itself (a move timer in a two-player game) leaves the state's result empty.
  const stopped = { ...s, result: { winner: 'amber', reason: 'teal running out of move time' } };
  assert.deepEqual((snakes.replay!(stopped).at(-1) as { result: unknown }).result, stopped.result);
});

test('Sea Battle replays shot by shot with both fleets showing', () => {
  const ctx = { seats: ['amber', 'teal'], random: seeded(13) };
  let s = seaBattle.create({}, 0, ctx);
  for (const seat of ['amber', 'teal']) { const r = seaBattle.act(s, seat, { type: 'ready' }, 0, ctx); if (!('error' in r)) s = r.state; }
  for (let i = 0; i < 300 && !s.result; i++) s = seaBattle.timeout!(s, s.turn, 0, ctx);
  assert.ok(s.result);
  const frames = seaBattle.replay!(s) as SeaView[];
  const shots = s.shots.amber.length + s.shots.teal.length;
  assert.equal(frames.length, shots + 1);
  assert.deepEqual(frames[0].shots, { amber: [], teal: [] });
  assert.deepEqual(frames[1].shots, { amber: [s.shots.amber[0]], teal: [] });
  assert.deepEqual(frames[2].shots, { amber: [s.shots.amber[0]], teal: [s.shots.teal[0]] });
  assert.ok(frames.every((f) => f.fleets.amber && f.fleets.teal));
  assert.deepEqual(frames.at(-1), seaBattle.view(s, 0, null));
  assert.equal(frames[1].result, null);
});
