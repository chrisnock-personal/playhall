// Messages between the browser and the room over the WebSocket (/ws), and
// the snapshot of a room each person is sent after every change.
import type { GameResult, SeatId, TextChannel } from './game';

export type { TextChannel } from './game';
/** Voice and video channels. Team channels are text only. */
export type Channel = 'table' | 'gallery';

export interface RoomSettings {
  /** A practice room (#57): one person learning a game against gentle bots,
   *  with the coach showing; private and casual. */
  practice?: boolean;
  /** Shown in the lobby to everyone, or only reachable by invite link. */
  listed: boolean;
  /** open: anyone may take a free seat; host: only the host seats people
   *  (watchers ask with a raised hand). */
  seatPolicy: 'open' | 'host';
  guestsCanPlay: boolean;
  /** Players can't read the gallery while a game is on. */
  hideGalleryFromPlayers: boolean;
  /** Watchers may write in the table chat while a game is on. */
  watchersWriteTable: boolean;
  /** Who plays the next game: the same players, the winner and the next in
   *  the queue, or the next two in the queue. */
  afterGame: 'same' | 'winnerStays' | 'rotate';
  /** Seconds each player has for a move, 0 = no limit (games with their
   *  own clocks, like chess, don't use it). */
  moveSeconds: number;
  /** Watchers see the game (and the table chat) this many seconds late,
   *  so nobody can pass moves to a player. 0 = live (the default). */
  watcherDelay: number;
  /** Watchers may turn on their cameras; their video shows in the gallery
   *  strip for everyone who can read the gallery. Off by default. */
  watcherVideo: boolean;
  /** Finished games here count for the leaderboards (between account
   *  holders). Off makes a casual room. */
  ranked: boolean;
  /** What people say in voice is written into the chat as *said* lines
   *  (speech to text on the server's Whisper). Off by default. */
  transcripts: boolean;
  /** The game's own settings (for chess, the time control). */
  gameConfig: unknown;
}

export const DEFAULT_SETTINGS: Omit<RoomSettings, 'gameConfig'> = {
  practice: false,
  listed: true,
  seatPolicy: 'open',
  guestsCanPlay: true,
  hideGalleryFromPlayers: true,
  watchersWriteTable: false,
  afterGame: 'same',
  ranked: true,
  transcripts: false,
  moveSeconds: 0,
  watcherDelay: 0,
  watcherVideo: false,
};

/** What someone may do in one voice and video channel: hear and see it,
 *  talk in it, and send their camera to it. */
export interface MediaRight { listen: boolean; talk: boolean; video: boolean }

export interface MemberView {
  userId: string;
  name: string;
  guest: boolean;
  online: boolean;
  host: boolean;
  seat: SeatId | null;
  hand: boolean;
  /** A computer player (#18). */
  bot?: boolean;
}

export interface ChatLine {
  id: number;
  channel: TextChannel;
  /** typed in the chat, said in voice (transcribed), or from the room. */
  kind: 'typed' | 'said' | 'system';
  userId: string | null;
  name: string;
  text: string;
  at: number;
}

export interface SeatView {
  id: SeatId;
  label: string;
  userId: string | null;
  name: string | null;
  /** A computer player sits here (#18). */
  bot?: boolean;
  /** ...played by a language model (#32). */
  ai?: boolean;
}

export type GameStatus = 'idle' | 'playing' | 'over';

export interface RoomSnapshot {
  room: {
    id: string;
    code: string;
    name: string;
    gameId: string;
    gameName: string;
    configLabel: string;
    hostId: string;
    settings: RoomSettings;
    /** Needs a password to join. */
    locked: boolean;
    /** The game has turns, so the move timer applies. */
    moveTimer: boolean;
    /** Fewest players needed to start. */
    minPlayers: number;
    /** This server allows transcripts at all (the room rule needs it). */
    transcriptsAllowed: boolean;
    /** Camera table rooms: whether the host has a table camera link out
     *  (null in other games). */
    tableCamera: { on: boolean } | null;
    /** The host can add AI players here (#32): the game has them and the admin set them up. */
    aiPlayers?: boolean;
  };
  seats: SeatView[];
  members: MemberView[];
  /** userIds with a raised hand, oldest first. */
  queue: string[];
  game: {
    status: GameStatus; view: unknown; result: GameResult | null;
    /** Whose turn it is, and when the move timer runs out for them. */
    turnSeats: SeatId[]; moveDeadline: number | null;
    /** Players who dropped out mid-game, and when they forfeit if not back. */
    leaving: Record<SeatId, number>;
  };
  /** Points and standings from the game that just ended, until the next starts. */
  lastResult: LastResult | null;
  /** After a game: whether players can start a rematch by all agreeing
   *  (not in rooms where the host seats people), and who has (userIds). */
  rematch: { allowed: boolean; agreed: string[] } | null;
  chat: ChatLine[];
  you: {
    userId: string;
    host: boolean;
    seat: SeatId | null;
    canRead: TextChannel[];
    canWrite: TextChannel[];
    /** This player's private team chat, when the game has teams (Realm Battle). */
    teamChat: { channel: TextChannel; label: string } | null;
    /** Seconds behind live that this person sees the game (watchers only). */
    delay: number;
    /** Voice and video rights in each channel (the server enforces them). */
    media: Record<Channel, MediaRight>;
    /** Progression (#50): why this person can't play this room's game, or null. */
    locked?: string | null;
  };
  serverNow: number;
}

