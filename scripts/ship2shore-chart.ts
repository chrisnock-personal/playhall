// Ship2Shore chart balance: how often each port wins when the order the ship
// sails each round is a random one of the four drawn (random play), and a
// search for heading twists that bring a chart nearer a target.
//   npx tsx scripts/ship2shore-chart.ts                 the charts as they are
//   npx tsx scripts/ship2shore-chart.ts tune short 40,40,20 [seed]
//                                                        twists for spy,navy,bm %
// Random play is only a baseline: real tables steer, vote and feed people to
// the sharks, and the Fixer overboard is a Black Market win (not counted here).
import { CHARTS, FULL_DECK, HEX, buildChart, posKey, type Chart, type Faction, type HexDir } from '../src/shared/games/ship2shore';

const FACTIONS: Faction[] = ['spy', 'navy', 'bm'];
const share = Object.fromEntries(FACTIONS.map((f) => [f, FULL_DECK.filter((o) => o.startsWith(`${f}.`)).length / FULL_DECK.length])) as Record<Faction, number>;

/** Exact odds of each port, each order's heading drawn in proportion to the deck. */
export function odds(chart: Chart): Record<Faction, number> {
  const memo = new Map<string, Record<Faction, number>>();
  const at = (k: string): Record<Faction, number> => {
    const hit = memo.get(k); if (hit) return hit;
    const a = chart.areas[k];
    const out = { spy: 0, navy: 0, bm: 0 };
    if (a.port) out[a.port] = 1;
    else for (const f of FACTIONS) { const n = at(posKey({ q: a.q + HEX[a.to![f]].q, r: a.r + HEX[a.to![f]].r })); for (const g of FACTIONS) out[g] += share[f] * n[g]; }
    memo.set(k, out);
    return out;
  };
  return at('0,0');
}

/** Random play with the real deck: four orders off the top each round, one
 *  sailed, the rest discarded; the discards come back when it runs low. */
function played(chart: Chart, games: number) {
  const wins = { spy: 0, navy: 0, bm: 0 }; let orders = 0;
  const shuffle = <T,>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  for (let g = 0; g < games; g++) {
    let deck = shuffle([...FULL_DECK]), used: string[] = [], k = '0,0';
    while (!chart.areas[k].port) {
      if (deck.length < 4) { deck = [...deck, ...shuffle(used as typeof deck)]; used = []; }
      const hand = deck.splice(0, 4); used.push(...hand);
      const f = hand[Math.floor(Math.random() * 4)].split('.')[0] as Faction;
      const a = chart.areas[k], d = HEX[a.to![f]];
      k = posKey({ q: a.q + d.q, r: a.r + d.r }); orders++;
    }
    wins[chart.areas[k].port!]++;
  }
  return { wins, orders: orders / games };
}

const pct = (r: Record<Faction, number>, n = 1) => FACTIONS.map((f) => `${f} ${Math.round((r[f] / n) * 100)}%`).join(' · ');

const [cmd, which, target, seedArg] = process.argv.slice(2);
if (cmd !== 'tune') {
  for (const c of Object.values(CHARTS)) {
    const p = played(c, 100000);
    console.log(`${c.name}: exact ${pct(odds(c))}; played ${pct(p.wins, 100000)}; ${p.orders.toFixed(1)} orders a voyage`);
  }
} else {
  // Hill-climb: add, change or drop one twist at a time while it brings the
  // odds nearer the target; twists spread over the chart, at most MAX.
  const base = CHARTS[which as 'short' | 'long'];
  const goal = target.split(',').map((x) => Number(x) / 100);
  let seed = Number(seedArg ?? 1);
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
  const MAX = Number(process.env.MAX ?? 10);
  const spec = (twists: string[]) => ({ id: base.id, name: base.name, length: base.length, width: base.width, resupplyRow: base.resupplyRow, ports: (process.env.PORTS ?? '-2,2').split(',').map(Number) as [number, number], twists, actions: [] });
  const score = (twists: string[]) => {
    try { const o = odds(buildChart(spec(twists))); return FACTIONS.reduce((e, f, i) => e + (o[f] - goal[i]) ** 2, 0) + twists.length * 1e-5; } catch { return Infinity; }
  };
  const seas = Object.values(buildChart(spec([])).areas).filter((a) => !a.port);
  let best: string[] = [], bestScore = score(best);
  for (let i = 0; i < 20000; i++) {
    const t = [...best];
    const r = rnd();
    if (r < 0.15 && t.length) t.splice(Math.floor(rnd() * t.length), 1);
    else {
      const a = seas[Math.floor(rnd() * seas.length)], f = FACTIONS[Math.floor(rnd() * 3)];
      const d = (['n', 'ne', 'se', 's', 'sw', 'nw'] as HexDir[])[Math.floor(rnd() * 6)];
      const tw = `${a.q},${a.r} ${f}:${d}`;
      const same = t.findIndex((x) => x.startsWith(`${a.q},${a.r} ${f}:`));
      if (same >= 0) t[same] = tw; else if (t.length < MAX) t.push(tw); else continue;
    }
    const s = score(t);
    if (s < bestScore) { best = t; bestScore = s; }
  }
  const c = buildChart(spec(best));
  const p = played(c, 100000);
  console.log(`${best.length} twists: exact ${pct(odds(c))}; played ${pct(p.wins, 100000)}; ${p.orders.toFixed(1)} orders`);
  console.log(JSON.stringify(best.sort((x, y) => x.localeCompare(y, 'en', { numeric: true }))));
}
