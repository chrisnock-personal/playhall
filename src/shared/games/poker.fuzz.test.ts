// Random legal play: chips are never created or lost, nobody is ever left
// with no move, and every game ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poker, type PokerState } from './poker';

test('100 random games of Hold’em: chips conserved, never stuck, always end', () => {
  let seed = 3;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let g = 0; g < 100; g++) {
    const seats = ['amber', 'teal', 'violet', 'rose'].slice(0, 2 + (g % 3));
    const ctx = { seats, random };
    let s: PokerState = poker.create({ startChips: 1000, blindEvery: 3 }, 0, ctx);
    const total = 1000 * seats.length;
    for (let i = 0; i < 5000 && !s.result; i++) {
      assert.ok(s.toAct, `game ${g}: nobody to act`);
      const seat = s.toAct!;
      const owe = s.currentBet - s.bet[seat];
      const roll = random();
      const choice = roll < 0.15 ? { type: 'fold' } : roll < 0.55 ? { type: owe > 0 ? 'call' : 'check' }
        : roll < 0.85 ? { type: 'raise', to: s.currentBet + s.minRaise * (1 + Math.floor(random() * 3)) } : { type: 'allin' };
      let r = poker.act(s, seat, choice, 0, ctx);
      if ('error' in r) r = poker.act(s, seat, { type: owe > 0 ? 'call' : 'check' }, 0, ctx);
      assert.ok(!('error' in r), `game ${g}: no legal move`);
      s = (r as { state: PokerState }).state;
      if (!s.result) assert.equal(seats.reduce((n, p) => n + s.chips[p] + (s.total[p] ?? 0), 0), total, `game ${g}: chips changed`);
    }
    assert.ok(s.result, `game ${g} never ended`);
    assert.equal(seats.reduce((n, p) => n + s.chips[p], 0), total);
  }
});
