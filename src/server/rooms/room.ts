// One game room: who's in it, who sits where, who hosts, the chat, and the
// game being played. Pure logic: the network, the database and timers come
// in through RoomHooks, so the rules here can be tested on their own.
//
// Roles: the host is a flag on the room (rec.hostId) and can also sit in a
// seat. A person in a seat is a player; everyone else present is watching.

import { GAMES } from '../../shared/games';
import { placingsOf } from '../../shared/scoring';
import type { GameContext, GameModule, GameResult, SeatId } from '../../shared/game';
import type {
  Channel, ChatLine, ClientMessage, GameStatus, LastResult, MemberView, RoomSettings, RoomSnapshot, RoomSummary,
} from '../../shared/protocol';

export interface RoomUser {
  id: string;
  name: string;
  guest: boolean;
}

export interface SeatHolder {
  userId: string;
  name: string;
  guest: boolean;
}

export interface RoomRecord {
  id: string;
  code: string;
  name: string;
  gameId: string;
  hostId: string;
  hostName: string;
  settings: RoomSettings;
  /** bcrypt hash of the room password; null = no password. Never sent out. */
  passwordHash: string | null;
  seats: Record<SeatId, SeatHolder | null>;
  game: {
    status: GameStatus; state: unknown; startedAt: number | null; players: Record<SeatId, SeatHolder> | null;
    /** When the move timer runs out for whoever's turn it is. */
    moveDeadline?: number | null;
    /** A result the room decided (the move timer), not the game. */
    result?: GameResult | null;
  };
}

export interface RoomHooks {
  now(): number;
  /** A number in [0, 1) for dice and shuffles. */
  random(): number;
  setTimer(ms: number, fn: () => void): () => void;
  /** The record changed and should be saved. */
  save(rec: RoomRecord): void;
  /** A chat line was added and should be stored. */
  chat(roomId: string, line: ChatLine): void;
  /** A game finished: store it and, if it counts, everyone's result. */
  gameOver(ended: FinishedGame): void;
  /** Something visible changed: send everyone a fresh snapshot. */
  changed(): void;
}

export interface FinishedGame {
  rec: RoomRecord;
  result: GameResult;
  state: unknown;
  players: Record<SeatId, SeatHolder>;
  /** Counts for the leaderboards. */
  counted: boolean;
  /** Why it doesn't count, when it doesn't. */
  note: string | null;
}

export class RoomError extends Error {}

const CHAT_KEEP = 300;
const CHAT_MAX = 1000;

export class Room {
  readonly game: GameModule;
  private present = new Map<string, { user: RoomUser; conns: number }>();
  private queue: string[] = [];
  private chatLines: ChatLine[];
  private nextChatId: number;
  private cancelTimer: (() => void) | null = null;
  private lastResult: LastResult | null = null;
  /** The game's states over time, for watchers who see it late. */
  private history: { at: number; state: unknown }[] = [];
  private endedAt: number | null = null;

  constructor(readonly rec: RoomRecord, private hooks: RoomHooks, history: ChatLine[] = []) {
    const game = GAMES[rec.gameId];
    if (!game) throw new Error(`Unknown game ${rec.gameId}`);
    this.game = game;
    for (const s of game.seats) if (!(s.id in rec.seats)) rec.seats[s.id] = null;
    this.chatLines = history.slice(-CHAT_KEEP);
    this.nextChatId = (this.chatLines.at(-1)?.id ?? 0) + 1;
    this.armTimer();
  }

  // ---- presence -------------------------------------------------------

  join(user: RoomUser): void {
    const p = this.present.get(user.id);
    if (p) { p.conns++; p.user = user; } else this.present.set(user.id, { user, conns: 1 });
    this.hooks.changed();
  }

  leave(userId: string): void {
    const p = this.present.get(userId);
    if (!p) return;
    if (--p.conns > 0) return;
    this.present.delete(userId);
    this.queue = this.queue.filter((id) => id !== userId);
    this.hooks.changed();
  }

  /** Standings after the last game, filled in once the results are saved. */
  setLastResult(r: LastResult | null): void {
    this.lastResult = r;
    this.hooks.changed();
  }

  get presentCount(): number {
    return this.present.size;
  }

