// AI players (#32): a seat played by a language model on a server the
// platform admin sets up. The model never gets the game state, only what the
// seat's own view says, in words, and the legal moves as numbered options; it
// answers with an option number and maybe a line of table talk. The game
// still checks the move, and the rule bot (bots.ts) plays instead whenever
// the model is slow, unreachable or wrong.

import type { SeatId } from './game';
import { ship2shoreAi } from './games/ship2shore.ai';

export interface AiOption { label: string; action: unknown }

export interface AiGame {
  /** The position in words, from `seat`'s own view. */
  describe(view: unknown, seat: SeatId, names: Record<SeatId, string>): string;
  /** What is being decided, in a line. */
  question(view: unknown): string;
  /** Every legal move now, numbered for the model (empty: nothing to do). */
  options(view: unknown, seat: SeatId, names: Record<SeatId, string>): AiOption[];
  /** Whether this seat may say something at the table now. */
  canTalk(view: unknown, seat: SeatId): boolean;
  /** Whether the model makes this decision. Moves that are arithmetic (which
   *  order takes the ship nearer your port) are better left to the rule bot,
   *  which never gets the sums wrong. Default: every decision. */
  modelDecides?(view: unknown): boolean;
}

/** The games AI players can play, by game id. */
export const AI_GAMES: Record<string, AiGame> = {
  ship2shore: ship2shoreAi,
};

/** What the model answers. */
export interface AiAnswer { choice: number; say?: string; thought?: string }

/** The prompt for one decision: the system part and the user part. */
export function aiPrompt(game: AiGame, view: unknown, seat: SeatId, names: Record<SeatId, string>, chat: string[], options: AiOption[]): { system: string; user: string } {
  const talk = game.canTalk(view, seat);
  const system = [
    'You are a player in a game among friends. Play to win for your side, and keep your secrets: never say your role or side outright unless that helps you.',
    'First think in one sentence about which option helps your side most, then choose.',
    'Answer with JSON only: {"thought": "<one sentence>", "choice": <option number>' + (talk ? ', "say": "<one short line for the table, or empty>"' : '') + '}.',
    talk ? 'Talk like a player at a table: short, in character, never revealing your secret side unless it helps; accuse, defend or bluff. Say something about one turn in three.' : 'You may not talk now: leave out "say".',
  ].join('\n');
  const user = [
    game.describe(view, seat, names),
    chat.length ? `Table chat, latest last:\n${chat.join('\n')}` : 'Nobody has said anything at the table yet.',
    game.question(view),
    'Options:',
    ...options.map((o, i) => `${i + 1}. ${o.label}`),
  ].join('\n\n');
  return { system, user };
}

/** Read the model's answer: the option number (1-based) and any talk. */
export function readAnswer(text: string, count: number): AiAnswer | null {
  try {
    const raw = JSON.parse(text.trim().replace(/^```(json)?|```$/g, ''));
    const choice = Number(raw?.choice);
    if (!Number.isInteger(choice) || choice < 1 || choice > count) return null;
    const say = typeof raw?.say === 'string' ? raw.say.trim().replace(/^["']|["']$/g, '').slice(0, 200) : '';
    const thought = typeof raw?.thought === 'string' ? raw.thought.slice(0, 300) : '';
    return { choice, ...(say ? { say } : {}), ...(thought ? { thought } : {}) };
  } catch {
    return null;
  }
}
