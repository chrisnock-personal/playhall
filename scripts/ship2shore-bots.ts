// Ship2Shore played by bots only (#18): how often each faction wins when
// every seat steers for its own side, inspects, votes and feeds suspects to
// the sharks as the bot does. A rougher, more realistic check of the chart
// balance than random play (scripts/ship2shore-chart.ts).
//   npx tsx scripts/ship2shore-bots.ts [games per table size]
import { ship2shore, SEATS, type ShipState } from '../src/shared/games/ship2shore';
import { BOTS } from '../src/shared/bots';

const N = Number(process.argv[2] ?? 400);
let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (const players of [5, 6, 7, 8, 9, 10, 11]) {
  const seats = SEATS.slice(0, players);
  const ctx = { seats, random };
  const wins: Record<string, number> = { navy: 0, spy: 0, bm: 0, sharks: 0, none: 0 };
  let rounds = 0;
  for (let g = 0; g < N; g++) {
    let s = ship2shore.create({}, 0, ctx) as ShipState;
    for (let i = 0; i < 5000 && !s.result; i++) {
      const seat = ship2shore.turn!(s)[0];
      const action = BOTS.ship2shore(ship2shore.view(s, 0, seat), random);
      const r = ship2shore.act(s, seat, action, 0, ctx);
      s = 'error' in r ? ship2shore.timeout!(s, seat, 0, ctx) : (r.state as ShipState);
    }
    rounds += s.round;
    const end = [...s.log].reverse().find((e) => e.k === 'end');
    const f = end && end.k === 'end' ? end.faction : null;
    if (!f) wins.none++;
    else if (f === 'bm' && /never found/.test(s.result!.reason)) wins.sharks++;
    else wins[f]++;
  }
  const pct = (k: string) => `${Math.round((wins[k] / N) * 100)}%`;
  console.log(`${players} players: spies ${pct('spy')} · Navy ${pct('navy')} · Black Market ${pct('bm')} at Lisbon + ${pct('sharks')} by the sharks · nobody ${pct('none')} · ${(rounds / N).toFixed(1)} rounds`);
}