  dispose(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  /** Who can come in without the room password: the host and anyone seated. */
  admitsWithoutPassword(userId: string): boolean {
    return !this.rec.passwordHash || this.isHost(userId) || this.seatOf(userId) !== null;
  }

  /** The host set, changed or removed the password (hashing is done outside). */
  setPassword(hash: string | null): void {
    const had = !!this.rec.passwordHash;
    this.rec.passwordHash = hash;
    this.system(hash ? (had ? 'The host changed the room password' : 'The host set a room password') : 'The host removed the room password');
    this.touch();
  }

  // ---- roles ----------------------------------------------------------

  isHost(userId: string): boolean {
    return this.rec.hostId === userId;
  }

  seatOf(userId: string): SeatId | null {
    for (const [seat, h] of Object.entries(this.rec.seats)) if (h?.userId === userId) return seat;
    return null;
  }

  private get status(): GameStatus {
    return this.rec.game.status;
  }

  canRead(userId: string): Channel[] {
    const seated = this.seatOf(userId) !== null;
    const galleryHidden = seated && this.rec.settings.hideGalleryFromPlayers && this.status === 'playing';
    return galleryHidden ? ['table'] : ['table', 'gallery'];
  }

  canWrite(userId: string): Channel[] {
    const seated = this.seatOf(userId) !== null;
    if (seated) return ['table'];
    const table = this.isHost(userId) || this.rec.settings.watchersWriteTable || this.status !== 'playing';
    return table ? ['table', 'gallery'] : ['gallery'];
  }

  // ---- messages -------------------------------------------------------

  handle(user: RoomUser, msg: ClientMessage): void {
    if (!this.present.has(user.id)) throw new RoomError('You’re not in this room');
    switch (msg?.t) {
      case 'sit': return this.sit(user, msg.seat);
      case 'stand': return this.stand(user);
      case 'hand': return this.hand(user, !!msg.up);
      case 'chat': return this.chat(user, msg.channel, msg.text);
      case 'act': return this.act(user, msg.action);
      case 'start': this.hostOnly(user); return this.start();
      case 'seat': this.hostOnly(user); return this.seatSomeone(msg.userId, msg.seat);
      case 'unseat': this.hostOnly(user); return this.unseat(msg.userId);
      case 'makeHost': this.hostOnly(user); return this.makeHost(msg.userId);
      case 'settings': this.hostOnly(user); return this.updateSettings(msg.settings);
      default: throw new RoomError('Unknown request');
    }
  }

  private hostOnly(user: RoomUser): void {
    if (!this.isHost(user.id)) throw new RoomError('Only the host can do that');
  }

  private seatLabel(seat: SeatId): string {
    return this.game.seats.find((s) => s.id === seat)?.label ?? seat;
  }

  private checkSeat(seat: SeatId): void {
    if (!this.game.seats.some((s) => s.id === seat)) throw new RoomError('No such seat');
  }

  private checkCanPlay(user: { guest: boolean }): void {
    if (user.guest && !this.rec.settings.guestsCanPlay) throw new RoomError('Guests can watch but not play in this room');
  }

  private place(holder: SeatHolder, seat: SeatId): void {
    const old = this.seatOf(holder.userId);
    if (old) this.rec.seats[old] = null;
    this.rec.seats[seat] = holder;
    this.queue = this.queue.filter((id) => id !== holder.userId);
  }

  private sit(user: RoomUser, seat: SeatId): void {
    this.checkSeat(seat);
    if (this.status === 'playing') throw new RoomError('Wait for this game to end');
    if (this.rec.seats[seat]) throw new RoomError('That seat is taken');
    if (this.rec.settings.seatPolicy === 'host' && !this.isHost(user.id)) {
      throw new RoomError('The host seats players here: ask for a seat instead');
    }
    this.checkCanPlay(user);
    this.place({ userId: user.id, name: user.name, guest: user.guest }, seat);
    this.system(`${user.name} sat down as ${this.seatLabel(seat)}`);
    this.touch();
  }

  private stand(user: RoomUser): void {
    const seat = this.seatOf(user.id);
    if (!seat) return;
    if (this.status === 'playing') throw new RoomError('Resign or finish the game first');
    this.rec.seats[seat] = null;
    this.system(`${user.name} left the ${this.seatLabel(seat)} seat`);
    this.touch();
  }

  private hand(user: RoomUser, up: boolean): void {
    if (up) {
      if (this.seatOf(user.id)) throw new RoomError('You already have a seat');
      if (!this.queue.includes(user.id)) this.queue.push(user.id);
    } else {
      this.queue = this.queue.filter((id) => id !== user.id);
    }
    this.hooks.changed();
  }

  private chat(user: RoomUser, channel: Channel, text: unknown): void {
    if (channel !== 'table' && channel !== 'gallery') throw new RoomError('No such chat');
    if (!this.canWrite(user.id).includes(channel)) {
      throw new RoomError(channel === 'table' ? 'Watchers can’t write at the table during play' : 'Players can’t write in the gallery');
    }
    const body = typeof text === 'string' ? text.trim() : '';
    if (!body) return;
    if (body.length > CHAT_MAX) throw new RoomError(`Keep messages under ${CHAT_MAX} characters`);
    this.addLine({ channel, kind: 'typed', userId: user.id, name: user.name, text: body });
    if (channel === 'table' && this.rec.settings.watcherDelay) this.hooks.setTimer(this.rec.settings.watcherDelay * 1000 + 50, () => this.hooks.changed());
    this.hooks.changed();
  }

  private act(user: RoomUser, action: unknown): void {
    if (this.status !== 'playing') throw new RoomError('No game is being played');
    const seat = this.seatOf(user.id);
    if (!seat) throw new RoomError('Only players can do that');
    const now = this.hooks.now();
    // Let a clock run out before the move that came too late.
    const ticked = this.game.tick(this.rec.game.state, now);
    if (ticked) {
      this.rec.game.state = ticked;
      if (this.afterChange()) return;
    }
    const r = this.game.act(this.rec.game.state, seat, action, now, this.context());
    if ('error' in r) throw new RoomError(r.error);
    this.rec.game.state = r.state;
    this.afterChange();
  }

  /** After the game state changes: finish if it ended, else re-arm the
   *  timer. Returns true if the game ended. */
  private afterChange(): boolean {
    const result = this.game.result(this.rec.game.state);
    if (result) {
      this.finish(result);
      return true;
    }
    this.record();
    this.resetMoveDeadline();
    this.armTimer();
    this.touch();
    return false;
  }

  /** Keep the state for delayed watchers, and wake them when it's their turn to see it. */
  private record(): void {
    const delay = this.rec.settings.watcherDelay;
    if (!delay) return;
    this.history.push({ at: this.hooks.now(), state: this.rec.game.state });
    if (this.history.length > 1000) this.history.splice(0, this.history.length - 1000);
    this.hooks.setTimer(delay * 1000 + 50, () => this.hooks.changed());
  }

  /** Seconds behind live that this person sees the game. */
  delayFor(userId: string): number {
    return this.seatOf(userId) === null ? this.rec.settings.watcherDelay : 0;
  }

  /** A fresh move timer for whoever's turn it now is (after every action). */
  private resetMoveDeadline(): void {
    const secs = this.rec.settings.moveSeconds;
    const seats = this.game.turn?.(this.rec.game.state) ?? [];
    this.rec.game.moveDeadline = this.status === 'playing' && secs > 0 && seats.length ? this.hooks.now() + secs * 1000 : null;
  }

  /** The move timer ran out. */
  private moveTimeout(): void {
    const seat = this.game.turn?.(this.rec.game.state)?.[0];
    if (!seat) return;
    if (this.game.timeout) {
      this.rec.game.state = this.game.timeout(this.rec.game.state, seat, this.hooks.now(), this.context());
      this.afterChange();
      return;
    }
    const others = Object.keys(this.rec.game.players ?? {}).filter((s) => s !== seat);
    this.finish({ winner: others.length === 1 ? others[0] : null, reason: `${this.seatLabel(seat)} running out of move time` });
  }

  /** The seats with someone in them (while a game is on, its players' seats). */
  private context(): GameContext {
    const seats = this.rec.game.status === 'playing' && this.rec.game.players
      ? this.game.seats.map((s) => s.id).filter((id) => id in this.rec.game.players!)
      : this.game.seats.map((s) => s.id).filter((id) => this.rec.seats[id]);
    return { seats, random: () => this.hooks.random() };
  }

  /** Fewest players to start this game. */
  get minPlayers(): number {
    return this.game.minPlayers ?? this.game.seats.length;
  }

  private start(): void {
    if (this.status === 'playing') throw new RoomError('A game is already on');
    const seated = this.game.seats.filter((s) => this.rec.seats[s.id]);
    if (seated.length < this.minPlayers) {
      throw new RoomError(this.minPlayers === this.game.seats.length
        ? `Fill every seat first (${this.game.seats.filter((s) => !this.rec.seats[s.id]).map((s) => s.label).join(', ')})`
        : `${this.game.name} needs at least ${this.minPlayers} players`);
    }
    const config = this.game.parseConfig(this.rec.settings.gameConfig);
    const now = this.hooks.now();
    const players: Record<SeatId, SeatHolder> = {};
    for (const s of seated) players[s.id] = this.rec.seats[s.id]!;
    const ctx: GameContext = { seats: seated.map((s) => s.id), random: () => this.hooks.random() };
    this.rec.game = { status: 'playing', state: this.game.create(config, now, ctx), startedAt: now, players, result: null, moveDeadline: null };
    this.lastResult = null;
    this.history = [{ at: now, state: this.rec.game.state }];
    this.endedAt = null;
    this.resetMoveDeadline();
    const who = seated.map((s) => `${s.label} ${players[s.id].name}`).join(', ');
    this.system(`Game started: ${who} · ${this.game.describeConfig(config)}`);
    this.armTimer();
    this.touch();
  }

  private finish(result: GameResult): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    const players = this.rec.game.players ?? {};
    this.rec.game.status = 'over';
    this.rec.game.result = result;
    this.endedAt = this.hooks.now();
    this.record();
    this.rec.game.moveDeadline = null;
    const placings = placingsOf(result, Object.keys(players));
    const who = (seat: SeatId) => `${players[seat]?.name ?? this.seatLabel(seat)} (${this.seatLabel(seat)})`;
    let line = placings[0].length === 1 ? `${who(placings[0][0])} won` : 'Draw';
    if (placings[0].length === 1 && placings[1]?.length && Object.keys(players).length >= 3) {
      line += `, ${placings[1].map(who).join(' and ')} second`;
    }
    this.system(result.aborted ? `Game stopped: ${result.reason}` : `${line} by ${result.reason}`);
    const guests = Object.values(players).some((p) => p.guest);
    const note = result.aborted ? 'The game was stopped, so it doesn\u2019t count.'
      : !this.rec.settings.ranked ? 'This room is casual: games here don\u2019t count for the leaderboards.'
        : guests ? 'A guest played, so this game doesn\u2019t count for the leaderboards.' : null;
    this.hooks.gameOver({ rec: this.rec, result, state: this.rec.game.state, players, counted: note === null, note });
    this.nextPlayers(result);
    this.touch();
  }

