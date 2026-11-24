// A Letterworks computer player (#18). It searches every row and column for
// places its rack can make words (letter by letter, keeping only beginnings
// of real words, and checking the words made across), scores each with the
// game's own scoring, and plays well but not perfectly: it picks from its
// better moves rather than always the very best, keeps an S or a blank for
// a bigger move, and swaps tiles when it can't find a word.

import type { SeatId } from '../game';
import type { BotLevel, BotWords } from '../bots';
import { CENTRE, RACK, SIZE, scorePlacement, type LetterworksView, type Placement, type Tile } from './letterworks';

interface Found { tiles: Placement[]; score: number }

/** Every playable move for this rack (a few thousand at most). */
export function findMoves(board: (Tile | null)[], rack: string[], words: BotWords): Found[] {
  const out: Found[] = [];
  const first = board.every((t) => !t);
  const letter = (cell: number) => board[cell]?.letter ?? null;
  const seen = new Set<string>();

  for (const across of [true, false]) {
    const cellAt = (line: number, pos: number) => (across ? line * SIZE + pos : pos * SIZE + line);
    /** The word made across the line (perpendicular) by putting `ch` at `cell`, or '' when no neighbours. */
    const crossWord = (cell: number, ch: string) => {
      const r = Math.floor(cell / SIZE), c = cell % SIZE;
      const [dr, dc] = across ? [1, 0] : [0, 1];
      let sr = r, sc = c;
      while (sr - dr >= 0 && sc - dc >= 0 && letter((sr - dr) * SIZE + (sc - dc))) { sr -= dr; sc -= dc; }
      let w = '', rr = sr, cc = sc;
      while (rr < SIZE && cc < SIZE) {
        const cl = rr * SIZE + cc;
        const l = cl === cell ? ch : letter(cl);
        if (!l) break;
        w += l; rr += dr; cc += dc;
      }
      return w.length > 1 ? w : '';
    };
    for (let line = 0; line < SIZE; line++) {
      for (let start = 0; start < SIZE; start++) {
        // A word starts here only if the cell before is empty.
        if (start > 0 && letter(cellAt(line, start - 1))) continue;
        const left = [...rack];
        const placed: Placement[] = [];
        const walk = (pos: number, word: string, touches: boolean) => {
          if (word && !words.isPrefix(word)) return;
          const endHere = pos >= SIZE || !letter(cellAt(line, pos));
          if (placed.length && endHere && word.length > 1 && words.isWord(word) && (first ? placed.some((p) => p.cell === CENTRE) : touches)) {
            const key = placed.map((p) => `${p.cell}${p.letter}${p.blank ? '*' : ''}`).sort().join();
            if (!seen.has(key)) {
              seen.add(key);
              const s = scorePlacement(board, placed);
              if (typeof s !== 'string') out.push({ tiles: [...placed], score: s.score });
            }
          }
          if (pos >= SIZE) return;
          const cell = cellAt(line, pos);
          const there = letter(cell);
          if (there) { walk(pos + 1, word + there, true); return; }
          if (placed.length >= RACK || !left.length) return;
          const tried = new Set<string>();
          for (let i = 0; i < left.length; i++) {
            const tile = left[i];
            if (tried.has(tile)) continue;
            tried.add(tile);
            const options = tile === '?' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') : [tile];
            for (const ch of options) {
              const cross = crossWord(cell, ch);
              if (cross && !words.isWord(cross)) continue;
              left.splice(i, 1);
              placed.push({ cell, letter: ch, ...(tile === '?' ? { blank: true } : {}) });
              walk(pos + 1, word + ch, touches || !!cross || neighbours(cell));
              placed.pop();
              left.splice(i, 0, tile);
            }
          }
        };
        const neighbours = (cell: number) => {
          const r = Math.floor(cell / SIZE), c = cell % SIZE;
          return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([a, b]) => a >= 0 && b >= 0 && a < SIZE && b < SIZE && !!letter(a * SIZE + b));
        };
        walk(start, '', false);
      }
    }
  }
  return out;
}

/** Choose a move: good but not always the best, and not wasting an S or a blank on a small score. */
export function chooseMove(found: Found[], rack: string[], random: () => number, level: BotLevel = 'fair'): Found | null {
  if (!found.length) return null;
  if (level === 'strong') return [...found].sort((a, b) => b.score - a.score)[0];
  if (level === 'gentle') {
    // Gentle: short, everyday words from the middle of the list.
    const short = found.filter((f) => f.tiles.length <= 4).sort((a, b) => b.score - a.score);
    const pool = (short.length ? short : found).slice(Math.floor((short.length || found.length) * 0.3), Math.max(1, Math.floor((short.length || found.length) * 0.7)));
    return pool.length ? pool[Math.floor(random() * pool.length)] : found[0];
  }
  const value = (f: Found) => {
    const spent = f.tiles.filter((t) => t.blank).length * 25 + f.tiles.filter((t) => t.letter === 'S' && !t.blank).length * 8;
    return f.score - (rack.length - f.tiles.length < 7 ? spent : 0);
  };
  const ranked = [...found].sort((a, b) => value(b) - value(a));
  // Pick from the top few (more often the best).
  const pool = ranked.slice(0, Math.max(1, Math.min(4, Math.ceil(ranked.length / 20))));
  return pool[Math.floor(random() ** 2 * pool.length)];
}

export function letterworksBot(view: unknown, seat: SeatId, random: () => number, words?: BotWords, level: BotLevel = 'fair'): unknown | null {
  const v = view as LetterworksView;
  if (v.result || v.turn !== seat || !v.rack) return null;
  if (!words) return { type: 'pass' };
  const move = chooseMove(findMoves(v.board, v.rack, words), v.rack, random, level);
  if (move) return { type: 'play', tiles: move.tiles };
  // No word: swap the awkward tiles while the bag can take them, else pass.
  if (v.bag >= RACK) {
    const awkward = v.rack.filter((l) => 'QZXJKVWY'.includes(l) || v.rack!.filter((x) => x === l).length > 1);
    return { type: 'exchange', letters: (awkward.length ? awkward : v.rack).slice(0, 4) };
  }
  return { type: 'pass' };
}
