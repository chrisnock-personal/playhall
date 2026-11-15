// Letterworks tile-set check: draws random racks from the bag and reports how
// playable they are, against the ENABLE word list. Run: npx tsx scripts/letterworks-tiles.ts
import { readFileSync } from 'node:fs';
import { COUNTS, newBag } from '../src/shared/games/letterworks';

// Try a variant: TILES='{"D":4,"O":7}' npx tsx scripts/letterworks-tiles.ts
if (process.env.TILES) Object.assign(COUNTS, JSON.parse(process.env.TILES));
const words = readFileSync('data/enable1.txt', 'utf8').split('\n').map((w) => w.trim().toUpperCase()).filter(Boolean);
const sig = (w: string) => [...w].sort().join('');
const byLen = new Map<number, Set<string>>();
for (const w of words) if (w.length <= 7) { if (!byLen.has(w.length)) byLen.set(w.length, new Set()); byLen.get(w.length)!.add(sig(w)); }

// How often each letter appears across the word list vs its share of our tiles.
const freq: Record<string, number> = {};
let total = 0;
for (const w of words) for (const ch of w) { freq[ch] = (freq[ch] ?? 0) + 1; total++; }
const tiles = Object.entries(COUNTS).filter(([l]) => l !== '?').reduce((n, [, c]) => n + c, 0);
console.log('letter  in words  in tiles  tiles if matched');
for (const l of Object.keys(freq).sort((a, b) => freq[b] - freq[a])) {
  console.log(`${l}       ${(100 * freq[l] / total).toFixed(1).padStart(5)}%   ${(100 * COUNTS[l] / tiles).toFixed(1).padStart(5)}%   ${(tiles * freq[l] / total).toFixed(1).padStart(5)} (have ${COUNTS[l]})`);
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const longest = (rack: string[]): number => {
  let best = 0;
  const n = rack.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const pick = rack.filter((_, i) => mask & (1 << i));
    if (pick.length <= best || pick.length < 2) continue;
    const blanks = pick.filter((l) => l === '?').length;
    const rest = pick.filter((l) => l !== '?');
    const set = byLen.get(pick.length);
    if (!set) continue;
    const ok = blanks === 0 ? set.has(sig(rest.join('')))
      : [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].some((x) => blanks === 1 ? set.has(sig(rest.join('') + x)) : [...'AEIOURSTLN'].some((y) => set.has(sig(rest.join('') + x + y))));
    if (ok) best = pick.length;
  }
  return best;
};

const N = Number(process.argv[2] ?? 50000);
const dist = Array(8).fill(0);
let vowels = 0, noVowel = 0, sixPlus = 0;
for (let i = 0; i < N; i++) {
  const rack = newBag(Math.random).slice(0, 7);
  const v = rack.filter((l) => VOWELS.has(l)).length;
  vowels += v; if (v === 0) noVowel++; if (v >= 6) sixPlus++;
  dist[longest(rack)]++;
}
const pct = (x: number) => `${(100 * x / N).toFixed(1)}%`;
console.log(`\n${N} random opening racks`);
console.log(`vowels per rack ${(vowels / N).toFixed(2)}; no vowel ${pct(noVowel)}; six or seven vowels ${pct(sixPlus)}`);
console.log(`longest word in the rack: none ${pct(dist[0] + dist[1])}, 2 ${pct(dist[2])}, 3 ${pct(dist[3])}, 4 ${pct(dist[4])}, 5 ${pct(dist[5])}, 6 ${pct(dist[6])}, all 7 ${pct(dist[7])}`);
