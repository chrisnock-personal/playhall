// The contract every built-in game implements. A game module is pure: it
// gets the current state and returns a new one, never touching the network,
// the database or the clock (the time is passed in). The room engine
// (src/server/rooms/room.ts) owns seats, roles, chat and persistence, so a
// game only has to know its own rules.

export type SeatId = string;

/** Chat channels: the room's two open channels, plus a team's private one
 *  (`team-0`, `team-1`) in games that have teams (Realm Battle, #68). Voice
 *  stays on the two open channels; `Channel` in protocol.ts is those two. */
export type TextChannel = 'table' | 'gallery' | `team-${number}`;

export interface SeatDef {
  id: SeatId;
  label: string;
}

export interface GameResult {
  /** The winning seat, or null for a draw or an abandoned game. */
  winner: SeatId | null;
  /** Games of three or more: seats in finishing order, ties grouped
   *  ([[a], [b, c], [d]]). Without it, the winner is first and everyone else
   *  shares second (or everyone shares first when there's no winner). */
  placings?: SeatId[][];
  /** Plain words: "checkmate", "resignation", "time", "agreement"... */
  reason: string;
  /** The game was stopped (e.g. by the host): it doesn't count for anyone. */
  aborted?: boolean;
  /** Everyone lost (e.g. nobody solved the case): it counts, with no points
   *  for anyone, rather than as a draw. */
  nobodyWins?: boolean;
  /** A team won (Ship2Shore's factions): everyone in the first placing
   *  scores as a winner (3 points each), not as a shared first. */
  teamWin?: boolean;
}

/** How to play, shown in every room's How to play tab and from the lobby. */
export interface HowToPlay {
  /** One or two sentences: what you're trying to do. */
  goal: string;
  sections: { title: string; points: string[] }[];
}

/** An accepted action, and optionally lines for the table chat that say
 *  what happened ("Kai rolled 4 + 5 = 9"): the room posts them for everyone. */
export type ActResult<S> = { state: S; say?: string[] } | { error: string };

/** What the room gives a game besides its state: luck comes from the server,
 *  never the browser, so dice and shuffles can't be tampered with. */
export interface GameContext {
  /** The seats with a player in them, in seat order. */
  seats: SeatId[];
  /** A number in [0, 1). */
  random(): number;
  /** Word games: is this (upper-case) word in the room's word list? The
   *  server supplies it; without one, every word is allowed. */
  isWord?(word: string): boolean;
  /** The players' names by seat (for lines the game says in the chat). */
  names?: Record<SeatId, string>;
  /** The room's host: their name and their seat, if they have one. */
  host?: { name: string; seat: SeatId | null };
}

export interface GameModule<S = unknown, C = unknown> {
  id: string;
  name: string;
  description: string;
  howToPlay: HowToPlay;
  /** All the seats the game can have. */
  seats: SeatDef[];
  /** Fewest players to start (default: every seat). */
  minPlayers?: number;
  /** Games whose number of seats is a setting (the camera table): the seats
   *  in use for this config, a prefix of `seats`. Default: all of them. */
  seatsFor?(config: C): SeatDef[];
  defaultConfig: C;
  /** Turn untrusted input (from a host's settings) into a valid config. */
  parseConfig(raw: unknown): C;
  /** Input the host must fix rather than have quietly replaced (a missing
   *  game name): why, in plain words, or null when it's fine. */
  configError?(raw: unknown): string | null;
  /** A short label for the config, e.g. "5 min + 3 s". */
  describeConfig(config: C): string;
  create(config: C, now: number, ctx: GameContext): S;
  /** Apply one action from a seated player. */
  act(state: S, seat: SeatId, action: unknown, now: number, ctx: GameContext): ActResult<S>;
  /** Games where the host runs things (the camera table): an action from the
   *  host, seated or not (their seat, if any, is ctx.host.seat). */
  hostAct?(state: S, action: unknown, now: number, ctx: GameContext): ActResult<S>;
  /** A player who drops out mid-game isn't put out of it after the grace
   *  minute: the game waits for them (the camera table, where the players
   *  agree the result themselves). */
  keepsDroppedPlayers?: boolean;
  /** Played on a real table filmed by a camera device (see the table camera
   *  in docs/phase2.md): the host can make a phone the table camera. */
  tableCamera?: boolean;
  /** Games played under many names (the camera table): the name a finished
   *  game is filed under, for a leaderboard per name. */
  boardName?(state: S): string | null;
  /** Who has to act now. Games that give it get the room's move timer
   *  (games with their own clocks, like chess, leave it out). */
  turn?(state: S): SeatId[];
  /** Who the game is waiting on, for computer players (#18): games with their
   *  own clocks, which leave turn() out, give it here. Default: turn(). */
  waitingFor?(state: S): SeatId[];
  /** The game has no turns (Bingo's calls come on a clock): nobody is shown
   *  as "to move", even while computer players are waited on. */
  noTurns?: boolean;
  /** The move timer ran out for `seat`. Without this, in a two-player game
   *  that seat loses; a game for more players should say what happens
   *  (skip the turn, play automatically). */
  timeout?(state: S, seat: SeatId, now: number, ctx: GameContext): S;
  /** Called when a deadline passes (e.g. a clock runs out); null = no change. */
  tick(state: S, now: number): S | null;
  /** When tick() next needs calling, as a timestamp; null = no deadline. */
  nextDeadline(state: S): number | null;
  /** The game was on hold for `ms` (the server was down, or the room was
   *  unloaded): move any running clock on so that time isn't charged to
   *  anyone. Games without clocks leave it out. */
  pause?(state: S, ms: number): S;
  result(state: S): GameResult | null;
  /** For replays: what a watcher saw after each move, from the start to the
   *  end. Games that keep their whole move history provide it. */
  replay?(state: S): unknown[];
  /** Replays are built from `state.history` (see games/history.ts): a game
   *  saved before the game kept one can't be replayed. */
  keepsHistory?: boolean;
  /** What one person sees: `viewer` is their seat, or null for a watcher.
   *  Hands, fleets and hole cards appear only in their owner's view. */
  view(state: S, now: number, viewer: SeatId | null): unknown;
  /** A game with teams can give each side a private text channel. The room
   *  uses this to allow and filter chat; watchers and free-for-alls get null. */
  teamChat?(state: S, viewer: SeatId | null): { channel: TextChannel; label: string } | null;
}

/** The seats in use for a (raw) config. */
export function seatsIn(game: GameModule<any, any>, rawConfig: unknown): SeatDef[] {
  return game.seatsFor ? game.seatsFor(game.parseConfig(rawConfig)) : game.seats;
}
