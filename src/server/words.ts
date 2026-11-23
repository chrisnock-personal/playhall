// The word list for word games: ENABLE (Enhanced North American Benchmark
// Lexicon), public domain, about 173,000 words. Loaded on first use.

import { readFileSync } from 'node:fs';
import path from 'node:path';

let words: Set<string> | null = null;

function load(): Set<string> {
  const file = process.env.WORD_LIST ?? path.resolve(process.cwd(), 'data/enable1.txt');
  try {
    return new Set(readFileSync(file, 'utf8').split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter(Boolean));
  } catch (e) {
    console.error(`word list not readable at ${file}: every word will be refused`, e);
    return new Set();
  }
}

export function isWord(word: string): boolean {
  words ??= load();
  return words.has(word.toUpperCase());
}

let prefixes: Set<string> | null = null;

/** Could more letters make this a word? (For the Letterworks computer player; built on first use.) */
export function isPrefix(start: string): boolean {
  if (!prefixes) {
    words ??= load();
    prefixes = new Set();
    for (const w of words) for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  return prefixes.has(start.toUpperCase());
}
