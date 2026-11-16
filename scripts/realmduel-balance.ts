// Realm Duel balance check: plays many games between random-but-sensible
// players (a random standing creature, attacking with its best style) and
// reports how often a hand holding each creature wins.
//   npx tsx scripts/realmduel-balance.ts [games]
//   STATS='{"stonehorn":{"hp":34}}' npx tsx scripts/realmduel-balance.ts   (try a change)
import { realmDuel, CREATURES, bestStyle, type RealmState } from '../src/shared/games/realmduel';

if (process.env.STATS) for (const [k, v] of Object.entries(JSON.parse(process.env.STATS))) Object.assign((CREATURES as Record<string, object>)[k], v);
const N = Number(process.argv[2] ?? 20000);
const ctx = { seats: ['amber', 'teal'], random: Math.random };
const held: Record<string, { games: number; wins: number }> = {};
let draws = 0, rounds = 0;
for (let g = 0; g < N; g++) {
  let s = realmDuel.create({ hand: 3 }, 0, ctx) as RealmState;
  const hands = { amber: s.hands.amber.map((f) => f.kind), teal: s.hands.teal.map((f) => f.kind) };
  while (!s.result) {
    for (const seat of ['amber', 'teal'] as const) {
      if (s.result || s.choices[seat]) continue;
      const up = s.hands[seat].map((f, i) => [f, i] as const).filter(([f]) => f.hp > 0);
      const [f, i] = up[Math.floor(Math.random() * up.length)];
      const r = realmDuel.act(s, seat, { type: 'choose', creature: i, style: bestStyle(CREATURES[f.kind]) }, 0, ctx);
      if ('error' in r) throw new Error(r.error);
      s = r.state as RealmState;
    }
  }
  rounds += s.rounds.length;
  if (!s.result.winner) draws++;
  for (const seat of ['amber', 'teal'] as const) for (const k of new Set(hands[seat])) {
    held[k] ??= { games: 0, wins: 0 };
    held[k].games++; if (s.result.winner === seat) held[k].wins++;
  }
}
console.log(`${N} games, ${(rounds / N).toFixed(1)} rounds on average, ${(100 * draws / N).toFixed(1)}% drawn`);
for (const [k, v] of Object.entries(held).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)) {
  console.log(`${CREATURES[k as keyof typeof CREATURES].name.padEnd(11)} in the hand: wins ${(100 * v.wins / v.games).toFixed(1)}%`);
}
