// Tournaments (#17, #59): the pairing and standings, kept free of the server so
// they can be tested on their own. Pairs keep the old 1/½/0 scoring; games of
// three or more play at tables with points by finishing place.
//   Knockout: seeded bracket with byes for the top seeds; a drawn game is
//     replayed until someone wins. (Two entries per match.)
//   Round robin: everyone plays everyone once (the circle method).
//   Swiss: a set number of rounds; each round pairs players on the same
//     score who haven't met; an odd player out gets a bye (a point). With a
//     table size of 3-6, it groups by score into tables instead, with byes
//     for the leftovers, and awards points by place.

export type Format = 'knockout' | 'roundrobin' | 'swiss';
export const FORMATS: Record<Format, string> = { knockout: 'Knockout', roundrobin: 'Round robin', swiss: 'Swiss' };

/** One entry: an account, or (Spades, #59) two accounts in a pair. */
export interface TPlayer { id: string; name: string; members?: TPlayer[] }
export const entryMembers = (p: TPlayer): TPlayer[] => p.members?.length ? p.members : [p];
export const entryName = (p: TPlayer): string => entryMembers(p).map((m) => m.name).join(' & ');
export const inEntry = (p: TPlayer, userId: string): boolean => entryMembers(p).some((m) => m.id === userId);

export interface Match {
  a: string;
  /** null: a bye for a. */
  b: string | null;
  /** #59: every entry at the table (a and b are its first two). */
  table?: string[];
  /** #59: entry ids in finishing order, tied entries grouped. */
  placings?: string[][];
  room: string | null;
  /** 'none': nobody turned up / nobody won; 'table': decided by placings. */
  result: 'a' | 'b' | 'draw' | 'none' | 'table' | null;
  /** How it was decided: by playing, a bye, a forfeit, or the organiser. */
  how: 'game' | 'bye' | 'forfeit' | 'organiser' | null;
}
export type Round = Match[];

/** The entries in a match, without the null of a bye. */
export const entrantsOf = (m: Match): string[] => m.table?.length ? [...m.table] : [m.a, m.b].filter((x): x is string => !!x);
const tableKey = (ids: string[]) => [...ids].sort().join('|');

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

const bye = (a: string, points?: number[]): Match => ({
  a, b: null, room: null, result: 'a', how: 'bye', ...(points ? { placings: [[a]] } : {}),
});
const match = (a: string, b: string): Match => ({ a, b, room: null, result: null, how: null });
export const winnerOf = (m: Match): string | null => {
  if (m.placings?.length === 1 && m.placings[0].length === 1) return m.placings[0][0];
  return m.result === 'a' ? m.a : m.result === 'b' ? m.b : null;
};

/** Points for finishing 1st, 2nd, ... at a table (#59). */
export const PLACE_POINT_OPTIONS = [
  { label: '3 · 2 · 1 · 0', points: [3, 2, 1, 0, 0, 0] },
  { label: '5 · 3 · 2 · 1', points: [5, 3, 2, 1, 0, 0] },
  { label: '1 · 0 · 0 · 0', points: [1, 0, 0, 0, 0, 0] },
];
export const DEFAULT_PLACE_POINTS = PLACE_POINT_OPTIONS[0].points;
/** Pairs still score a win as one point, unless the host picks a table scale. */
export const DEFAULT_PAIR_POINTS = [1, 0, 0, 0, 0, 0];

export interface PairOptions { tableSize?: number; placePoints?: number[] }

/** Swiss with tables (#59): group by score, avoiding tables that have met.
 *  The lowest-ranked entrant without a bye sits out when the numbers don't fit. */
function pairTables(seeds: string[], rounds: Round[], size: number, placePoints: number[]): Round {
  const pts = points(rounds, placePoints);
  const met = new Set(rounds.flat().filter((m) => m.table || m.b).map((m) => tableKey(entrantsOf(m))));
  const hadBye = new Set(rounds.flat().filter((m) => !m.b && !m.table).map((m) => m.a));
  const ranked = [...seeds].sort((x, y) => (pts[y] ?? 0) - (pts[x] ?? 0) || seeds.indexOf(x) - seeds.indexOf(y));
  const used = new Set<string>();
  const out: Round = [];
  for (let guard = 0; guard < seeds.length; guard++) {
    const remaining = ranked.filter((id) => !used.has(id));
    if (!remaining.length) break;
    if (remaining.length === 1) {
      const sitter = remaining[0];
      used.add(sitter);
      out.push(bye(sitter, placePoints));
      continue;
    }
    if (remaining.length % size === 1) {
      const sitter = [...remaining].reverse().find((id) => !hadBye.has(id)) ?? remaining[remaining.length - 1];
      used.add(sitter);
      out.push(bye(sitter, placePoints));
      continue;
    }
    const here = Math.min(size, remaining.length);
    const leader = remaining[0];
    const score = (id: string, group: string[]) =>
      (met.has(tableKey([...group, id])) ? -1000 : 0)
      + (met.has(tableKey([leader, id])) ? -100 : 0)
      - Math.abs((pts[id] ?? 0) - (pts[leader] ?? 0)) * 10
      - group.filter((g) => met.has(tableKey([g, id]))).length * 5
      - ranked.indexOf(id) / 1000;
    const group = [leader];
    while (group.length < here) {
      const next = remaining.filter((id) => !group.includes(id)).sort((x, y) => score(y, group) - score(x, group))[0];
      if (!next) break;
      group.push(next);
    }
    group.forEach((id) => used.add(id));
    out.push({ a: group[0], b: group[1] ?? null, table: group, room: null, result: null, how: null });
  }
  return out;
}

