// Tournaments (#17, #59) on the server: entries (including Spades pairs),
// starting, opening a room with a whole table seated, taking results from
// finished games (places as well as winners), forfeits for players who don't
// turn up, and the API.

import crypto from 'node:crypto';
import { Router } from 'express';
import type { Auth } from './auth';
import type { Db } from './db';
import type { RoomManager } from './rooms/manager';
import type { FinishedGame } from './rooms/room';
import { GAMES } from '../shared/games';
import { PAIRS } from '../shared/games/spades';
import { seatsIn } from '../shared/game';
import { progressionBlock } from './progression';
import {
  DEFAULT_PAIR_POINTS, DEFAULT_PLACE_POINTS, FORMATS, entryMembers, entryName, entrantsOf, finished, inEntry,
  pairRound, standings, suggestedSwissRounds, winnerOf,
  type Format, type Match, type PlayerTournament, type Round, type TPlayer, type TournamentConfig, type TournamentSummary, type TournamentView,
} from '../shared/tournament';

export const MAX_PLAYERS = 64;
const SWEEP_MS = 30_000;
const GRACE_CHOICES = [5, 10, 15, 30];

type AwardResult = 'a' | 'b' | 'draw' | 'table';
const AWARD_RESULTS: readonly AwardResult[] = ['a', 'b', 'draw', 'table'];

/** The HTTP body is untrusted: only whole, non-negative coordinates count (#89). */
function awardCoordinate(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

interface T {
  id: string; code: string; name: string; gameId: string;
  organiser: TPlayer; config: TournamentConfig; status: TournamentView['status'];
  players: TPlayer[]; seeds: string[]; rounds: Round[];
  /** Room code → when a player who hasn't turned up loses by forfeit. */
  deadlines: Record<string, number>;
  /** Players the organiser withdrew (#60): they lose their remaining matches. */
  withdrawn: string[];
  createdAt: string;
}

/** Games a tournament can use: 2-6 players can sit at a table (#59). */
export const tournamentGames = () => Object.values(GAMES).filter((g) =>
  g.id !== 'cameratable' && g.seats.length >= 2 && (g.minPlayers ?? g.seats.length) <= 6);

/** Check the settings for a new tournament; returns them tidied, or a reason. */
export function checkTournament(b: Record<string, unknown>): { name: string; gameId: string; config: TournamentConfig } | { error: string } {
  const name = typeof b.name === 'string' ? b.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 60) : '';
  if (!name) return { error: 'Give the tournament a name' };
  const game = tournamentGames().find((g) => g.id === b.gameId);
  if (!game) return { error: 'Pick a game that seats two to six players' };
  if (typeof b.format !== 'string' || !(b.format in FORMATS)) return { error: 'Pick a format' };
  const rounds = Number(b.rounds ?? 0);
  if (b.format === 'swiss' && (!Number.isInteger(rounds) || rounds < 1 || rounds > 15)) return { error: 'Swiss needs 1 to 15 rounds' };
  const grace = Number(b.graceMinutes ?? 10);
  if (!GRACE_CHOICES.includes(grace)) return { error: 'Pick how long players have to turn up' };
  const moveSeconds = Number(b.moveSeconds ?? 0);
  if (![0, 15, 30, 60, 120, 300].includes(moveSeconds)) return { error: 'Pick a move timer from the list' };
  const gameConfig = game.parseConfig(b.gameConfig ?? game.defaultConfig);
  const bad = game.configError?.(gameConfig);
  if (bad) return { error: bad };
  const seats = seatsIn(game, gameConfig);
  const minPlayers = game.minPlayers ?? seats.length;
  const tableSize = Number(b.tableSize ?? 2);
  if (!Number.isInteger(tableSize) || tableSize < 2 || tableSize > 6 || tableSize > seats.length || tableSize < minPlayers)
    return { error: `${game.name} needs ${minPlayers} to ${Math.min(6, seats.length)} players at a table` };
  const teamSize = Number(b.teamSize ?? 1);
  if (teamSize !== 1 && teamSize !== 2) return { error: 'Pick solo or pair entries' };
  if (teamSize === 2 && (game.id !== 'spades' || tableSize !== 4))
    return { error: 'Pair entries are for Spades (four seats, two pairs)' };
  if (tableSize > 2 && b.format !== 'swiss') return { error: 'Tables of three or more need Swiss' };
  const places = Math.ceil(tableSize / teamSize);
  const fallback = tableSize > 2 ? DEFAULT_PLACE_POINTS : DEFAULT_PAIR_POINTS;
  let placePoints = fallback.slice(0, places);
  if (Array.isArray(b.placePoints) && b.placePoints.length) {
    const nums = b.placePoints.map(Number);
    if (nums.length < places || nums.slice(0, places).some((x, i) =>
      !Number.isFinite(x) || x < 0 || x !== Math.floor(x * 2) / 2 || (i > 0 && x > nums[i - 1])) || nums[0] <= 0)
      return { error: 'Pick points by place: whole or half numbers, first place highest' };
    placePoints = [...nums.slice(0, places), ...Array(Math.max(0, 6 - places)).fill(0)].slice(0, 6);
  }
  while (placePoints.length < 6) placePoints.push(0);
  return {
    name, gameId: game.id, config: {
      format: b.format as Format, rounds: b.format === 'swiss' ? rounds : 0, gameConfig, moveSeconds,
      graceMinutes: grace, open: b.open !== false, tableSize, placePoints, teamSize,
    },
  };
}

