// AI players (#32): every option offered to the model is a legal move, and
// its answers are read strictly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_GAMES, aiPrompt, readAnswer } from './ai';
import { BOTS } from './bots';
import { GAMES } from './games';

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

for (const id of Object.keys(AI_GAMES)) {
  test(`${id}: every option the model is offered is a legal move`, () => {
    const game = GAMES[id], ai = AI_GAMES[id];
    let checked = 0;
    for (let g = 0; g < 6; g++) {
      const random = seeded(5 + g);
      const ctx = { seats: game.seats.slice(0, 5 + (g % 4)).map((s) => s.id), random };
      const names = Object.fromEntries(ctx.seats.map((s, i) => [s, `P${i}`]));
      let s = game.create(game.defaultConfig, 0, ctx);
      for (let i = 0; i < 3000 && !game.result(s); i++) {
        const seat = (game.waitingFor ?? game.turn)!.call(game, s)[0];
        const view = game.view(s, 0, seat);
        const options = ai.options(view, seat, names);
        for (const o of options) {
          const r = game.act(s, seat, o.action, 0, ctx);
          assert.ok(!('error' in r), `${o.label}: ${'error' in r ? r.error : ''}`);
          checked++;
        }
        if (options.length) {
          const { system, user } = aiPrompt(ai, view, seat, names, ['P1: hello'], options);
          assert.match(system, /JSON/);
          assert.ok(user.includes('1. ') && !user.includes('undefined'), 'the prompt reads cleanly');
        }
        const r = game.act(s, seat, BOTS[id](view, seat, random), 0, ctx);
        s = 'error' in r ? game.timeout!(s, seat, 0, ctx) : r.state;
      }
    }
    assert.ok(checked > 200, `checked ${checked} options`);
  });
}

test('the model’s answer: an option number in range, talk trimmed, anything else refused', () => {
  assert.deepEqual(readAnswer('{"thought": "x", "choice": 2, "say": " \\"Trust me.\\" "}', 3), { choice: 2, say: 'Trust me.', thought: 'x' });
  assert.deepEqual(readAnswer('{"choice": 1, "say": ""}', 3), { choice: 1 });
  assert.equal(readAnswer('{"choice": 4}', 3), null);
  assert.equal(readAnswer('{"choice": "two"}', 3), null);
  assert.equal(readAnswer('I pick 2', 3), null);
});
