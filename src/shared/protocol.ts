// Messages between the browser and the room over the WebSocket (/ws), and
// the snapshot of a room each person is sent after every change.
import type { GameResult, SeatId } from './game';

export type Channel = 'table' | 'gallery';

export interface RoomSettings {
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
  /** The game's own settings (for chess, the time control). */
  gameConfig: unknown;
}

export const DEFAULT_SETTINGS: Omit<RoomSettings, 'gameConfig'> = {
  listed: true,
  seatPolicy: 'open',
  guestsCanPlay: true,
  hideGalleryFromPlayers: true,
  watchersWriteTable: false,
  afterGame: 'same',
};

export interface MemberView {
  userId: string;
  name: string;
  guest: boolean;
  online: boolean;
  host: boolean;
  seat: SeatId | null;
  hand: boolean;
}

export interface ChatLine {
  id: number;
  channel: Channel;
  kind: 'typed' | 'system';
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
  };
  seats: SeatView[];
  members: MemberView[];
  /** userIds with a raised hand, oldest first. */
  queue: string[];
  game: { status: GameStatus; view: unknown; result: GameResult | null };
  chat: ChatLine[];
  you: {
    userId: string;
    host: boolean;
    seat: SeatId | null;
    canRead: Channel[];
    canWrite: Channel[];
  };
  serverNow: number;
}

export type ClientMessage =
  | { t: 'sit'; seat: SeatId }
  | { t: 'stand' }
  | { t: 'hand'; up: boolean }
  | { t: 'chat'; channel: Channel; text: string }
  | { t: 'act'; action: unknown }
  // Host only:
  | { t: 'start' }
  | { t: 'seat'; userId: string; seat: SeatId }
  | { t: 'unseat'; userId: string }
  | { t: 'makeHost'; userId: string }
  | { t: 'settings'; settings: Partial<RoomSettings> };

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
}

export interface SessionUser {
  id: string;
  name: string;
  guest: boolean;
}