/** The pairings for round `index` (from 0), given the entries in seed order and the rounds so far. */
export function pairRound(format: Format, seeds: string[], rounds: Round[], opts: PairOptions = {}): Round {
  const index = rounds.length;
  const size = opts.tableSize ?? 2;
  if (format === 'knockout') {
    if (index === 0) {
      const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(2, seeds.length)));
      const order = bracketOrder(bracketSize);
      const out: Round = [];
      for (let k = 0; k < bracketSize; k += 2) {
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
  if (size > 2) return pairTables(seeds, rounds, size, opts.placePoints ?? DEFAULT_PLACE_POINTS);
  // Swiss pairs: by score, then seed; pair down avoiding rematches; the lowest without a bye sits out.
  const pts = points(rounds, opts.placePoints);
  const met = new Set(rounds.flat().filter((m) => m.b).map((m) => tableKey(entrantsOf(m))));
  const hadBye = new Set(rounds.flat().filter((m) => !m.b).map((m) => m.a));
  const ranked = [...seeds].sort((x, y) => (pts[y] ?? 0) - (pts[x] ?? 0) || seeds.indexOf(x) - seeds.indexOf(y));
  const out: Round = [];
  let pool = [...ranked];
  if (pool.length % 2) {
    const sitter = [...pool].reverse().find((p) => !hadBye.has(p)) ?? pool[pool.length - 1];
    pool = pool.filter((p) => p !== sitter);
    out.push(opts.placePoints ? bye(sitter, opts.placePoints) : bye(sitter));
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

/** Points so far: pairs score 1/½/0 (or the chosen scale); tables score by place. */
export function points(rounds: Round[], placePoints?: number[]): Record<string, number> {
  const scale = placePoints ?? DEFAULT_PAIR_POINTS;
  const p: Record<string, number> = {};
  const add = (id: string | null, n: number) => { if (id) p[id] = (p[id] ?? 0) + n; };
  for (const m of rounds.flat()) {
    add(m.a, 0); add(m.b, 0);
    for (const id of m.table ?? []) add(id, 0);
    if (m.placings?.length) {
      m.placings.forEach((group, i) => group.forEach((id) => add(id, scale[i] ?? 0)));
      continue;
    }
    if (!m.b && !m.table) add(m.a, scale[0]); // a bye
    else if (m.result === 'draw') { add(m.a, 0.5); add(m.b, 0.5); }
    else add(winnerOf(m), scale[0]);
  }
  return p;
}

export interface Standing { id: string; name: string; points: number; tiebreak: number; played: number; out: boolean }

/** The table: points, then a tie-break (Buchholz for Swiss: opponents' points;
 *  Sonneborn-Berger for round robin: points of the players you beat, half for draws). */
export function standings(format: Format, players: TPlayer[], rounds: Round[], placePoints?: number[]): Standing[] {
  const pts = points(rounds, placePoints);
  const rows = players.map((pl) => {
    let tiebreak = 0, played = 0;
    for (const m of rounds.flat()) {
      const members = entrantsOf(m);
      if (!m.result || !members.includes(pl.id)) continue;
      played++;
      const other = members.find((id) => id !== pl.id) ?? null;
      const place = (id: string) => m.placings?.findIndex((g) => g.includes(id)) ?? (m.result === 'draw' ? 0 : -1);
      if (format === 'swiss' && members.length > 2) {
        // At a table, Buchholz counts everyone you shared it with.
        tiebreak += members.reduce((n, id) => n + (id === pl.id ? 0 : pts[id] ?? 0), 0);
      } else if (m.placings) {
        const mine = place(pl.id);
        for (const id of members) {
          if (id === pl.id) continue;
          const theirs = place(id);
          if (mine >= 0 && theirs > mine) tiebreak += pts[id] ?? 0;
          else if (mine === theirs) tiebreak += (pts[id] ?? 0) / 2;
        }
      } else if (m.result === 'draw') tiebreak += (pts[other!] ?? 0) / 2;
      else if (winnerOf(m) === pl.id && other) tiebreak += pts[other] ?? 0;
    }
    // Knockout: out once you lose a match.
    const out = format === 'knockout' && rounds.flat().some((m) => m.result && m.result !== 'draw' && m.b && entrantsOf(m).includes(pl.id) && winnerOf(m) !== pl.id);
    return { id: pl.id, name: entryName(pl), points: pts[pl.id] ?? 0, tiebreak, played, out };
  });
  if (format === 'knockout') {
    // Still in first, then by how far they got.
    const reached = (id: string) => rounds.reduce((last, r, i) => (r.some((m) => entrantsOf(m).includes(id)) ? i : last), -1);
    return rows.sort((x, y) => Number(x.out) - Number(y.out) || reached(y.id) - reached(x.id) || y.points - x.points);
  }
  return rows.sort((x, y) => y.points - x.points || y.tiebreak - x.tiebreak);
}

/** Is the tournament over after these rounds? Knockout: one match left; others: all rounds played. */
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
  /** #59: entries seated at each table (2 = the old pairs). */
  tableSize?: number;
  /** #59: points for 1st, 2nd, 3rd... at a table. */
  placePoints?: number[];
  /** #59: accounts per entry (2 for Spades pairs). */
  teamSize?: number;
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
  withdrawn: string[];
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

/** A player's past or current tournament, for their stats page. */
export interface PlayerTournament {
  code: string; name: string; gameName: string; format: Format; status: TournamentView['status'];
  /** Where they finished (or are now), and out of how many. */
  place: number; of: number; won: boolean;
}
