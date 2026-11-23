// Tournaments (#17) on the server: entries, starting, opening a room for each
// match with both players seated, taking results from finished games,
// forfeits for players who don't turn up, and the API.

import crypto from 'node:crypto';
import { Router } from 'express';
import type { Auth } from './auth';
import type { Db } from './db';
import type { RoomManager } from './rooms/manager';
import type { FinishedGame } from './rooms/room';
import { GAMES } from '../shared/games';
import { progressionBlock } from './progression';
import {
  FORMATS, finished, pairRound, standings, suggestedSwissRounds, winnerOf,
  type Format, type Round, type TPlayer, type TournamentConfig, type TournamentSummary, type TournamentView,
} from '../shared/tournament';

export const MAX_PLAYERS = 64;
const SWEEP_MS = 30_000;
const GRACE_CHOICES = [5, 10, 15, 30];

interface T {
  id: string; code: string; name: string; gameId: string;
  organiser: TPlayer; config: TournamentConfig; status: TournamentView['status'];
  players: TPlayer[]; seeds: string[]; rounds: Round[];
  /** Room code → when a player who hasn't turned up loses by forfeit. */
  deadlines: Record<string, number>;
  createdAt: string;
}

/** Games a tournament can use: two players can play them. */
export const tournamentGames = () => Object.values(GAMES).filter((g) => g.id !== 'cameratable' && (g.minPlayers ?? g.seats.length) <= 2 && g.seats.length >= 2);

