import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manorMystery as g } from './manormystery';
import { manorBot } from './manormystery.bot';

function seeded(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

test('the Manor Mystery bots solve the case, and never accuse wrongly', () => {
  for (const n of [3, 5]) {
    for (let k = 1; k <= 10; k++) {
      const random = seeded(k * 131 + n);
      const ctx = { seats: ['amber', 'teal', 'violet', 'rose', 'lime'].slice(0, n), random };
      let s = g.create({}, 0, ctx);
      for (let i = 0; i < 5000 && !s.result; i++) {
        const seat = g.turn!(s)[0];
        const r = g.act(s, seat, manorBot(g.view(s, 0, seat), seat, random), 0, ctx);
        assert.ok(!('error' in r), 'error' in r ? r.error : '');
        s = (r as { state: typeof s }).state;
      }
      assert.ok(s.result?.winner, `${n} players, game ${k}: solved`);
      assert.equal(s.log.filter((e) => e.kind === 'accuse' && !e.right).length, 0);
    }
  }
});
