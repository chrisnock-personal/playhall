// One game room: who's in it, who sits where, who hosts, the chat, and the
// game being played. Pure logic: the network, the database and timers come
// in through RoomHooks, so the rules here can be tested on their own.
//
// Roles: the host is a flag on the room (rec.hostId) and can also sit in a
// seat. A person in a seat is a player; everyone else present is watching.

import { GAMES } from '../../shared/games';
import { BOTS, BOT_ID_PREFIX, BOT_TALK, LEVELLED, botName, isBotId } from '../../shared/bots';
import { AI_GAMES, aiPrompt, aiReplyPrompt, readAnswer, readSay } from '../../shared/ai';
import { placingsOf } from '../../shared/scoring';
import { seatsIn, type ActResult, type GameContext, type GameModule, type GameResult, type SeatDef, type SeatId, type TeamChat, type TeamVoice, type TextChannel } from '../../shared/game';
import type {
  Channel, ChatLine, ClientMessage, GameStatus, LastResult, MediaRight, MemberView, RoomSettings, RoomSnapshot, RoomSummary, VoiceChannel,
} from '../../shared/protocol';

const NO_MEDIA: MediaRight = { listen: false, talk: false, video: false };

export interface RoomUser {
  id: string;
  name: string;
  guest: boolean;
}

export interface SeatHolder {
  userId: string;
  name: string;
  guest: boolean;
  /** A computer player (#18): its userId is a made-up 'bot:' id. */
  bot?: boolean;
  /** Played by a language model (#32), with the rule bot as its fallback. */
  ai?: boolean;
  /** How strong a bot plays (#62); fair when missing. */
  level?: 'gentle' | 'fair' | 'strong';
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
  /** People the host removed; they can't come back. */
  banned: string[];
  /** Camera table rooms: the device the host made the table camera (a random
   *  id in its link), or none. Making a new link or stopping it replaces it,
   *  which cuts the old device off. */
  tableCamera?: { id: string; since: number } | null;
  seats: Record<SeatId, SeatHolder | null>;
  game: {
    status: GameStatus; state: unknown; startedAt: number | null; players: Record<SeatId, SeatHolder> | null;
    /** When the move timer runs out for whoever's turn it is. */
    moveDeadline?: number | null;
    /** A result the room decided (the move timer), not the game. */
    result?: GameResult | null;
    /** Seats whose player has taken part: was in the room when the game
     *  started, or has acted since. Only they get the reconnect grace (and
     *  forfeit when it runs out); a seat filled for someone who never came
     *  (the demo's games) doesn't. Missing in older saves = none yet. */
    joined?: SeatId[];
    /** Chat line ids from this game onwards. Team channels are numbered by
     *  side, so a new game must not show the last one's private lines. */
    teamChatSince?: number;
    /** Unique LiveKit room generation for this game's private team voice.
     *  Older saves fall back to their start time and chat boundary. */
    voiceId?: string | null;
    /** When the server last had this game loaded and running (kept fresh by
     *  the room manager), so time it spent down or unloaded isn't charged
     *  to anyone's clock or move timer when it's loaded again. */
    aliveAt?: number;
  };
}

export interface RoomHooks {
  now(): number;
  /** A number in [0, 1) for dice and shuffles. */
  random(): number;
  /** Word games: is this word in the word list? */
  isWord?(word: string): boolean;
  /** Could more letters make this a word? (The Letterworks computer player.) */
  isPrefix?(start: string): boolean;
  setTimer(ms: number, fn: () => void): () => void;
  /** The record changed and should be saved. */
  save(rec: RoomRecord): void;
  /** A chat line was added and should be stored. */
  chat(roomId: string, line: ChatLine): void;
  /** A game finished: store it and, if it counts, everyone's result. */
  gameOver(ended: FinishedGame): void;
  /** Something visible changed: send everyone a fresh snapshot. */
  changed(): void;
  /** Disconnect someone (the host removed them). */
  kick(userId: string, reason: string): void;
  /** The server allows transcripts at all (see ../transcripts.ts). */
  transcriptsAllowed?(): boolean;
  /** AI players (#32): switched on by the admin, with a model server. */
  aiAvailable?(): boolean;
  /** Ask the model; null when it can't answer (the rule bot plays then). */
  aiAsk?(system: string, user: string): Promise<string | null>;
  /** A random, unguessable id (the table camera's). */
  newId?(): string;
  /** Progression (#50): why this person can't play this game, or null. */
  canPlay?(userId: string, gameId: string): string | null;
}

/** How long a player who drops out mid-game has to come back. */
export const GRACE_MS = 60_000;
/** Between games, a seated player away this long gives up their seat. */
export const SEAT_AWAY_MS = 5 * 60_000;
/** A host away this long hands the room to someone still in it. */
export const HOST_AWAY_MS = 5 * 60_000;

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

