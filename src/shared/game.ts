// The contract every built-in game implements. A game module is pure: it
// gets the current state and returns a new one, never touching the network,
// the database or the clock (the time is passed in). The room engine
// (src/server/rooms/room.ts) owns seats, roles, chat and persistence, so a
// game only has to know its own rules.

export type SeatId = string;

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
}

/** How to play, shown in every room's How to play tab and from the lobby. */
export interface HowToPlay {
  /** One or two sentences: what you're trying to do. */
  goal: string;
  sections: { title: string; points: string[] }[];
}

export type ActResult<S> = { state: S } | { error: string };

/** What the room gives a game besides its state: luck comes from the server,
 *  never the browser, so dice and shuffles can't be tampered with. */
export interface GameContext {
  /** The seats with a player in them, in seat order. */
  seats: SeatId[];
  /** A number in [0, 1). */
  random(): number;
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
  defaultConfig: C;
  /** Turn untrusted input (from a host's settings) into a valid config. */
  parseConfig(raw: unknown): C;
  /** A short label for the config, e.g. "5 min + 3 s". */
  describeConfig(config: C): string;
  create(config: C, now: number, ctx: GameContext): S;
  /** Apply one action from a seated player. */
  act(state: S, seat: SeatId, action: unknown, now: number, ctx: GameContext): ActResult<S>;
  /** Who has to act now. Games that give it get the room's move timer
   *  (games with their own clocks, like chess, leave it out). */
  turn?(state: S): SeatId[];
  /** The move timer ran out for `seat`. Without this, in a two-player game
   *  that seat loses; a game for more players should say what happens
   *  (skip the turn, play automatically). */
  timeout?(state: S, seat: SeatId, now: number, ctx: GameContext): S;
  /** Called when a deadline passes (e.g. a clock runs out); null = no change. */
  tick(state: S, now: number): S | null;
  /** When tick() next needs calling, as a timestamp; null = no deadline. */
  nextDeadline(state: S): number | null;
  result(state: S): GameResult | null;
  /** What one person sees: `viewer` is their seat, or null for a watcher.
   *  Hands, fleets and hole cards appear only in their owner's view. */
  view(state: S, now: number, viewer: SeatId | null): unknown;
}
