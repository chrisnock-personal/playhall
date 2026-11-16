// Computer players (#18). A bot plays a seat from that seat's own view of the
// game (game.view(state, now, seat)), exactly what a person there would see,
// so it can't cheat; a model-backed player (#32) will get the same view. It
// returns the action to send, as a player's browser would, or null when it
// has nothing to do. The room (src/server/rooms/room.ts) asks it whenever the
// game is waiting for a bot seat, and falls back to the game's out-of-time
// move if the bot's answer is refused.

import { ship2shoreBot } from './games/ship2shore.bot';
import { checkersBot, fourBot, ludoBot, snakesBot, whoDatBot } from './games/board.bots';
import { blackjackBot, clashBot, pokerBot, realmBot, seaBot } from './games/card.bots';
import { ship2shoreTalk } from './games/ship2shore.talk';

/** A bot: its seat's view and its seat in, the action it takes out. */
export type Bot = (view: unknown, seat: string, random: () => number) => unknown | null;

/** The games that have bots, by game id. */
export const BOTS: Record<string, Bot> = {
  ship2shore: ship2shoreBot,
  snakes: snakesBot,
  ludo: ludoBot,
  fourinarow: fourBot,
  checkers: checkersBot,
  blackjack: blackjackBot,
  poker: pokerBot,
  colourclash: clashBot,
  seabattle: seaBot,
  realmduel: realmBot,
  whodat: whoDatBot,
};

/** Answering at the table: games where players ask each other things
 *  (Ship2Shore: "what orders did you have?") let bots and AI players answer. */
export interface BotTalk {
  /** Whether this line from someone at the table asks this seat something it
   *  should answer. */
  asked(view: unknown, seat: string, text: string, names: Record<string, string>): boolean;
  /** What really happened, in words, for an AI player's prompt. */
  truth(view: unknown, seat: string): string | null;
  /** A rule bot's answer: the truth, or a lie where the truth gives it away. */
  answer(view: unknown, seat: string, random: () => number): string | null;
  /** Whether this seat may talk now. */
  canTalk(view: unknown, seat: string): boolean;
}

export const BOT_TALK: Record<string, BotTalk> = {
  ship2shore: ship2shoreTalk,
};

/** Bots' seats hold a made-up id with this prefix, never a real account. */
export const BOT_ID_PREFIX = 'bot:';
export const isBotId = (userId: string | null | undefined) => !!userId && userId.startsWith(BOT_ID_PREFIX);

/** Bots' names, one per seat of the biggest table. */
export const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Greta', 'Hugo', 'Ines', 'Jory', 'Kit'];

/** A name not already at the table: "Ada (bot)", or "Ada (AI)" for a
 *  model-played seat (#32). */
export function botName(taken: string[], kind: 'bot' | 'AI' = 'bot'): string {
  const n = BOT_NAMES.find((x) => !taken.some((t) => t.startsWith(`${x} (`)));
  return n ? `${n} (${kind})` : `${kind === 'AI' ? 'AI' : 'Bot'} ${taken.length + 1}`;
}