/** Check the settings for a new tournament; returns them tidied, or a reason. */
export function checkTournament(b: Record<string, unknown>): { name: string; gameId: string; config: TournamentConfig } | { error: string } {
  const name = typeof b.name === 'string' ? b.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 60) : '';
  if (!name) return { error: 'Give the tournament a name' };
  const game = tournamentGames().find((g) => g.id === b.gameId);
  if (!game) return { error: 'Pick a two-player game' };
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
  return { name, gameId: game.id, config: { format: b.format as Format, rounds: b.format === 'swiss' ? rounds : 0, gameConfig, moveSeconds, graceMinutes: grace, open: b.open !== false } };
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
      this.all.set(r.code, {
        id: r.id, code: r.code, name: r.name, gameId: r.game_id, organiser: { id: r.organiser_id, name: r.organiser }, config: r.config, status: r.status,
        players: r.data.players ?? [], seeds: r.data.seeds ?? [], rounds: r.data.rounds ?? [], deadlines: r.data.deadlines ?? {}, createdAt: new Date(r.created_at).toISOString(),
      });
    }
  }

  stop(): void { clearInterval(this.sweep); }

  private async save(t: T): Promise<void> {
    await this.db.query('UPDATE tournaments SET status = $2, data = $3, updated_at = now() WHERE id = $1',
      [t.id, t.status, JSON.stringify({ players: t.players, seeds: t.seeds, rounds: t.rounds, deadlines: t.deadlines })]);
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
        const t: T = { id: rows[0].id, code, name: c.name, gameId: c.gameId, organiser: user, config: c.config, status: 'signup', players: [], seeds: [], rounds: [], deadlines: {}, createdAt: new Date(rows[0].created_at).toISOString() };
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

  async enter(user: TPlayer, t: T, on: boolean): Promise<void> {
    if (t.status !== 'signup') throw new Error('Entries are closed: the tournament has started');
    const blocked = progressionBlock(user.id, t.gameId);
    if (on && blocked) throw new Error(blocked);
    if (on) {
      if (t.players.some((p) => p.id === user.id)) return;
      if (t.players.length >= MAX_PLAYERS) throw new Error(`The tournament is full (${MAX_PLAYERS} players)`);
      t.players.push(user);
    } else t.players = t.players.filter((p) => p.id !== user.id);
    await this.save(t);
  }

  async start(user: TPlayer, t: T, random: () => number = Math.random): Promise<void> {
    if (t.organiser.id !== user.id) throw new Error('Only the organiser can start it');
    if (t.status !== 'signup') throw new Error('It has already started');
    if (t.players.length < 2) throw new Error('It needs at least two players');
    const seeds = t.players.map((p) => p.id);
    for (let i = seeds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [seeds[i], seeds[j]] = [seeds[j], seeds[i]]; }
    t.seeds = seeds;
    t.status = 'running';
    t.rounds = [pairRound(t.config.format, t.seeds, [])];
    await this.openRound(t);
    await this.save(t);
  }

  private player = (t: T, id: string) => t.players.find((p) => p.id === id) ?? { id, name: 'Someone' };

  /** Open a room for every match in the newest round that needs one. */
  private async openRound(t: T): Promise<void> {
    const game = GAMES[t.gameId];
    const [s1, s2] = game.seats.map((s) => s.id);
    const n = t.rounds.length;
    for (const m of t.rounds[n - 1]) {
      if (!m.b || m.room || m.result) continue;
      const a = this.player(t, m.a), b = this.player(t, m.b);
      const room = await this.rooms.create({ id: a.id, name: a.name, guest: false, admin: false }, {
        name: `${t.name}: round ${n}, ${a.name} v ${b.name}`.slice(0, 60), gameId: t.gameId, listed: true, seatPolicy: 'host', ranked: true,
        gameConfig: t.config.gameConfig, moveSeconds: t.config.moveSeconds, seated: { [s1]: a, [s2]: b },
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
      t.rounds.push(pairRound(t.config.format, t.seeds, t.rounds));
      await this.openRound(t);
    }
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

  private async onGameOver(ended: FinishedGame): Promise<void> {
    if (ended.result.aborted) return;
    const found = this.findMatch(ended.rec.code);
    if (!found) return;
    const m = found.t.rounds[found.round][found.index];
    if (m.result) return; // Already decided: later games in the room are friendlies.
    const won = ended.result.winner ? ended.players[ended.result.winner]?.userId : null;
    if (won === m.a) m.result = 'a';
    else if (won === m.b) m.result = 'b';
    else if (found.t.config.format === 'knockout') return; // A draw: play again in the same room.
    else m.result = 'draw';
    m.how = 'game';
    delete found.t.deadlines[ended.rec.code];
    await this.advance(found.t);
    await this.save(found.t);
  }

  /** Organiser: settle a match by hand (someone can't play, say). */
  async award(user: TPlayer, t: T, round: number, index: number, result: 'a' | 'b' | 'draw'): Promise<void> {
    if (t.organiser.id !== user.id) throw new Error('Only the organiser can do that');
    const m = t.rounds[round]?.[index];
    if (!m || !m.b) throw new Error('No such match');
    if (round !== t.rounds.length - 1) throw new Error('Only matches in the current round can be settled');
    if (result === 'draw' && t.config.format === 'knockout') throw new Error('A knockout match needs a winner');
    m.result = result;
    m.how = 'organiser';
    if (m.room) delete t.deadlines[m.room];
    await this.advance(t);
    await this.save(t);
  }

  /** Players who haven't turned up by the deadline lose by forfeit (if their opponent is there). */
  async checkDeadlines(now = Date.now()): Promise<void> {
    for (const t of this.all.values()) {
      if (t.status !== 'running') continue;
      let changed = false;
      for (const m of t.rounds[t.rounds.length - 1]) {
        if (!m.room || m.result || !m.b) continue;
        const due = t.deadlines[m.room];
        if (!due || now < due) continue;
        const room = await this.rooms.get(m.room);
        if (!room || room.playing) { delete t.deadlines[m.room]; continue; }
        const aHere = room.isHere(m.a), bHere = room.isHere(m.b);
        if (aHere === bHere) continue; // Both or neither: wait for them, or for the organiser.
        m.result = aHere ? 'a' : 'b';
        m.how = 'forfeit';
        delete t.deadlines[m.room];
        changed = true;
      }
      if (changed) { await this.advance(t); await this.save(t); }
    }
  }

  view(t: T): TournamentView {
    const game = GAMES[t.gameId];
    const tbl = standings(t.config.format, t.players, t.rounds);
    const done = t.status === 'done';
    return {
      code: t.code, name: t.name, gameId: t.gameId, gameName: game?.name ?? t.gameId, organiser: t.organiser, config: t.config, status: t.status,
      players: t.players, rounds: t.rounds.map((r) => r.map((m) => ({ ...m, deadline: m.room && !m.result ? t.deadlines[m.room] ?? null : null }))),
      standings: tbl, winner: done ? this.player(t, t.config.format === 'knockout' ? winnerOf(t.rounds[t.rounds.length - 1][0])! : tbl[0].id) : null,
      createdAt: t.createdAt,
    };
  }

  summaries(userId: string): TournamentSummary[] {
    return [...this.all.values()]
      .filter((t) => t.config.open || t.organiser.id === userId || t.players.some((p) => p.id === userId))
      .sort((x, y) => (x.status === 'done' ? 1 : 0) - (y.status === 'done' ? 1 : 0) || y.createdAt.localeCompare(x.createdAt))
      .slice(0, 50)
      .map((t) => {
        const mine = t.status === 'running' ? t.rounds[t.rounds.length - 1].find((m) => !m.result && m.b && (m.a === userId || m.b === userId)) : undefined;
        return {
          code: t.code, name: t.name, gameName: GAMES[t.gameId]?.name ?? t.gameId, format: t.config.format, status: t.status, players: t.players.length,
          organiser: t.organiser.name, open: t.config.open, entered: t.players.some((p) => p.id === userId), myRoom: mine?.room ?? null,
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
    res.json({ games: tournamentGames().map((g) => ({ id: g.id, name: g.name })), suggestedSwissRounds: suggestedSwissRounds(8) });
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
    try { await tournaments.enter(who(req), t, req.body?.entered !== false); res.json({ tournament: tournaments.view(t) }); } catch (err) { fail(res, err); }
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
    try { await tournaments.award(who(req), t, Number(b.round), Number(b.index), b.result); res.json({ tournament: tournaments.view(t) }); } catch (err) { fail(res, err); }
  });
  return r;
}
