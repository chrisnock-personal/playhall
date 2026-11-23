// Tournaments (#17): the pairing and standings, kept free of the server so
// they can be tested on their own. Two-player games only for now.
//   Knockout: seeded bracket with byes for the top seeds; a drawn game is
//     replayed until someone wins.
//   Round robin: everyone plays everyone once (the circle method).
//   Swiss: a set number of rounds; each round pairs players on the same
//     score who haven't met; an odd player out gets a bye (a point).

export type Format = 'knockout' | 'roundrobin' | 'swiss';
export const FORMATS: Record<Format, string> = { knockout: 'Knockout', roundrobin: 'Round robin', swiss: 'Swiss' };

export interface TPlayer { id: string; name: string }
export interface Match {
  a: string;
  /** null: a bye for a. */
  b: string | null;
  room: string | null;
  result: 'a' | 'b' | 'draw' | null;
  /** How it was decided: by playing, a bye, a forfeit, or the organiser. */
  how: 'game' | 'bye' | 'forfeit' | 'organiser' | null;
}
export type Round = Match[];

/** Positions in a seeded bracket of `size` (a power of two): 1 v 8, 4 v 5, 2 v 7, 3 v 6 for eight. */
export function bracketOrder(size: number): number[] {
  let order = [0];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n - 1 - s]);
  }
  return order;
}

export const roundsFor = (format: Format, players: number, swissRounds: number): number =>
  format === 'knockout' ? Math.ceil(Math.log2(Math.max(2, players)))
    : format === 'roundrobin' ? (players % 2 ? players : players - 1)
      : swissRounds;

export const suggestedSwissRounds = (players: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, players))));

const bye = (a: string): Match => ({ a, b: null, room: null, result: 'a', how: 'bye' });
const match = (a: string, b: string): Match => ({ a, b, room: null, result: null, how: null });
export const winnerOf = (m: Match): string | null => (m.result === 'a' ? m.a : m.result === 'b' ? m.b : null);

/** The pairings for round `index` (from 0), given the players in seed order and the rounds so far. */
export function pairRound(format: Format, seeds: string[], rounds: Round[]): Round {
  const index = rounds.length;
  if (format === 'knockout') {
    if (index === 0) {
      const size = 2 ** Math.ceil(Math.log2(Math.max(2, seeds.length)));
      const order = bracketOrder(size);
      const out: Round = [];
      for (let k = 0; k < size; k += 2) {
        const a = seeds[order[k]], b = seeds[order[k + 1]];
        out.push(a && b ? match(a, b) : bye(a ?? b));
      }
      return out;
    }
    const winners = rounds[index - 1].map(winnerOf) as string[];
    const out: Round = [];
    for (let k = 0; k < winners.length; k += 2) out.push(winners[k + 1] ? match(winners[k], winners[k + 1]) : bye(winners[k]));
    return out;
  }
  if (format === 'roundrobin') {
    // The circle method: fix the first player, turn the rest one place each round.
    const list: (string | null)[] = seeds.length % 2 ? [...seeds, null] : [...seeds];
    const n = list.length;
    const rest = list.slice(1);
    const turned = [list[0], ...rest.slice(rest.length - (index % rest.length)), ...rest.slice(0, rest.length - (index % rest.length))];
    const out: Round = [];
    for (let k = 0; k < n / 2; k++) {
      const a = turned[k], b = turned[n - 1 - k];
      if (a && b) out.push(k % 2 && index % 2 ? match(b, a) : match(a, b));
      else if (a || b) out.push(bye((a ?? b)!));
    }
    return out;
  }
  // Swiss: by score, then seed; pair down avoiding rematches; the lowest without a bye sits out.
  const pts = points(rounds);
  const met = new Set(rounds.flat().filter((m) => m.b).map((m) => [m.a, m.b].sort().join('|')));
  const hadBye = new Set(rounds.flat().filter((m) => !m.b).map((m) => m.a));
  const ranked = [...seeds].sort((x, y) => (pts[y] ?? 0) - (pts[x] ?? 0) || seeds.indexOf(x) - seeds.indexOf(y));
  const out: Round = [];
  let pool = [...ranked];
  if (pool.length % 2) {
    const sitter = [...pool].reverse().find((p) => !hadBye.has(p)) ?? pool[pool.length - 1];
    pool = pool.filter((p) => p !== sitter);
    out.push(bye(sitter));
  }
  const pairs: Match[] = [];
  while (pool.length) {
    const a = pool.shift()!;
    const k = pool.findIndex((b) => !met.has([a, b].sort().join('|')));
    const b = pool.splice(k >= 0 ? k : 0, 1)[0];
    pairs.push(match(a, b));
  }
  return [...pairs, ...out];
}

