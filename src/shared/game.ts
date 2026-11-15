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
  /** Plain words: "checkmate", "resignation", "time", "agreement"... */
  reason: string;
  /** The game was stopped (e.g. by the host): it doesn't count for anyone. */
  aborted?: boolean;
}

export type ActResult<S> = { state: S } | { error: string };

export interface GameModule<S = unknown, C = unknown> {
  id: string;
  name: string;
  description: string;
  /** Every seat must be filled before the game can start. */
  seats: SeatDef[];
  defaultConfig: C;
  /** Turn untrusted input (from a host's settings) into a valid config. */
  parseConfig(raw: unknown): C;
  /** A short label for the config, e.g. "5 min + 3 s". */
  describeConfig(config: C): string;
  create(config: C, now: number): S;
  /** Apply one action from a seated player. */
  act(state: S, seat: SeatId, action: unknown, now: number): ActResult<S>;
  /** Called when a deadline passes (e.g. a clock runs out); null = no change. */
  tick(state: S, now: number): S | null;
  /** When tick() next needs calling, as a timestamp; null = no deadline. */
  nextDeadline(state: S): number | null;
  result(state: S): GameResult | null;
  /** What everyone in the room sees. Games with hidden information get a
   *  per-seat view later (phase 4); chess has none. */
  view(state: S, now: number): unknown;
}