/** How long a bot waits before it moves (up to twice this). */
const BOT_PAUSE_MS = 900;

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
  /** A bot's move waiting to be made (#18). */
  private cancelBot: (() => void) | null = null;
  /** AI players' recent table talk, so they don't chatter or repeat (#32). */
  private aiTalk = new Map<SeatId, { quiet: number; recent: string[] }>();
  /** When each bot last answered a question, so one question gets one answer. */
  private botAnswered = new Map<SeatId, number>();
  private lastResult: LastResult | null = null;
  /** The game's states over time, for watchers who see it late. */
  private history: { at: number; state: unknown }[] = [];
  /** Seats whose player dropped out mid-game: when they forfeit, and the timer. */
  private leaving = new Map<SeatId, { deadline: number; cancel: () => void }>();
  /** Seated people who are away between games, and their timers (by userId). */
  private seatAway = new Map<string, () => void>();
  private hostAway: (() => void) | null = null;
  private endedAt: number | null = null;
  /** After a game: the seated players who asked for a rematch (userIds). */
  private rematch = new Set<string>();

  constructor(readonly rec: RoomRecord, private hooks: RoomHooks, history: ChatLine[] = []) {
    const game = GAMES[rec.gameId];
    if (!game) throw new Error(`Unknown game ${rec.gameId}`);
    this.game = game;
    for (const s of game.seats) if (!(s.id in rec.seats)) rec.seats[s.id] = null;
    this.chatLines = history.slice(-CHAT_KEEP);
    this.nextChatId = (this.chatLines.at(-1)?.id ?? 0) + 1;
    // Older saves have no boundary; keep their team chat closed on load.
    if (rec.game.state && rec.game.teamChatSince === undefined) rec.game.teamChatSince = this.nextChatId;
    this.resume();
    this.armTimer();
    this.scheduleBots();
    // Loaded with nobody in it yet: whoever doesn't come back gives up their
    // seat, and the host their room, after a while.
    for (const h of Object.values(rec.seats)) if (h && !h.bot) this.startSeatAway(h.userId);
    this.startHostAway();
  }

  /** A game loaded mid-play: the time since it was last alive was spent with
   *  the server down or the room unloaded, so hold the clocks for it. */
  private resume(): void {
    const g = this.rec.game;
    if (g.status !== 'playing' || typeof g.aliveAt !== 'number') return;
    const now = this.hooks.now();
    const away = now - g.aliveAt;
    g.aliveAt = now;
    if (away <= 0) return;
    if (this.game.pause && g.state) g.state = this.game.pause(g.state, away);
    if (g.moveDeadline) g.moveDeadline += away;
  }

  /** Note that the game is running now (the manager calls this every few
   *  seconds and before unloading or shutting down). False when there's no
   *  game on, so nothing needs saving. */
  markAlive(): boolean {
    if (this.status !== 'playing') return false;
    this.rec.game.aliveAt = this.hooks.now();
    return true;
  }

  // ---- presence -------------------------------------------------------

  join(user: RoomUser): void {
    const p = this.present.get(user.id);
    if (p) { p.conns++; p.user = user; } else this.present.set(user.id, { user, conns: 1 });
    this.seatAway.get(user.id)?.();
    this.seatAway.delete(user.id);
    if (user.id === this.rec.hostId) { this.hostAway?.(); this.hostAway = null; }
    const seat = this.seatOf(user.id);
    const away = seat ? this.leaving.get(seat) : undefined;
    if (seat && away) { away.cancel(); this.leaving.delete(seat); this.system(`${user.name} is back`); }
    else if (!p && seat && this.status === 'playing' && this.game.keepsDroppedPlayers && this.rec.game.players?.[seat]) this.system(`${user.name} is back`);
    this.hooks.changed();
  }

  /** Someone has the room open now. */
  isHere(userId: string): boolean {
    return this.present.has(userId);
  }

  /** A game is being played now. */
  get playing(): boolean {
    return this.status === 'playing';
  }

  isBanned(userId: string): boolean {
    return (this.rec.banned ?? []).includes(userId);
  }

  leave(userId: string): void {
    const p = this.present.get(userId);
    if (!p) return;
    if (--p.conns > 0) return;
    this.present.delete(userId);
    this.queue = this.queue.filter((id) => id !== userId);
    const seat = this.seatOf(userId);
    if (seat && this.status === 'playing' && this.game.keepsDroppedPlayers && this.rec.game.players && seat in this.rec.game.players) {
      this.system(`${p.user.name} dropped out: the game waits for them`);
    } else if (seat && this.status === 'playing' && this.rec.game.players && seat in this.rec.game.players && !this.leaving.has(seat)
      && this.rec.game.joined?.includes(seat)) {
      const deadline = this.hooks.now() + GRACE_MS;
      const cancel = this.hooks.setTimer(GRACE_MS, () => { this.leaving.delete(seat); this.forfeit(seat); });
      this.leaving.set(seat, { deadline, cancel });
      this.system(`${p.user.name} dropped out: back within a minute or the game goes on without them`);
    }
    if (seat) this.startSeatAway(userId);
    if (userId === this.rec.hostId) this.startHostAway();
    this.hooks.changed();
  }

  /** Between games, a seated person who stays away gives up their seat (not
   *  during a game they're in: there the minute's grace applies). */
  private startSeatAway(userId: string): void {
    if (this.present.has(userId) || this.seatAway.has(userId)) return;
    const cancel = this.hooks.setTimer(SEAT_AWAY_MS, () => {
      this.seatAway.delete(userId);
      const seat = this.seatOf(userId);
      if (!seat || this.present.has(userId)) return;
      if (this.status === 'playing' && this.rec.game.players?.[seat]?.userId === userId) { this.startSeatAway(userId); return; }
      const name = this.rec.seats[seat]!.name;
      this.rec.seats[seat] = null;
      this.system(`${name} was away for ${SEAT_AWAY_MS / 60_000} minutes, so ${this.seatLabel(seat)} is free`);
      this.touch();
    });
    this.seatAway.set(userId, cancel);
  }

  /** A host who stays away hands the room on: to someone seated if there is
   *  one, else anyone in the room with an account. */
  private startHostAway(): void {
    if (this.present.has(this.rec.hostId) || this.hostAway) return;
    this.hostAway = this.hooks.setTimer(HOST_AWAY_MS, () => {
      this.hostAway = null;
      if (this.present.has(this.rec.hostId)) return;
      const here = [...this.present.values()].map((p) => p.user).filter((u) => !u.guest && !isBotId(u.id) && !this.hooks.canPlay?.(u.id, this.rec.gameId));
      const next = here.find((u) => this.seatOf(u.id)) ?? here[0];
      if (!next) { this.startHostAway(); return; }
      const was = this.rec.hostName;
      this.rec.hostId = next.id;
      this.rec.hostName = next.name;
      this.system(`${was} was away for ${HOST_AWAY_MS / 60_000} minutes: ${next.name} is the host now`);
      this.touch();
    });
  }

  /** A player who dropped out didn't come back in time. */
  private forfeit(seat: SeatId): void {
    if (this.status !== 'playing' || !this.rec.game.players) return;
    const others = Object.keys(this.rec.game.players).filter((s) => s !== seat);
    const reason = `${this.rec.game.players[seat]?.name ?? this.seatLabel(seat)} leaving the game`;
    if (others.length === 1) { this.finish({ winner: others[0], reason }); return; }
    const r = this.game.act(this.rec.game.state, seat, { type: 'resign' }, this.hooks.now(), this.context());
    if ('error' in r) { this.finish({ winner: null, reason, aborted: true }); return; }
    this.rec.game.state = r.state;
    this.system(`${reason}: they're out of this game`);
    this.afterChange();
  }

  private clearLeaving(): void {
    for (const l of this.leaving.values()) l.cancel();
    this.leaving.clear();
  }

  /** Standings after the last game, filled in once the results are saved. */
  /** A line in the table chat from Playhall itself (a tier opened, say). */
  announce(text: string): void {
    this.system(text);
    this.hooks.changed();
  }

  setLastResult(r: LastResult | null): void {
    this.lastResult = r;
    this.hooks.changed();
  }

  get presentCount(): number {
    return this.present.size;
  }

  dispose(): void {
    this.clearLeaving();
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.cancelBot?.();
    this.cancelBot = null;
    for (const c of this.seatAway.values()) c();
    this.seatAway.clear();
    this.hostAway?.();
    this.hostAway = null;
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

  /** The seat this person actually played in the game being shown. */
  private playedSeat(userId: string): SeatId | null {
    const state = this.rec.game.state;
    if (!state) return null;
    // After the game, a newcomer in the same seat didn't play this side.
    const seat = this.seatOf(userId);
    if (!seat || this.rec.game.players?.[seat]?.userId !== userId) return null;
    return seat;
  }

  /** A game with teams can offer its players one private text channel (#68).
   *  Watchers and free-for-alls never get one. */
  private teamChatFor(userId: string): TeamChat | null {
    const seat = this.playedSeat(userId);
    const state = this.rec.game.state;
    if (!seat || !state) return null;
    return this.game.teamChat?.(state, seat) ?? null;
  }

  /** A game can also give its players one private, audio-only side channel
   *  (#82). It follows the team chat's rules: only someone who played that
   *  seat, and only while they're here. */
  teamVoiceFor(userId: string): TeamVoice | null {
    if (!this.present.has(userId)) return null;
    const seat = this.playedSeat(userId);
    const state = this.rec.game.state;
    if (!seat || !state) return null;
    return this.game.teamVoice?.(state, seat) ?? null;
  }

  /** Unique room name suffix for this game's team voice. Side numbers are
   *  reused, so without it an old token could rejoin the next game's side. */
  voiceGeneration(): string | null {
    const g = this.rec.game;
    if (!g.state || !g.players) return null;
    return g.voiceId ?? `${g.startedAt ?? 0}:${g.teamChatSince ?? 0}`;
  }

  /** Side channels in the current game, so media sync checks them too. */
  teamVoiceChannels(): `team-${number}`[] {
    const state = this.rec.game.state;
    if (!state || !this.game.teamVoice) return [];
    const out = new Set<`team-${number}`>();
    for (const [seat] of Object.entries(this.rec.game.players ?? {})) {
      const voice = this.game.teamVoice(state, seat);
      if (voice) out.add(voice.channel);
    }
    return [...out];
  }

  /** Rights for any voice channel, including a game's private side channel. */
  voiceRight(userId: string, channel: VoiceChannel): MediaRight | null {
    if (channel === 'table' || channel === 'gallery') return this.mediaRights(userId)?.[channel] ?? null;
    if (!this.present.has(userId)) return null;
    const voice = this.teamVoiceFor(userId);
    const chat = this.teamChatFor(userId);
    if (!voice || !chat || voice.channel !== channel || chat.channel !== channel) return null;
    return { listen: true, talk: !chat.readOnly, video: false };
  }

  canRead(userId: string): TextChannel[] {
    const seated = this.seatOf(userId) !== null;
    const galleryHidden = seated && this.rec.settings.hideGalleryFromPlayers && this.status === 'playing';
    const open: TextChannel[] = galleryHidden ? ['table'] : ['table', 'gallery'];
    const team = this.teamChatFor(userId);
    return team ? [...open, team.channel] : open;
  }

  canWrite(userId: string): TextChannel[] {
    const seated = this.seatOf(userId) !== null;
    const team = this.teamChatFor(userId);
    if (seated) return team && !team.readOnly ? ['table', team.channel] : ['table'];
    const table = this.isHost(userId) || this.rec.settings.watchersWriteTable || this.status !== 'playing';
    return table ? ['table', 'gallery'] : ['gallery'];
  }

  /** Voice and video follow the chat: you can hear (and see) a channel you
   *  can read and talk in one you can write. Watchers on a delay neither hear
   *  nor see the table live (it would give the game away ahead of what they
   *  see). Cameras: players send theirs to the table (their seat cards);
   *  watchers send theirs to the gallery, only when the host allows watcher
   *  video. Null when you're not in the room. */
  mediaRights(userId: string): Record<Channel, MediaRight> | null {
    if (!this.present.has(userId)) return null;
    const read = this.canRead(userId), write = this.canWrite(userId);
    const seated = this.seatOf(userId) !== null;
    const delayed = !seated && this.rec.settings.watcherDelay > 0 && this.status === 'playing';
    const right = (c: Channel): MediaRight => {
      const listen = read.includes(c) && !(c === 'table' && delayed);
      const talk = listen && write.includes(c);
      const video = talk && (seated ? c === 'table' : c === 'gallery' && this.rec.settings.watcherVideo);
      return { listen, talk, video };
    };
    return { table: right('table'), gallery: right('gallery') };
  }

  // ---- the table camera ----------------------------------------------
  // A camera table room's board camera is a device, not a person: it joins
  // the table's video with a link the host made (see ../media.ts), takes no
  // seat, hears and sees nothing, and sends only its camera.

  /** The device id for the host's table camera link: the current one, or a
   *  new one (`fresh`, or none yet), which cuts off any device using the old. */
  tableCameraId(fresh = false): string {
    if (!this.game.tableCamera) throw new RoomError('Only camera table rooms have a table camera');
    if (!this.rec.tableCamera || fresh) {
      this.rec.tableCamera = { id: this.hooks.newId?.() ?? Math.random().toString(36).slice(2, 14), since: this.hooks.now() };
      this.touch();
    }
    return this.rec.tableCamera.id;
  }

  /** The host stopped the table camera: its link stops working. */
  stopTableCamera(): void {
    if (!this.rec.tableCamera) return;
    this.rec.tableCamera = null;
    this.system('The host stopped the table camera');
    this.touch();
  }

  /** Is this the room's table camera now? */
  isTableCamera(id: string): boolean {
    return !!this.game.tableCamera && !!id && this.rec.tableCamera?.id === id;
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
      case 'hostAct': this.hostOnly(user); return this.hostAct(user, msg.action);
      case 'rematch': return this.askRematch(user, msg.want !== false);
      case 'start': this.hostOnly(user); return this.start();
      case 'seat': this.hostOnly(user); return this.seatSomeone(msg.userId, msg.seat);
      case 'unseat': this.hostOnly(user); return this.unseat(msg.userId);
      case 'addBot': this.hostOnly(user); return this.addBot(msg.seat, msg.ai === true, msg.level);
      case 'makeHost': this.hostOnly(user); return this.makeHost(msg.userId);
      case 'kick': this.hostOnly(user); return this.kick(user, msg.userId);
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
    if (!this.seatDefs.some((s) => s.id === seat)) throw new RoomError('No such seat');
  }

  /** The seats in use (all the game's, or as many as its settings say). */
  get seatDefs(): SeatDef[] {
    return seatsIn(this.game, this.rec.settings.gameConfig);
  }

  private checkCanPlay(user: { id?: string; guest: boolean }): void {
    if (user.guest && !this.rec.settings.guestsCanPlay) throw new RoomError('Guests can watch but not play in this room');
    const locked = user.id ? this.hooks.canPlay?.(user.id, this.rec.gameId) : null;
    if (locked) throw new RoomError(locked);
  }

  private place(holder: SeatHolder, seat: SeatId): void {
    const old = this.seatOf(holder.userId);
    if (old) this.rec.seats[old] = null;
    this.rec.seats[seat] = holder;
    this.rematch.delete(holder.userId);
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
    this.rematch.delete(user.id);
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

  private chat(user: RoomUser, channel: TextChannel, text: unknown): void {
    const team = this.teamChatFor(user.id)?.channel;
    if (channel !== 'table' && channel !== 'gallery' && channel !== team) throw new RoomError('No such chat');
    if (!this.canWrite(user.id).includes(channel)) {
      throw new RoomError(channel === 'table' ? 'Watchers can’t write at the table during play'
        : channel === 'gallery' ? 'Players can’t write in the gallery' : 'You can read this team chat but not write in it');
    }
    const body = typeof text === 'string' ? text.trim() : '';
    if (!body) return;
    if (body.length > CHAT_MAX) throw new RoomError(`Keep messages under ${CHAT_MAX} characters`);
    this.addLine({ channel, kind: 'typed', userId: user.id, name: user.name, text: body });
    if (channel === 'table' && this.rec.settings.watcherDelay) this.hooks.setTimer(this.rec.settings.watcherDelay * 1000 + 50, () => this.hooks.changed());
    if (channel === 'table') this.botsHear(body);
    this.hooks.changed();
  }

  /** Can this person's speech in this channel be written into the chat now?
   *  Null if so, else why not. */
  saidRefusal(userId: string, channel: Channel): string | null {
    if (!this.rec.settings.transcripts) return 'Transcripts are off in this room';
    if (!(this.hooks.transcriptsAllowed?.() ?? false)) return 'Transcripts are switched off on this server';
    if (!this.mediaRights(userId)?.[channel]?.talk) return 'You can’t talk in that channel now';
    return null;
  }

  /** A line someone said in voice, transcribed: like a typed line, kind 'said'. */
  said(userId: string, channel: Channel, text: string): void {
    const why = this.saidRefusal(userId, channel);
    if (why) throw new RoomError(why);
    const user = this.present.get(userId)!.user;
    const body = text.trim().slice(0, CHAT_MAX);
    if (!body) return;
    this.addLine({ channel, kind: 'said', userId, name: user.name, text: body });
    if (channel === 'table' && this.rec.settings.watcherDelay) this.hooks.setTimer(this.rec.settings.watcherDelay * 1000 + 50, () => this.hooks.changed());
    if (channel === 'table') this.botsHear(body);
    this.hooks.changed();
  }

  /** Someone at the table asked something: any bot or AI player it's put to
   *  answers, after a moment (Ship2Shore: what orders they had). */
  private botsHear(text: string): void {
    const talk = BOT_TALK[this.rec.gameId];
    if (!talk || this.status !== 'playing') return;
    const names = this.context().names ?? {};
    const now = this.hooks.now();
    for (const [seat, h] of Object.entries(this.rec.game.players ?? {})) {
      if (!h.bot) continue;
      const view = this.game.view(this.rec.game.state, now, seat);
      if (!talk.asked(view, seat, text, names)) continue;
      if (now - (this.botAnswered.get(seat) ?? 0) < 4000) continue;
      this.botAnswered.set(seat, now);
      this.hooks.setTimer(1500 + Math.floor(this.hooks.random() * 1500), () => this.botAnswer(seat, text, 0));
    }
  }

  /** A bot's answer, once it may talk (not on the bridge while plotting). */
  private botAnswer(seat: SeatId, question: string, tries: number): void {
    const talk = BOT_TALK[this.rec.gameId];
    const holder = this.rec.game.players?.[seat];
    if (!talk || !holder || this.status !== 'playing') return;
    const view = this.game.view(this.rec.game.state, this.hooks.now(), seat);
    if (!talk.canTalk(view, seat)) {
      if (tries < 20) this.hooks.setTimer(3000, () => this.botAnswer(seat, question, tries + 1));
      return;
    }
    const rule = talk.answer(view, seat, () => this.hooks.random());
    const say = (text: string | null) => {
      if (!text || this.status !== 'playing') return;
      this.addLine({ channel: 'table', kind: 'typed', userId: holder.userId, name: holder.name, text: text.slice(0, CHAT_MAX) });
      this.hooks.changed();
    };
    const ai = AI_GAMES[this.rec.gameId];
    const truth = talk.truth(view, seat);
    if (holder.ai && ai && truth && this.aiPlayers) {
      const names = this.context().names ?? {};
      const chat = this.chatLines.filter((l) => l.channel === 'table' && l.kind !== 'system').slice(-12).map((l) => `${l.name}: ${l.text}`);
      const { system, user } = aiReplyPrompt(ai, view, seat, names, chat, question, truth);
      this.hooks.aiAsk!(system, user).then((t) => say((t && readSay(t)) ?? rule), () => say(rule));
      return;
    }
    say(rule);
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
    this.accept(r, seat);
  }

  /** Games the host runs (the camera table): the host acts, seated or not. */
  private hostAct(user: RoomUser, action: unknown): void {
    if (this.status !== 'playing') throw new RoomError('No game is being played');
    if (!this.game.hostAct) throw new RoomError('Unknown request');
    const r = this.game.hostAct(this.rec.game.state, action, this.hooks.now(), this.context());
    const seat = this.seatOf(user.id);
    this.accept(r, seat && this.rec.game.players && seat in this.rec.game.players ? seat : null);
  }

  /** An action the game accepted (or refused): post what it says, then carry on. */
  private accept(r: ActResult<unknown>, seat: SeatId | null): void {
    if ('error' in r) throw new RoomError(r.error);
    this.rec.game.state = r.state;
    if (seat && !this.rec.game.joined?.includes(seat)) this.rec.game.joined = [...(this.rec.game.joined ?? []), seat];
    for (const line of r.say ?? []) this.system(line.slice(0, CHAT_MAX));
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
    this.scheduleBots();
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
    const playing = this.rec.game.status === 'playing' && this.rec.game.players;
    const holders: Record<SeatId, SeatHolder | null> = playing ? this.rec.game.players! : this.rec.seats;
    const seats = (playing ? this.game.seats : this.seatDefs).map((s) => s.id).filter((id) => holders[id]);
    const names = Object.fromEntries(seats.map((id) => [id, holders[id]!.name]));
    const hostSeat = this.seatOf(this.rec.hostId);
    return {
      seats, random: () => this.hooks.random(), isWord: this.hooks.isWord, names,
      host: { name: this.rec.hostName, seat: hostSeat && seats.includes(hostSeat) ? hostSeat : null },
    };
  }

  /** Players can start the next game themselves when they all agree,
   *  except in rooms where the host seats people (the host decides there). */
  get playersCanRematch(): boolean {
    return this.rec.settings.seatPolicy !== 'host';
  }

  /** Who has to agree to a rematch: everyone seated for the next game (the
   *  room's after-game rule has already moved people when the game ended). */
  private rematchNeeded(): string[] {
    return this.seatDefs.map((s) => this.rec.seats[s.id]?.userId).filter((id): id is string => !!id && !isBotId(id));
  }

  /** The seated players who agreed to a rematch, in seat order. */
  rematchAgreed(): string[] {
    return this.rematchNeeded().filter((id) => this.rematch.has(id));
  }

  private askRematch(user: RoomUser, want: boolean): void {
    if (this.status !== 'over') throw new RoomError('A rematch is for after a game');
    if (!this.seatOf(user.id)) throw new RoomError('Only players can ask for a rematch');
    if (!this.playersCanRematch) throw new RoomError('The host starts the next game in this room');
    if (!want) {
      if (this.rematch.delete(user.id)) this.system(`${user.name} took back the rematch request`);
      this.hooks.changed();
      return;
    }
    if (this.rematch.has(user.id)) return;
    this.rematch.add(user.id);
    const needed = this.rematchNeeded();
    // Bots never vote: every seated human must agree, whether or not bots
    // fill the other seats (which can include seats needed to start).
    if (needed.length > 0 && needed.every((id) => this.rematch.has(id))) {
      this.system('Everyone agreed to a rematch');
      this.start();
      return;
    }
    this.system(`${user.name} wants a rematch`);
    this.hooks.changed();
  }

  /** Fewest players to start this game. */
  get minPlayers(): number {
    return this.game.minPlayers ?? this.seatDefs.length;
  }

  private start(): void {
    if (this.status === 'playing') throw new RoomError('A game is already on');
    const defs = this.seatDefs;
    const seated = defs.filter((s) => this.rec.seats[s.id]);
    if (seated.length < this.minPlayers) {
      throw new RoomError(this.minPlayers === defs.length
        ? `Fill every seat first (${defs.filter((s) => !this.rec.seats[s.id]).map((s) => s.label).join(', ')})`
        : `${this.game.name} needs at least ${this.minPlayers} players`);
    }
    const config = this.game.parseConfig(this.rec.settings.gameConfig);
    const now = this.hooks.now();
    const players: Record<SeatId, SeatHolder> = {};
    for (const s of seated) players[s.id] = this.rec.seats[s.id]!;
    const ctx: GameContext = {
      seats: seated.map((s) => s.id), random: () => this.hooks.random(), isWord: this.hooks.isWord,
      names: Object.fromEntries(seated.map((s) => [s.id, players[s.id].name])),
      host: { name: this.rec.hostName, seat: this.seatOf(this.rec.hostId) },
    };
    const joined = seated.map((s) => s.id).filter((id) => this.present.has(players[id].userId));
    this.rec.game = {
      status: 'playing', state: this.game.create(config, now, ctx), startedAt: now, players, result: null, moveDeadline: null, joined,
      teamChatSince: this.nextChatId, voiceId: this.hooks.newId?.() ?? `${now}:${this.nextChatId}`, aliveAt: now,
    };
    this.lastResult = null;
    this.rematch.clear();
    this.aiTalk.clear();
    this.botAnswered.clear();
    this.history = [{ at: now, state: this.rec.game.state }];
    this.endedAt = null;
    this.resetMoveDeadline();
    const who = seated.map((s) => `${s.label} ${players[s.id].name}`).join(', ');
    this.system(`Game started: ${who} · ${this.game.describeConfig(config)}`);
    // Anyone seated but not here gets the same minute as someone who drops out.
    if (!this.game.keepsDroppedPlayers) {
      for (const s of seated) {
        const h = players[s.id];
        if (h.bot || this.present.has(h.userId) || this.leaving.has(s.id)) continue;
        const cancel = this.hooks.setTimer(GRACE_MS, () => { this.leaving.delete(s.id); this.forfeit(s.id); });
        this.leaving.set(s.id, { deadline: now + GRACE_MS, cancel });
        this.system(`${h.name} isn\u2019t here: back within a minute or the game goes on without them`);
      }
    }
    this.armTimer();
    this.scheduleBots();
    this.touch();
  }

  private finish(result: GameResult): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.cancelBot?.();
    this.cancelBot = null;
    const players = this.rec.game.players ?? {};
    this.rec.game.status = 'over';
    this.clearLeaving();
    this.rec.game.result = result;
    this.endedAt = this.hooks.now();
    this.record();
    this.rec.game.moveDeadline = null;
    const placings = placingsOf(result, Object.keys(players));
    const who = (seat: SeatId) => `${players[seat]?.name ?? this.seatLabel(seat)} (${this.seatLabel(seat)})`;
    let line = placings[0].length === 1 || result.teamWin ? `${placings[0].map(who).join(', ')} won` : 'Draw';
    if (placings[0].length === 1 && !result.teamWin && placings[1]?.length && Object.keys(players).length >= 3) {
      line += `, ${placings[1].map(who).join(' and ')} second`;
    }
    this.system(result.aborted ? `Game stopped: ${result.reason}` : `${line} by ${result.reason}`);
    const guests = Object.values(players).some((p) => p.guest);
    const bots = Object.values(players).some((p) => p.bot);
    const note = result.aborted ? 'The game was stopped, so it doesn\u2019t count.'
      : !this.rec.settings.ranked ? 'This room is casual: games here don\u2019t count for the leaderboards.'
        : bots ? 'A computer player played, so this game doesn\u2019t count for the leaderboards.'
        : guests ? 'A guest played, so this game doesn\u2019t count for the leaderboards.'
          : Object.keys(players).length < 2 ? 'A game with one player is practice: it doesn\u2019t count for the leaderboards.' : null;
    this.hooks.gameOver({ rec: this.rec, result, state: this.rec.game.state, players, counted: note === null, note });
    this.nextPlayers(result);
    this.touch();
  }

  /** Apply the room's "after each game" rule, seating people from the queue. */
  private nextPlayers(result: GameResult): void {
    const policy = this.rec.settings.afterGame;
    if (policy === 'same') return;
    let free: SeatId[];
    if (policy === 'rotate') free = this.seatDefs.map((s) => s.id);
    else {
      // Winner stays: everyone but a sole winner makes way.
      const first = placingsOf(result, Object.keys(this.rec.game.players ?? {}))[0];
      if (first.length !== 1) return;
      free = this.seatDefs.map((s) => s.id).filter((id) => id !== first[0] && this.rec.seats[id]);
    }
    for (const seat of free) {
      const nextId = this.queue.find((id) => {
        const p = this.present.get(id);
        return p && (!p.user.guest || this.rec.settings.guestsCanPlay) && !this.hooks.canPlay?.(id, this.rec.gameId);
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

  /** The host puts a computer player in a free seat (games with bots). */
  private addBot(seat: SeatId, ai = false, level?: 'gentle' | 'fair' | 'strong'): void {
    if (!BOTS[this.rec.gameId]) throw new RoomError(`${this.game.name} has no computer players yet`);
    if (ai && !this.aiPlayers) throw new RoomError(`AI players aren\u2019t available for ${this.game.name} on this server`);
    this.checkSeat(seat);
    if (this.status === 'playing') throw new RoomError('End the game first');
    if (this.rec.seats[seat]) throw new RoomError('That seat is taken');
    const lv = !ai && level && level !== 'fair' && LEVELLED.includes(this.rec.gameId) ? level : undefined;
    const name = botName(Object.values(this.rec.seats).map((h) => h?.name ?? ''), ai ? 'AI' : lv ? `${lv} bot` : 'bot');
    const id = `${BOT_ID_PREFIX}${Math.floor(this.hooks.random() * 1e12).toString(36)}`;
    this.place({ userId: id, name, guest: false, bot: true, ...(ai ? { ai: true } : {}), ...(lv ? { level: lv } : {}) }, seat);
    this.system(`The host added ${name} as ${this.seatLabel(seat)}`);
    this.touch();
  }

  /** A practice room (#57): gentle bots in every free seat the game needs
   *  (at least one opponent), never more than its seats. */
  fillWithBots(level: 'gentle' | 'fair' | 'strong' = 'gentle'): void {
    if (!BOTS[this.rec.gameId]) return;
    const seats = this.seatDefs.map((s) => s.id);
    const want = Math.min(seats.length, Math.max(2, this.minPlayers));
    for (const seat of seats) {
      if (Object.values(this.rec.seats).filter(Boolean).length >= want) break;
      if (!this.rec.seats[seat]) this.addBot(seat, false, level);
    }
  }

  /** If the game is waiting for a bot, have it move after a short pause, so
   *  people can follow what it did. One move at a time; each move schedules
   *  the next. */
  private scheduleBots(): void {
    if (this.cancelBot || this.status !== 'playing' || !BOTS[this.rec.gameId]) return;
    const players = this.rec.game.players ?? {};
    const due = this.waitingFor().filter((seat) => players[seat]?.bot);
    if (!due.length) return;
    this.cancelBot = this.hooks.setTimer(BOT_PAUSE_MS + Math.floor(this.hooks.random() * BOT_PAUSE_MS), () => {
      this.cancelBot = null;
      this.botMove();
    });
  }

  /** Who the game is waiting on (for bots). */
  private waitingFor(): SeatId[] {
    const st = this.rec.game.state;
    return (this.game.waitingFor ?? this.game.turn)?.call(this.game, st) ?? [];
  }

  /** A bot's move: what it decides from its own view, or the game's
   *  out-of-time move if it has no answer or its answer is refused. */
  private botMove(): void {
    if (this.status !== 'playing') return;
    const players = this.rec.game.players ?? {};
    const seat = this.waitingFor().find((s) => players[s]?.bot);
    if (!seat) return;
    if (players[seat].ai && this.askAi(seat)) return;
    this.ruleMove(seat);
  }

  /** The rule bot's move for `seat`, or the out-of-time move if it's refused. */
  private ruleMove(seat: SeatId): void {
    const now = this.hooks.now();
    const words = this.hooks.isWord && this.hooks.isPrefix ? { isWord: this.hooks.isWord, isPrefix: this.hooks.isPrefix } : undefined;
    const level = (this.rec.game.players ?? this.rec.seats)[seat]?.level ?? 'fair';
    const action = BOTS[this.rec.gameId](this.game.view(this.rec.game.state, now, seat), seat, () => this.hooks.random(), words, level);
    const r = action === null ? null : this.game.act(this.rec.game.state, seat, action, now, this.context());
    if (r && !('error' in r)) { this.accept(r, seat); return; }
    if (this.game.timeout) {
      this.rec.game.state = this.game.timeout(this.rec.game.state, seat, now, this.context());
      this.afterChange();
    }
  }

  /** What an AI player may say now, if anything: after speaking it stays
   *  quiet for its next two decisions, and it never says the same thing twice
   *  running. Models asked to talk "now and then" talk every time. */
  private aiLine(seat: SeatId, text: string): string | null {
    const t = this.aiTalk.get(seat) ?? { quiet: 0, recent: [] };
    this.aiTalk.set(seat, t);
    if (t.quiet > 0) { t.quiet--; return null; }
    const key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (!key || t.recent.includes(key)) return null;
    t.recent = [...t.recent, key].slice(-6);
    t.quiet = 2;
    return text.slice(0, CHAT_MAX);
  }

  /** AI players are available in this room: the game has them and the admin set them up. */
  private get aiPlayers(): boolean {
    return !!AI_GAMES[this.rec.gameId] && !!this.hooks.aiAvailable?.() && !!this.hooks.aiAsk;
  }

  /** An AI seat's decision: ask the model, without holding the room up.
   *  False when the model isn't asked (the rule bot moves now instead). */
  private askAi(seat: SeatId): boolean {
    const ai = AI_GAMES[this.rec.gameId];
    if (!ai || !this.aiPlayers) return false;
    const state = this.rec.game.state;
    const view = this.game.view(state, this.hooks.now(), seat);
    if (ai.modelDecides && !ai.modelDecides(view)) return false;
    const options = ai.options(view, seat, this.context().names ?? {});
    if (options.length < 2) return false;
    const names = this.context().names ?? {};
    const chat = this.chatLines.filter((l) => l.channel === 'table' && l.kind !== 'system').slice(-12).map((l) => `${l.name}: ${l.text}`);
    const { system, user } = aiPrompt(ai, view, seat, names, chat, options);
    let live = true;
    this.cancelBot = () => { live = false; };
    this.hooks.aiAsk!(system, user).then((text) => {
      if (!live) return;
      this.cancelBot = null;
      // The game moved on while the model thought (a resign, the host): drop it.
      if (this.status !== 'playing' || this.rec.game.state !== state) { this.scheduleBots(); return; }
      const answer = text === null ? null : readAnswer(text, options.length);
      const chosen = answer ? options[answer.choice - 1].action : null;
      const r = answer && this.game.act(state, seat, chosen, this.hooks.now(), this.context());
      if (!r || 'error' in r) { this.ruleMove(seat); return; }
      const holder = this.rec.game.players?.[seat];
      // Games that talk about their move write the line now, from the choice
      // the model made; others still use the line it wrote in its answer.
      const words = ai.describeChoice
        ? ai.describeChoice(view, seat, chosen, names)
        : (answer?.say && ai.canTalk(view, seat) ? answer.say : null);
      const said = words && holder ? this.aiLine(seat, words) : null;
      if (said) this.addLine({ channel: 'table', kind: 'typed', userId: holder!.userId, name: holder!.name, text: said });
      this.accept(r, seat);
    }, () => { if (live) { this.cancelBot = null; this.ruleMove(seat); } });
    return true;
  }

  private unseat(userId: string): void {
    const seat = this.seatOf(userId);
    if (!seat) return;
    const name = this.rec.seats[seat]!.name;
    if (this.status === 'playing') this.finish({ winner: null, reason: 'the host moved a player to watching', aborted: true });
    // finish() may have reseated people; look the seat up again.
    const now = this.seatOf(userId);
    if (now) this.rec.seats[now] = null;
    this.system(isBotId(userId) ? `The host removed ${name}` : `The host moved ${name} to watching`);
    this.touch();
  }

  /** Remove someone from the room for good. */
  private kick(host: RoomUser, userId: string): void {
    if (userId === host.id) throw new RoomError('You can\u2019t remove yourself');
    const name = this.present.get(userId)?.user.name ?? Object.values(this.rec.seats).find((h) => h?.userId === userId)?.name;
    if (!name) throw new RoomError('They\u2019re not in the room');
    const seat = this.seatOf(userId);
    if (seat) {
      if (this.status === 'playing' && this.rec.game.players && seat in this.rec.game.players) {
        this.finish({ winner: null, reason: `the host removing ${name}`, aborted: true });
      }
      const now = this.seatOf(userId);
      if (now) this.rec.seats[now] = null;
    }
    this.queue = this.queue.filter((id) => id !== userId);
    this.rec.banned = [...new Set([...(this.rec.banned ?? []), userId])];
    this.present.delete(userId);
    this.system(`The host removed ${name} from the room`);
    this.hooks.kick(userId, 'The host removed you from this room.');
    this.touch();
  }

  private makeHost(userId: string): void {
    const p = this.present.get(userId);
    if (!p) throw new RoomError('They’re not in the room');
    if (p.user.guest) throw new RoomError('Guests can’t host: they need an account');
    if (this.hooks.canPlay?.(userId, this.rec.gameId)) throw new RoomError(`${p.user.name} can’t host this game yet: it isn’t open on their ladder`);
    this.rec.hostId = userId;
    this.rec.hostName = p.user.name;
    this.system(`${p.user.name} is now the host`);
    this.touch();
  }

  private updateSettings(raw: Partial<RoomSettings>): void {
    const s = { ...this.rec.settings };
    const r = raw ?? {};
    const bool = (k: 'listed' | 'guestsCanPlay' | 'hideGalleryFromPlayers' | 'watchersWriteTable' | 'watcherVideo') => {
      if (typeof r[k] === 'boolean') s[k] = r[k] as boolean;
    };
    bool('listed'); bool('guestsCanPlay'); bool('hideGalleryFromPlayers'); bool('watchersWriteTable'); bool('watcherVideo');
    if (typeof r.transcripts === 'boolean' && r.transcripts !== s.transcripts) {
      if (r.transcripts && !(this.hooks.transcriptsAllowed?.() ?? false)) throw new RoomError('Transcripts are switched off on this server');
      s.transcripts = r.transcripts;
      this.system(r.transcripts
        ? 'The host turned transcripts on: what people say in voice is written into the chat'
        : 'The host turned transcripts off');
    }
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
      const bad = this.game.configError?.(r.gameConfig);
      if (bad) throw new RoomError(bad);
      s.gameConfig = this.game.parseConfig(r.gameConfig);
    }
    this.rec.settings = s;
    // Fewer seats (the camera table): whoever sat in a seat that's gone watches.
    const inUse = new Set(this.seatDefs.map((d) => d.id));
    for (const [seat, h] of Object.entries(this.rec.seats)) {
      if (h && !inUse.has(seat)) { this.rec.seats[seat] = null; this.system(`${h.name} is watching: the ${this.seatLabel(seat)} seat is gone`); }
    }
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
    this.markAlive();
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
        online: this.present.has(userId) || isBotId(userId),
        ...(isBotId(userId) ? { bot: true } : {}),
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
      turnSeats: g.status === 'playing' && g.state && !this.game.noTurns ? this.waitingFor() : [],
      moveDeadline: g.status === 'playing' ? g.moveDeadline ?? null : null,
      leaving: Object.fromEntries([...this.leaving].map(([seat, l]) => [seat, l.deadline])),
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
      turnSeats: this.game.noTurns ? [] : (this.game.waitingFor ?? this.game.turn)?.call(this.game, entry.state) ?? [],
      moveDeadline: null,
      leaving: {},
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
        minPlayers: this.minPlayers,
        transcriptsAllowed: this.hooks.transcriptsAllowed?.() ?? false,
        tableCamera: this.game.tableCamera ? { on: !!this.rec.tableCamera } : null,
        aiPlayers: this.aiPlayers,
      },
      seats: this.seatDefs.map((s) => ({
        id: s.id, label: s.label, userId: this.rec.seats[s.id]?.userId ?? null, name: this.rec.seats[s.id]?.name ?? null,
        ...(this.rec.seats[s.id]?.bot ? { bot: true } : {}),
        ...(this.rec.seats[s.id]?.ai ? { ai: true } : {}),
      })),
      members: this.members(),
      queue: [...this.queue],
      lastResult: this.lastResult,
      rematch: this.status === 'over' ? { allowed: this.playersCanRematch, agreed: this.rematchAgreed() } : null,
      game: this.gameFor(userId, now),
      // Delayed watchers get the table (the players' talk) late too; the gallery stays live.
      // Team channels are numbered by side, so only the current game's lines
      // are visible: the next side to sit there mustn't read its predecessor.
      chat: this.chatLines.filter((l) => canRead.includes(l.channel)
        && !(l.channel === 'table' && delayMs && l.at > now - delayMs)
        && (!l.channel.startsWith('team-') || l.id >= (this.rec.game.teamChatSince ?? Infinity))),
      you: {
        userId,
        host: this.isHost(userId),
        seat: this.seatOf(userId),
        canRead,
        canWrite: this.canWrite(userId),
        teamChat: this.teamChatFor(userId),
        teamVoice: this.teamVoiceFor(userId),
        delay: this.delayFor(userId),
        media: this.mediaRights(userId) ?? { table: NO_MEDIA, gallery: NO_MEDIA },
        locked: this.hooks.canPlay?.(userId, this.rec.gameId) ?? null,
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
      seats: this.seatDefs.map((s) => ({
        id: s.id, label: s.label, userId: this.rec.seats[s.id]?.userId ?? null, name: this.rec.seats[s.id]?.name ?? null,
        ...(this.rec.seats[s.id]?.bot ? { bot: true } : {}),
        ...(this.rec.seats[s.id]?.ai ? { ai: true } : {}),
      })),
      watching: [...this.present.keys()].filter((id) => !seated.has(id)).length,
      listed: this.rec.settings.listed,
      ranked: this.rec.settings.ranked,
      locked: !!this.rec.passwordHash,
    };
  }
}
