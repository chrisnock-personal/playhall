// Every game with a bot (#18), played by bots in every seat: the bots' moves
// are always accepted, they never leave a game stuck, and every game ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS } from './bots';
import { GAMES } from './games';

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

for (const id of Object.keys(BOTS)) {
  test(`${id}: bots in every seat play whole games, every move accepted`, () => {
    const game = GAMES[id];
    const sizes = [...new Set([game.minPlayers ?? game.seats.length, game.seats.length])];
    for (const n of sizes) {
      for (let g = 0; g < 3; g++) {
        const random = seeded(17 + g * 31 + n);
        const ctx = { seats: game.seats.slice(0, n).map((s) => s.id), random };
        let s = game.create(game.defaultConfig, 0, ctx);
        let moves = 0;
        for (; moves < 20000 && !game.result(s); moves++) {
          const waiting = (game.waitingFor ?? game.turn)!.call(game, s);
          // Games on a clock (Bingo's calls) move on by themselves.
          const due = game.nextDeadline(s);
          if (!waiting.length && due !== null) { s = game.tick(s, due) ?? s; continue; }
          assert.ok(waiting.length, `${id}: nobody to move`);
          const seat = waiting[0];
          const action = BOTS[id](game.view(s, 0, seat), seat, random);
          assert.notEqual(action, null, `${id}: the bot for ${seat} had nothing to do`);
          const r = game.act(s, seat, action, 0, ctx);
          assert.ok(!('error' in r), `${id}: ${seat}'s ${JSON.stringify(action)} was refused: ${'error' in r ? r.error : ''}`);
          s = (r as { state: typeof s }).state;
        }
        assert.ok(game.result(s), `${id} with ${n} players never ended (${moves} moves)`);
      }
    }
  });
}

test('the Four in a Row bot takes a win and blocks one', () => {
  const four = GAMES.fourinarow;
  const ctx = { seats: ['amber', 'teal'], random: seeded(1) };
  let s = four.create({}, 0, ctx);
  // Amber three in a row along the bottom (cols 0-2), teal stacked on col 6.
  for (const [seat, col] of [['amber', 0], ['teal', 6], ['amber', 1], ['teal', 6], ['amber', 2]] as const) {
    s = (four.act(s, seat, { type: 'drop', col }, 0, ctx) as { state: typeof s }).state;
  }
  assert.deepEqual(BOTS.fourinarow(four.view(s, 0, 'teal'), 'teal', ctx.random), { type: 'drop', col: 3 }, 'teal blocks');
  s = (four.act(s, 'teal', { type: 'drop', col: 5 }, 0, ctx) as { state: typeof s }).state;
  assert.deepEqual(BOTS.fourinarow(four.view(s, 0, 'amber'), 'amber', ctx.random), { type: 'drop', col: 3 }, 'amber wins');
});