  /** Apply the room's "after each game" rule, seating people from the queue. */
  private nextPlayers(result: GameResult): void {
    const policy = this.rec.settings.afterGame;
    if (policy === 'same') return;
    let free: SeatId[];
    if (policy === 'rotate') free = this.game.seats.map((s) => s.id);
    else {
      // Winner stays: everyone but a sole winner makes way.
      const first = placingsOf(result, Object.keys(this.rec.game.players ?? {}))[0];
      if (first.length !== 1) return;
      free = this.game.seats.map((s) => s.id).filter((id) => id !== first[0] && this.rec.seats[id]);
    }
    for (const seat of free) {
      const nextId = this.queue.find((id) => {
        const p = this.present.get(id);
        return p && (!p.user.guest || this.rec.settings.guestsCanPlay);
      });
      if (!nextId) break;
      const next = this.present.get(nextId)!.user;
      const prev = this.rec.seats[seat];
      this.place({ userId: next.id, name: next.name, guest: next.guest }, seat);
      this.system(prev ? `${next.name} takes ${this.seatLabel(seat)} from ${prev.name}` : `${next.name} sits down as ${this.seatLabel(seat)}`);
    }
  }

  private seatSomeone(userId: string, seat: SeatId): void {
    this.checkSeat(seat);
    if (this.status === 'playing') throw new RoomError('End the game first');
    const p = this.present.get(userId);
    if (!p) throw new RoomError('They’re not in the room');
    this.checkCanPlay(p.user);
    const prev = this.rec.seats[seat];
    this.place({ userId, name: p.user.name, guest: p.user.guest }, seat);
    this.system(prev && prev.userId !== userId
      ? `The host gave ${this.seatLabel(seat)} to ${p.user.name} (was ${prev.name})`
      : `The host seated ${p.user.name} as ${this.seatLabel(seat)}`);
    this.touch();
  }