/** Points so far: a win or a bye 1, a draw ½. */
export function points(rounds: Round[]): Record<string, number> {
  const p: Record<string, number> = {};
  const add = (id: string | null, n: number) => { if (id) p[id] = (p[id] ?? 0) + n; };
  for (const m of rounds.flat()) {
    add(m.a, 0); add(m.b, 0);
    if (m.result === 'draw') { add(m.a, 0.5); add(m.b, 0.5); } else add(winnerOf(m), 1);
  }
  return p;
}

export interface Standing { id: string; name: string; points: number; tiebreak: number; played: number; out: boolean }

/** The table: points, then a tie-break (Buchholz for Swiss: opponents' points;
 *  Sonneborn-Berger for round robin: points of the players you beat, half for draws). */
export function standings(format: Format, players: TPlayer[], rounds: Round[]): Standing[] {
  const pts = points(rounds);
  const rows = players.map((pl) => {
    let tiebreak = 0, played = 0;
    for (const m of rounds.flat()) {
      if (!m.b || (m.a !== pl.id && m.b !== pl.id) || !m.result) continue;
      const opp = m.a === pl.id ? m.b : m.a;
      played++;
      if (format === 'swiss') tiebreak += pts[opp] ?? 0;
      else if (m.result === 'draw') tiebreak += (pts[opp] ?? 0) / 2;
      else if (winnerOf(m) === pl.id) tiebreak += pts[opp] ?? 0;
    }
    // Knockout: out once you lose a match.
    const out = format === 'knockout' && rounds.flat().some((m) => m.result && m.result !== 'draw' && m.b && (m.a === pl.id || m.b === pl.id) && winnerOf(m) !== pl.id);
    return { id: pl.id, name: pl.name, points: pts[pl.id] ?? 0, tiebreak, played, out };
  });
  if (format === 'knockout') {
    // Still in first, then by how far they got.
    const reached = (id: string) => rounds.reduce((last, r, i) => (r.some((m) => m.a === id || m.b === id) ? i : last), -1);
    return rows.sort((x, y) => Number(x.out) - Number(y.out) || reached(y.id) - reached(x.id) || y.points - x.points);
  }
  return rows.sort((x, y) => y.points - x.points || y.tiebreak - x.tiebreak);
}


/** Is the tournament over after these rounds? Knockout: one player left; others: all rounds played. */
export function finished(format: Format, seeds: string[], rounds: Round[], swissRounds: number): boolean {
  if (!rounds.length || !rounds[rounds.length - 1].every((m) => m.result)) return false;
  if (format === 'knockout') return rounds[rounds.length - 1].length === 1;
  return rounds.length >= roundsFor(format, seeds.length, swissRounds);
}

// ---- what the client sees ----

export interface TournamentConfig {
  format: Format;
  /** Swiss only. */
  rounds: number;
  gameConfig: unknown;
  /** The move timer for every game (seconds, 0 = none). */
  moveSeconds: number;
  /** Minutes a player has to turn up for a game before losing by forfeit. */
  graceMinutes: number;
  /** Anyone signed in can enter; otherwise only with the link. */
  open: boolean;
}

export interface TournamentView {
  code: string;
  name: string;
  gameId: string;
  gameName: string;
  organiser: TPlayer;
  config: TournamentConfig;
  status: 'signup' | 'running' | 'done';
  players: TPlayer[];
  rounds: (Match & { deadline: number | null })[][];
  standings: Standing[];
  winner: TPlayer | null;
  createdAt: string;
}

export interface TournamentSummary {
  code: string; name: string; gameName: string; format: Format; status: TournamentView['status'];
  players: number; organiser: string; open: boolean; entered: boolean;
  /** Your game that's ready now, if any. */
  myRoom: string | null;
}
