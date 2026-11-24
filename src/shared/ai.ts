// AI players (#32): a seat played by a language model on a server the
// platform admin sets up. The model never gets the game state, only what the
// seat's own view says, in words, and the legal moves as numbered options; it
// answers with an option number and maybe a line of table talk. The game
// still checks the move, and the rule bot (bots.ts) plays instead whenever
// the model is slow, unreachable or wrong.

import type { SeatId } from './game';
import { ship2shoreAi } from './games/ship2shore.ai';
import { pokerAi } from './games/poker.ai';
import { manorAi } from './games/manormystery.ai';

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
  poker: pokerAi,
  manormystery: manorAi,
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

/** The prompt for answering a question at the table: the model is told what
 *  really happened and decides whether to tell it straight. */
export function aiReplyPrompt(game: AiGame, view: unknown, seat: SeatId, names: Record<SeatId, string>, chat: string[], question: string, truth: string): { system: string; user: string } {
  const system = [
    'You are a player in a game among friends, and someone at the table has asked you something.',
    'Answer in one short line, in character, as yourself. Tell the truth or lie, whichever helps your side: stories that don\u2019t match get caught, so lie only when the truth would give you away.',
    'Answer with JSON only: {"say": "<your line>"}.',
  ].join('\n');
  const user = [
    game.describe(view, seat, names),
    chat.length ? `Table chat, latest last:\n${chat.join('\n')}` : '',
    `What really happened: ${truth}`,
    `You were asked: "${question.slice(0, 300)}"`,
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

/** Read a reply: one line to say, or null. */
export function readSay(text: string): string | null {
  try {
    const raw = JSON.parse(text.trim().replace(/^```(json)?|```$/g, ''));
    const say = typeof raw?.say === 'string' ? raw.say.trim().replace(/^["']|["']$/g, '').slice(0, 200) : '';
    return say || null;
  } catch {
    return null;
  }
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