  private unseat(userId: string): void {
    const seat = this.seatOf(userId);
    if (!seat) return;
    const name = this.rec.seats[seat]!.name;
    if (this.status === 'playing') this.finish({ winner: null, reason: 'the host moved a player to watching', aborted: true });
    // finish() may have reseated people; look the seat up again.
    const now = this.seatOf(userId);
    if (now) this.rec.seats[now] = null;
    this.system(`The host moved ${name} to watching`);
    this.touch();
  }

  private makeHost(userId: string): void {
    const p = this.present.get(userId);
    if (!p) throw new RoomError('They’re not in the room');
    if (p.user.guest) throw new RoomError('Guests can’t host: they need an account');
    this.rec.hostId = userId;
    this.rec.hostName = p.user.name;
    this.system(`${p.user.name} is now the host`);
    this.touch();
  }

  private updateSettings(raw: Partial<RoomSettings>): void {
    const s = { ...this.rec.settings };
    const r = raw ?? {};
    const bool = (k: 'listed' | 'guestsCanPlay' | 'hideGalleryFromPlayers' | 'watchersWriteTable') => {
      if (typeof r[k] === 'boolean') s[k] = r[k] as boolean;
    };
    bool('listed'); bool('guestsCanPlay'); bool('hideGalleryFromPlayers'); bool('watchersWriteTable');
    if (typeof r.ranked === 'boolean' && r.ranked !== s.ranked) {
      if (this.status === 'playing') throw new RoomError('Change whether games count between games');
      s.ranked = r.ranked;
    }
    if (r.seatPolicy === 'open' || r.seatPolicy === 'host') s.seatPolicy = r.seatPolicy;
    if (r.afterGame === 'same' || r.afterGame === 'winnerStays' || r.afterGame === 'rotate') s.afterGame = r.afterGame;
    if (typeof r.watcherDelay === 'number' && r.watcherDelay !== s.watcherDelay) {
      if (this.status === 'playing') throw new RoomError('Change the watcher delay between games');
      if (![0, 15, 30, 60, 120].includes(r.watcherDelay)) throw new RoomError('Pick a delay from the list');
      s.watcherDelay = r.watcherDelay;
    }
    if (typeof r.moveSeconds === 'number' && r.moveSeconds !== s.moveSeconds) {
      if (this.status === 'playing') throw new RoomError('Change the move timer between games');
      if (![0, 15, 30, 60, 120, 300].includes(r.moveSeconds)) throw new RoomError('Pick a move timer from the list');
      s.moveSeconds = r.moveSeconds;
    }
    if (r.gameConfig !== undefined) {
      if (this.status === 'playing') throw new RoomError('Change the game settings between games');
      s.gameConfig = this.game.parseConfig(r.gameConfig);
    }
    this.rec.settings = s;
    this.touch();
  }