const newCode = () => [...crypto.randomBytes(6)].map((x) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');

export class Tournaments {
  private all = new Map<string, T>();
  private sweep: NodeJS.Timeout;

  constructor(private db: Db, private rooms: RoomManager) {
    rooms.onGameOver = (ended) => { void this.onGameOver(ended); };
    this.sweep = setInterval(() => { void this.checkDeadlines(); }, SWEEP_MS);
  }

  async load(): Promise<void> {
    const { rows } = await this.db.query<{ id: string; code: string; name: string; game_id: string; organiser_id: string; organiser: string; config: TournamentConfig; status: T['status']; data: Partial<T>; created_at: Date }>(
      `SELECT * FROM tournaments WHERE status <> 'done' OR updated_at > now() - interval '30 days'`);
    for (const r of rows) {
      const cfg = r.config;
      this.all.set(r.code, {
        id: r.id, code: r.code, name: r.name, gameId: r.game_id, organiser: { id: r.organiser_id, name: r.organiser },
        config: { ...cfg, tableSize: cfg.tableSize ?? 2, placePoints: cfg.placePoints ?? DEFAULT_PAIR_POINTS, teamSize: cfg.teamSize ?? 1 },
        status: r.status,
        players: r.data.players ?? [], seeds: r.data.seeds ?? [], rounds: r.data.rounds ?? [], deadlines: r.data.deadlines ?? {},
        withdrawn: r.data.withdrawn ?? [], createdAt: new Date(r.created_at).toISOString(),
      });
    }
  }

  stop(): void { clearInterval(this.sweep); }

  private async save(t: T): Promise<void> {
    await this.db.query('UPDATE tournaments SET status = $2, data = $3, updated_at = now() WHERE id = $1',
      [t.id, t.status, JSON.stringify({ players: t.players, seeds: t.seeds, rounds: t.rounds, deadlines: t.deadlines, withdrawn: t.withdrawn })]);
  }

  async create(user: TPlayer, input: Record<string, unknown>): Promise<T> {
    const c = checkTournament(input);
    if ('error' in c) throw new Error(c.error);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      try {
        const { rows } = await this.db.query<{ id: string; created_at: Date }>(
          `INSERT INTO tournaments (code, name, game_id, organiser_id, organiser, config) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
          [code, c.name, c.gameId, user.id, user.name, JSON.stringify(c.config)]);
        const t: T = { id: rows[0].id, code, name: c.name, gameId: c.gameId, organiser: user, config: c.config, status: 'signup', players: [], seeds: [], rounds: [], deadlines: {}, withdrawn: [], createdAt: new Date(rows[0].created_at).toISOString() };
        this.all.set(code, t);
        await this.save(t);
        return t;
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    throw new Error('Could not find a free code');
  }

  get(code: string): T | undefined { return this.all.get(code.toUpperCase()); }

  /** Accounts for the partner picker on team entries (#59). */
  async partners(query: string): Promise<TPlayer[]> {
    const q = query.trim().slice(0, 40);
    if (q.length < 2) return [];
    const { rows } = await this.db.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM users WHERE kind = 'account' AND (display_name ILIKE $1 OR username ILIKE $1)
        ORDER BY display_name LIMIT 8`, [`%${q}%`]);
    return rows.map((r) => ({ id: r.id, name: r.display_name }));
  }

  /** Look up a partner by account id rather than trusting a name from the browser. */
  async partner(id: string): Promise<TPlayer | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows } = await this.db.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM users WHERE kind = 'account' AND id = $1`, [id]);
    return rows[0] ? { id: rows[0].id, name: rows[0].display_name } : null;
  }

  async enter(user: TPlayer, t: T, on: boolean, partner?: TPlayer): Promise<void> {
    // Swiss takes late entries before round 2 (#60): they start on no points.
    const late = t.status === 'running' && t.config.format === 'swiss' && t.rounds.length === 1;
    if (t.status !== 'signup' && !(late && on)) throw new Error('Entries are closed: the tournament has started');
    const blocked = progressionBlock(user.id, t.gameId);
    if (on && blocked) throw new Error(blocked);
    const team = (t.config.teamSize ?? 1) === 2;
    if (on && team && (!partner?.id || !partner.name || partner.id === user.id)) throw new Error('Pick a partner to enter with');
    if (on && partner && progressionBlock(partner.id, t.gameId)) throw new Error(`${partner.name} can’t play that game yet`);
    if (on) {
      if (t.players.some((p) => inEntry(p, user.id) || (partner && inEntry(p, partner.id)))) return;
      if (t.players.length >= MAX_PLAYERS) throw new Error(`The tournament is full (${MAX_PLAYERS} entries)`);
      t.players.push(team ? { ...user, members: [user, partner!] } : user);
      if (late) t.seeds.push(user.id);
    } else t.players = t.players.filter((p) => !inEntry(p, user.id));
    await this.save(t);
  }

  async start(user: TPlayer, t: T, random: () => number = Math.random): Promise<void> {
    if (t.organiser.id !== user.id) throw new Error('Only the organiser can start it');
    if (t.status !== 'signup') throw new Error('It has already started');
    const min = Math.max(2, Math.ceil((t.config.tableSize ?? 2) / (t.config.teamSize ?? 1)));
    if (t.players.length < min) throw new Error(`It needs at least ${min} ${(t.config.teamSize ?? 1) === 2 ? 'pairs' : 'players'}`);
    const seeds = t.players.map((p) => p.id);
    for (let i = seeds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [seeds[i], seeds[j]] = [seeds[j], seeds[i]]; }
    t.seeds = seeds;
    t.status = 'running';
    t.rounds = [pairRound(t.config.format, t.seeds, [], { tableSize: t.config.tableSize, placePoints: t.config.placePoints })];
    await this.openRound(t);
    await this.save(t);
  }

  private player = (t: T, id: string) => t.players.find((p) => p.id === id) ?? { id, name: 'Someone' };
  private entryForUser = (t: T, userId: string) => t.players.find((p) => inEntry(p, userId));

  /** Settle a match when one or more entries have gone (#59 handles tables). */
  private settleOut(m: Match, out: string[], format: Format, how: Match['how'] = 'forfeit'): void {
    const people = entrantsOf(m);
    const gone = people.filter((id) => out.includes(id));
    if (!gone.length || m.result) return;
    const left = people.filter((id) => !out.includes(id));
    if (!left.length) m.result = format === 'knockout' ? 'a' : 'none';
    else if (people.length > 2) { m.placings = [left, gone]; m.result = 'table'; }
    else { m.result = left[0] === m.a ? 'a' : 'b'; m.placings = [[left[0]], gone]; }
    m.how = how;
  }

  /** Open a room for every match in the newest round that needs one. */
  private async openRound(t: T): Promise<void> {
    const game = GAMES[t.gameId];
    const seats = seatsIn(game, t.config.gameConfig).map((s) => s.id);
    const n = t.rounds.length;
    for (const [k, m] of t.rounds[n - 1].entries()) {
      if (m.room || m.result) continue;
      const people = entrantsOf(m);
      // A withdrawn entry loses without playing.
      const out = people.filter((id) => t.withdrawn.includes(id));
      if (out.length) { this.settleOut(m, out, t.config.format); continue; }
      const seated: Record<string, TPlayer> = {};
      if ((t.config.teamSize ?? 1) === 2 && t.gameId === 'spades') {
        // Spades partners sit across: Amber/Violet and Teal/Rose.
        people.forEach((id, i) => {
          const members = entryMembers(this.player(t, id));
          const pair = PAIRS[i];
          if (pair && members[0] && members[1]) { seated[pair[0]] = members[0]; seated[pair[1]] = members[1]; }
        });
      } else {
        people.forEach((id, i) => {
          const seat = seats[i];
          if (seat) seated[seat] = this.player(t, id);
        });
      }
      const host = this.player(t, people[0]);
      const label = people.length === 2
        ? `${entryName(host)} v ${entryName(this.player(t, people[1]))}`
        : `table ${k + 1} (${people.length})`;
      const room = await this.rooms.create({ id: host.id, name: host.name, guest: false, admin: false }, {
        name: `${t.name}: round ${n}, ${label}`.slice(0, 60), gameId: t.gameId, listed: true, seatPolicy: 'host', ranked: true,
        gameConfig: t.config.gameConfig, moveSeconds: t.config.moveSeconds, seated,
      });
      m.room = room.rec.code;
      t.deadlines[room.rec.code] = Date.now() + t.config.graceMinutes * 60_000;
    }
  }

  /** The round is decided: on to the next, or the end. */
  private async advance(t: T): Promise<void> {
    const last = t.rounds[t.rounds.length - 1];
    if (!last.every((m) => m.result && (m.result !== 'draw' || t.config.format !== 'knockout'))) return;
    if (finished(t.config.format, t.seeds, t.rounds, t.config.rounds)) {
      t.status = 'done';
      console.log(`[tournaments] ${t.name} is over`);
    } else {
      t.rounds.push(pairRound(t.config.format, t.seeds, t.rounds, { tableSize: t.config.tableSize, placePoints: t.config.placePoints }));
      await this.openRound(t);
      // A round settled entirely by withdrawals moves straight on.
      if (t.rounds[t.rounds.length - 1].every((m) => m.result && m.result !== 'draw')) return this.advance(t);
    }
    await this.save(t);
  }

  /** Organiser (#60): withdraw an entry; it loses its current and later matches. */
  async withdraw(user: TPlayer, t: T, playerId: string): Promise<void> {
    if (t.organiser.id !== user.id) throw new Error('Only the organiser can do that');
    if (t.status !== 'running') throw new Error('Only once it’s under way (before that, they can withdraw themselves)');
    const entry = t.players.find((p) => p.id === playerId || inEntry(p, playerId));
    if (!entry) throw new Error('No such player');
    if (!t.withdrawn.includes(entry.id)) t.withdrawn.push(entry.id);
    // Swiss: no more pairings for them.
    if (t.config.format === 'swiss') t.seeds = t.seeds.filter((id) => id !== entry.id);
    for (const m of t.rounds[t.rounds.length - 1]) {
      this.settleOut(m, [entry.id], t.config.format);
      if (m.how === 'forfeit' && m.room) delete t.deadlines[m.room];
    }
    await this.advance(t);
    await this.save(t);
  }

  /** Organiser (#60): everyone in the current round gets more time to turn up. */
  async moreTime(user: TPlayer, t: T, minutes = 10): Promise<void> {
    if (t.organiser.id !== user.id) throw new Error('Only the organiser can do that');
    for (const k of Object.keys(t.deadlines)) t.deadlines[k] = Math.max(t.deadlines[k], Date.now()) + minutes * 60_000;
    await this.save(t);
  }

  private findMatch(code: string): { t: T; round: number; index: number } | null {
    for (const t of this.all.values()) {
      if (t.status !== 'running') continue;
      for (const [round, r] of t.rounds.entries()) {
        const index = r.findIndex((m) => m.room === code);
        if (index >= 0) return { t, round, index };
      }
    }
    return null;
  }

  /** A finished game's seat placings, as tournament entry ids (null = a plain draw). */
  private placingsOfGame(t: T, ended: FinishedGame): string[][] | null {
    const r = ended.result;
    if (r.nobodyWins) return [];
    if (!r.placings?.length) {
      if (!r.winner) return null;
      const id = ended.players[r.winner]?.userId;
      const entry = id ? this.entryForUser(t, id) : null;
      return entry ? [[entry.id]] : null;
    }
    const entryOfSeat = (seat: string) => {
      const id = ended.players[seat]?.userId;
      return id ? this.entryForUser(t, id)?.id ?? null : null;
    };
    const groups = r.placings
      .map((group) => [...new Set(group.map(entryOfSeat).filter((x): x is string => !!x))])
      .filter((group) => group.length);
    return groups.length ? groups : [];
  }

  private async onGameOver(ended: FinishedGame): Promise<void> {
    if (ended.result.aborted) return;
    const found = this.findMatch(ended.rec.code);
    if (!found) return;
    const m = found.t.rounds[found.round][found.index];
    if (m.result) return; // Already decided: later games in the room are friendlies.
    const people = entrantsOf(m);
    const groups = this.placingsOfGame(found.t, ended);
    if (!groups) {
      if (found.t.config.format === 'knockout') return; // A draw: play again in the same room.
      m.result = 'draw';
    } else if (!groups.length) m.result = 'none';
    else {
      const seen = new Set(groups.flat());
      const missing = people.filter((id) => !seen.has(id));
      const placings = missing.length ? [...groups, missing] : groups;
      if (people.length === 2 && placings[0].length > 1) {
        // A shared first in a two-entry match is a draw (a knockout replays it).
        if (found.t.config.format === 'knockout') return;
        m.result = 'draw';
      } else {
        m.placings = placings;
        m.result = people.length === 2 ? (placings[0][0] === m.a ? 'a' : 'b') : 'table';
      }
    }
    m.how = 'game';
    delete found.t.deadlines[ended.rec.code];
    await this.advance(found.t);
    await this.save(found.t);
  }

  /** Organiser: settle a match by hand (someone can't play, say). */
  async award(user: TPlayer, t: T, round: number, index: number, result: AwardResult, winner?: string): Promise<void> {
    if (t.organiser.id !== user.id) throw new Error('Only the organiser can do that');
    const m = t.rounds[round]?.[index];
    if (!m || !m.b) throw new Error('No such match');
    if (round !== t.rounds.length - 1) throw new Error('Only matches in the current round can be settled');
    const people = entrantsOf(m);
    if (result === 'table') {
      if (!winner || !people.includes(winner)) throw new Error('Pick an entry at this table');
      m.placings = [[winner], people.filter((id) => id !== winner)];
      m.result = people.length === 2 ? (winner === m.a ? 'a' : 'b') : 'table';
    } else {
      if (people.length !== 2) throw new Error('Pick a winner for this table');
      if (result === 'draw' && t.config.format === 'knockout') throw new Error('A knockout match needs a winner');
      m.result = result;
      m.placings = result === 'draw' ? undefined
        : [[result === 'a' ? m.a : m.b], [result === 'a' ? m.b : m.a]];
    }
    m.how = 'organiser';
    if (m.room) delete t.deadlines[m.room];
    await this.advance(t);
    await this.save(t);
  }

  /** Entries who haven't turned up by the deadline lose by forfeit (if their table has someone in it). */
  async checkDeadlines(now = Date.now()): Promise<void> {
    for (const t of this.all.values()) {
      if (t.status !== 'running') continue;
      let changed = false;
      for (const m of t.rounds[t.rounds.length - 1]) {
        if (!m.room || m.result) continue;
        const due = t.deadlines[m.room];
        if (!due || now < due) continue;
        const room = await this.rooms.get(m.room);
        if (!room || room.playing) { delete t.deadlines[m.room]; continue; }
        const people = entrantsOf(m);
        // A team is only there when both of its accounts are in the room (#59).
        const here = (id: string) => entryMembers(this.player(t, id)).every((p) => room.isHere(p.id));
        const present = people.filter(here);
        if (present.length === people.length) continue; // Everyone there: they just haven't started yet.
        if (!present.length) {
          // Nobody there (#60): both lose in Swiss and round robin; in a knockout the higher seed goes through.
          m.result = t.config.format === 'knockout' ? 'a' : 'none';
          if (people.length > 2) m.placings = [];
        } else if (people.length > 2) {
          m.placings = [present, people.filter((id) => !present.includes(id))];
          m.result = 'table';
        } else {
          m.result = present[0] === m.a ? 'a' : 'b';
          m.placings = [[present[0]], people.filter((id) => id !== present[0])];
        }
        m.how = 'forfeit';
        delete t.deadlines[m.room];
        changed = true;
      }
      if (changed) { await this.advance(t); await this.save(t); }
    }
  }

  view(t: T): TournamentView {
    const game = GAMES[t.gameId];
    const tbl = standings(t.config.format, t.players, t.rounds, t.config.placePoints);
    const done = t.status === 'done';
    let winner: TPlayer | null = null;
    if (done) {
      const id = t.config.format === 'knockout' ? winnerOf(t.rounds[t.rounds.length - 1][0]) : tbl[0]?.id;
      winner = id ? this.player(t, id) : null;
    }
    return {
      code: t.code, name: t.name, gameId: t.gameId, gameName: game?.name ?? t.gameId, organiser: t.organiser, config: t.config, status: t.status,
      players: t.players, rounds: t.rounds.map((r) => r.map((m) => ({ ...m, deadline: m.room && !m.result ? t.deadlines[m.room] ?? null : null }))),
      withdrawn: t.withdrawn, standings: tbl, winner, createdAt: t.createdAt,
    };
  }

  /** The tournaments `userId` entered, newest first, with where they finished. */
  async history(userId: string): Promise<PlayerTournament[]> {
    const { rows } = await this.db.query<{ code: string; name: string; game_id: string; config: TournamentConfig; status: T['status']; data: Partial<T> }>(
      `SELECT code, name, game_id, config, status, data FROM tournaments
        WHERE status <> 'signup' ORDER BY created_at DESC LIMIT 200`);
    return rows.filter((r) => (r.data.players ?? []).some((p) => inEntry(p, userId))).slice(0, 20).map((r) => {
      const players = r.data.players ?? [];
      const entry = players.find((p) => inEntry(p, userId));
      const table = standings(r.config.format, players, r.data.rounds ?? [], r.config.placePoints);
      const place = table.findIndex((x) => x.id === entry?.id) + 1;
      return { code: r.code, name: r.name, gameName: GAMES[r.game_id]?.name ?? r.game_id, format: r.config.format, status: r.status, place, of: table.length, won: r.status === 'done' && place === 1 };
    });
  }

  summaries(userId: string): TournamentSummary[] {
    return [...this.all.values()]
      .filter((t) => t.config.open || t.organiser.id === userId || t.players.some((p) => inEntry(p, userId)))
      .sort((x, y) => (x.status === 'done' ? 1 : 0) - (y.status === 'done' ? 1 : 0) || y.createdAt.localeCompare(x.createdAt))
      .slice(0, 50)
      .map((t) => {
        const mine = t.status === 'running' ? t.rounds[t.rounds.length - 1].find((m) =>
          !m.result && entrantsOf(m).some((id) => inEntry(this.player(t, id), userId))) : undefined;
        return {
          code: t.code, name: t.name, gameName: GAMES[t.gameId]?.name ?? t.gameId, format: t.config.format, status: t.status, players: t.players.length,
          organiser: t.organiser.name, open: t.config.open, entered: t.players.some((p) => inEntry(p, userId)), myRoom: mine?.room ?? null,
        };
      });
  }
}

export function tournamentRoutes(opts: { auth: Auth; tournaments: Tournaments }): Router {
  const { auth, tournaments } = opts;
  const r = Router();
  const who = (req: { user?: { id: string; name: string; guest: boolean } }) => ({ id: req.user!.id, name: req.user!.name });
  const fail = (res: { status(n: number): { json(b: unknown): void } }, err: unknown) => res.status(400).json({ error: (err as Error).message });

  r.get('/tournaments/games', auth.requireUser, (_req, res) => {
    res.json({
      games: tournamentGames().map((g) => ({
        id: g.id, name: g.name, minPlayers: g.minPlayers ?? g.seats.length,
        seats: seatsIn(g, g.defaultConfig).length, teams: g.id === 'spades',
      })),
      suggestedSwissRounds: suggestedSwissRounds(8),
    });
  });
  r.get('/tournaments/partners', auth.requireUser, async (req, res) => {
    res.json({ players: await tournaments.partners(String(req.query.q ?? '')) });
  });
  r.get('/players/:id/tournaments', auth.requireUser, async (req, res) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(404).json({ error: 'No such player' }); return; }
    res.json({ tournaments: await tournaments.history(id) });
  });
  r.get('/tournaments', auth.requireUser, (req, res) => { res.json({ tournaments: tournaments.summaries(req.user!.id) }); });
  r.post('/tournaments', auth.requireUser, async (req, res) => {
    if (req.user!.guest) { res.status(403).json({ error: 'Running a tournament needs an account' }); return; }
    try { const t = await tournaments.create(who(req), req.body ?? {}); res.status(201).json({ tournament: tournaments.view(t) }); } catch (err) { fail(res, err); }
  });
  r.get('/tournaments/:code', auth.requireUser, (req, res) => {
    const t = tournaments.get(String(req.params.code));
    if (!t) { res.status(404).json({ error: 'No such tournament' }); return; }
    res.json({ tournament: tournaments.view(t) });
  });
  r.post('/tournaments/:code/entry', auth.requireUser, async (req, res) => {
    const t = tournaments.get(String(req.params.code));
    if (!t) { res.status(404).json({ error: 'No such tournament' }); return; }
    if (req.user!.guest) { res.status(403).json({ error: 'Entering needs an account (results are kept for accounts)' }); return; }
    try {
      const id = typeof req.body?.partnerId === 'string' ? req.body.partnerId : '';
      const partner = id ? await tournaments.partner(id) : null;
      if (id && !partner) throw new Error('No such partner account');
      await tournaments.enter(who(req), t, req.body?.entered !== false, partner ?? undefined);
      res.json({ tournament: tournaments.view(t) });
    } catch (err) { fail(res, err); }
  });
  r.post('/tournaments/:code/start', auth.requireUser, async (req, res) => {
    const t = tournaments.get(String(req.params.code));
    if (!t) { res.status(404).json({ error: 'No such tournament' }); return; }
    try { await tournaments.start(who(req), t); res.json({ tournament: tournaments.view(t) }); } catch (err) { fail(res, err); }
  });
  r.post('/tournaments/:code/award', auth.requireUser, async (req, res) => {
    const t = tournaments.get(String(req.params.code));
    if (!t) { res.status(404).json({ error: 'No such tournament' }); return; }
    const b = req.body ?? {};
    try {
      const round = awardCoordinate(b.round);
      const index = awardCoordinate(b.index);
      if (round === null) throw new Error('Pick a valid round');
      if (index === null) throw new Error('Pick a valid match');
      const result = AWARD_RESULTS.find((x) => x === b.result);
      if (!result) throw new Error('Pick a valid result: a, b, draw or table');
      await tournaments.award(who(req), t, round, index, result, typeof b.winner === 'string' ? b.winner : undefined);
      res.json({ tournament: tournaments.view(t) });
    } catch (err) { fail(res, err); }
  });
  r.post('/tournaments/:code/withdraw', auth.requireUser, async (req, res) => {
    const t = tournaments.get(String(req.params.code));
    if (!t) { res.status(404).json({ error: 'No such tournament' }); return; }
    try { await tournaments.withdraw(who(req), t, String(req.body?.playerId ?? '')); res.json({ tournament: tournaments.view(t) }); } catch (err) { fail(res, err); }
  });
  r.post('/tournaments/:code/more-time', auth.requireUser, async (req, res) => {
    const t = tournaments.get(String(req.params.code));
    if (!t) { res.status(404).json({ error: 'No such tournament' }); return; }
    try { await tournaments.moreTime(who(req), t); res.json({ tournament: tournaments.view(t) }); } catch (err) { fail(res, err); }
  });
  return r;
}
