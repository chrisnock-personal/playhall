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