  // ---- internals ------------------------------------------------------

  private system(text: string): void {
    this.addLine({ channel: 'table', kind: 'system', userId: null, name: '', text });
  }

  private addLine(l: Omit<ChatLine, 'id' | 'at'>): void {
    const line: ChatLine = { ...l, id: this.nextChatId++, at: this.hooks.now() };
    this.chatLines.push(line);
    if (this.chatLines.length > CHAT_KEEP) this.chatLines.splice(0, this.chatLines.length - CHAT_KEEP);
    this.hooks.chat(this.rec.id, line);
  }

  private touch(): void {
    this.hooks.save(this.rec);
    this.hooks.changed();
  }

  private armTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    if (this.status !== 'playing') return;
    const deadlines = [this.game.nextDeadline(this.rec.game.state), this.rec.game.moveDeadline ?? null].filter((d): d is number => d !== null);
    if (!deadlines.length) return;
    const deadline = Math.min(...deadlines);
    this.cancelTimer = this.hooks.setTimer(Math.max(0, deadline - this.hooks.now()) + 5, () => {
      this.cancelTimer = null;
      if (this.status !== 'playing') return;
      if (this.rec.game.moveDeadline && this.hooks.now() >= this.rec.game.moveDeadline) { this.moveTimeout(); return; }
      const ticked = this.game.tick(this.rec.game.state, this.hooks.now());
      if (ticked) { this.rec.game.state = ticked; this.afterChange(); } else this.armTimer();
    });
  }

  // ---- views ----------------------------------------------------------

  members(): MemberView[] {
    const out = new Map<string, MemberView>();
    const add = (userId: string, name: string, guest: boolean) => {
      if (out.has(userId)) return;
      out.set(userId, {
        userId, name, guest,
        online: this.present.has(userId),
        host: this.isHost(userId),
        seat: this.seatOf(userId),
        hand: this.queue.includes(userId),
      });
    };
    for (const h of Object.values(this.rec.seats)) if (h) add(h.userId, h.name, h.guest);
    for (const { user } of this.present.values()) add(user.id, user.name, user.guest);
    add(this.rec.hostId, this.rec.hostName, false);
    return [...out.values()];
  }

  /** The game as this person may see it: live for players, late for
   *  watchers when the room has a watcher delay. */
  private gameFor(userId: string, now: number): RoomSnapshot['game'] {
    const g = this.rec.game;
    const delayMs = this.delayFor(userId) * 1000;
    const live = {
      status: g.status,
      view: g.state ? this.game.view(g.state, now, this.seatOf(userId)) : null,
      result: g.result ?? (g.state ? this.game.result(g.state) : null),
      turnSeats: g.status === 'playing' && g.state ? this.game.turn?.(g.state) ?? [] : [],
      moveDeadline: g.status === 'playing' ? g.moveDeadline ?? null : null,
    };
    const inWindow = g.status === 'playing' || (g.status === 'over' && this.endedAt !== null && now - this.endedAt < delayMs);
    if (!delayMs || !inWindow || !this.history.length) return live;
    const seenAt = now - delayMs;
    const entry = [...this.history].reverse().find((h) => h.at <= seenAt) ?? this.history[0];
    // Still inside the delay: the game isn't over yet as far as they know.
    return {
      status: 'playing',
      view: this.game.view(entry.state, Math.max(entry.at, seenAt), null),
      result: null,
      turnSeats: this.game.turn?.(entry.state) ?? [],
      moveDeadline: null,
    };
  }

  snapshotFor(userId: string): RoomSnapshot {
    const now = this.hooks.now();
    const delayMs = this.delayFor(userId) * 1000;
    const canRead = this.canRead(userId);
    const config = this.game.parseConfig(this.rec.settings.gameConfig);
    return {
      room: {
        id: this.rec.id,
        code: this.rec.code,
        name: this.rec.name,
        gameId: this.game.id,
        gameName: this.game.name,
        configLabel: this.game.describeConfig(config),
        hostId: this.rec.hostId,
        settings: this.rec.settings,
        locked: !!this.rec.passwordHash,
        moveTimer: !!this.game.turn,
      },
      seats: this.game.seats.map((s) => ({
        id: s.id, label: s.label, userId: this.rec.seats[s.id]?.userId ?? null, name: this.rec.seats[s.id]?.name ?? null,
      })),
      members: this.members(),
      queue: [...this.queue],
      lastResult: this.lastResult,
      game: this.gameFor(userId, now),
      // Delayed watchers get the table (the players' talk) late too; the gallery stays live.
      chat: this.chatLines.filter((l) => canRead.includes(l.channel)
        && !(l.channel === 'table' && delayMs && l.at > now - delayMs)),
      you: {
        userId,
        host: this.isHost(userId),
        seat: this.seatOf(userId),
        canRead,
        canWrite: this.canWrite(userId),
        delay: this.delayFor(userId),
      },
      serverNow: now,
    };
  }

  summary(): RoomSummary {
    const seated = new Set(Object.values(this.rec.seats).filter(Boolean).map((h) => h!.userId));
    return {
      code: this.rec.code,
      name: this.rec.name,
      gameId: this.game.id,
      gameName: this.game.name,
      configLabel: this.game.describeConfig(this.game.parseConfig(this.rec.settings.gameConfig)),
      hostName: this.rec.hostName,
      status: this.rec.game.status,
      seats: this.game.seats.map((s) => ({
        id: s.id, label: s.label, userId: this.rec.seats[s.id]?.userId ?? null, name: this.rec.seats[s.id]?.name ?? null,
      })),
      watching: [...this.present.keys()].filter((id) => !seated.has(id)).length,
      listed: this.rec.settings.listed,
      ranked: this.rec.settings.ranked,
      locked: !!this.rec.passwordHash,
    };
  }
}