export type ClientMessage =
  | { t: 'sit'; seat: SeatId }
  | { t: 'stand' }
  | { t: 'hand'; up: boolean }
  | { t: 'chat'; channel: TextChannel; text: string }
  | { t: 'act'; action: unknown }
  /** After a game, a seated player asks for (or takes back) a rematch. */
  | { t: 'rematch'; want: boolean }
  // Host only:
  | { t: 'start' }
  | { t: 'seat'; userId: string; seat: SeatId }
  | { t: 'unseat'; userId: string }
  | { t: 'addBot'; seat: SeatId; ai?: boolean; level?: 'gentle' | 'fair' | 'strong' }
  | { t: 'makeHost'; userId: string }
  | { t: 'kick'; userId: string }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  /** Games the host runs (the camera table): an action with the host's powers. */
  | { t: 'hostAct'; action: unknown };

export type ServerMessage =
  | { t: 'snapshot'; snapshot: RoomSnapshot }
  | { t: 'error'; message: string };

export interface RoomSummary {
  code: string;
  name: string;
  gameId: string;
  gameName: string;
  configLabel: string;
  hostName: string;
  status: GameStatus;
  seats: SeatView[];
  watching: number;
  listed: boolean;
  ranked: boolean;
  locked: boolean;
}

export interface SessionUser {
  id: string;
  name: string;
  guest: boolean;
  /** Can open the platform settings page (#/admin). */
  admin: boolean;
  /** Must choose a new password before anything else (the default admin). */
  mustChangePassword?: boolean;
}

// ---- results, leaderboards and stats ---------------------------------

export type Outcome = 'win' | 'draw' | 'loss';
export const POINTS: Record<Outcome, number> = { win: 3, draw: 1, loss: 0 };
/** Fewest games in a period to be ranked on a leaderboard. */
export const MIN_RANKED_GAMES = 5;
export type Period = 'week' | 'month' | 'all';

export interface LastResult {
  /** The stored game, for its replay. */
  gameRowId: string;
  replayable: boolean;
  counted: boolean;
  /** Why it didn't count, in words, when it didn't. */
  note: string | null;
  players: {
    userId: string;
    name: string;
    seat: SeatId;
    outcome: Outcome;
    points: number;
    /** 1 = first (shared places share the number). */
    place: number;
    /** All-time points in this game, after this one (counted games only). */
    total: number | null;
    /** All-time rank in this game, or null if not ranked yet. */
    rank: number | null;
  }[];
  /** Two-player games: the first player's record against the second. */
  headToHead: { w: number; d: number; l: number } | null;
}

export interface LeaderboardRow {
  rank: number | null;
  userId: string;
  name: string;
  played: number;
  w: number;
  d: number;
  l: number;
  points: number;
  /** Most recent first. */
  form: Outcome[];
}

export interface LeaderboardResponse {
  game: string;
  /** Camera table: the game name (its key) the board is for, if one. */
  name?: string;
  period: Period;
  ranked: LeaderboardRow[];
  unranked: LeaderboardRow[];
  minGames: number;
}

/** The names the camera table has been played under: a leaderboard tab each. */
export interface BoardNamesResponse {
  game: string;
  names: { key: string; name: string; games: number }[];
}

export interface PlayerStatsResponse {
  user: { id: string; name: string; guest: boolean; since: string };
  game: string;
  period: Period;
  totals: { played: number; w: number; d: number; l: number; points: number };
  rank: number | null;
  streak: { current: { outcome: Outcome; length: number } | null; bestWins: number };
  bySeat: { seat: string; label: string; played: number; w: number; d: number; l: number; points: number }[];
  weekly: { weekStart: string; points: number }[];
  endings: { reason: string; n: number }[];
  recent: { gameRowId: string; replayable: boolean; opponent: string | null; opponentId: string | null; outcome: Outcome; reason: string; seat: string; seatLabel: string; room: string; endedAt: string; points: number }[];
  headToHead: { userId: string; name: string; w: number; d: number; l: number }[];
}

export interface ReplayResponse {
  id: string;
  gameId: string;
  room: string;
  players: { seat: string; name: string; userId: string }[];
  result: { winner: string | null; reason: string } | null;
  endedAt: string;
  /** What a watcher saw after each move, from the start. */
  frames: unknown[];
}
