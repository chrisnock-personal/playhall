// Computer players (#18). A bot plays a seat from that seat's own view of the
// game (game.view(state, now, seat)), exactly what a person there would see,
// so it can't cheat; a model-backed player (#32) will get the same view. It
// returns the action to send, as a player's browser would, or null when it
// has nothing to do. The room (src/server/rooms/room.ts) asks it whenever the
// game is waiting for a bot seat, and falls back to the game's out-of-time
// move if the bot's answer is refused.

import { ship2shoreBot } from './games/ship2shore.bot';

export type Bot = (view: unknown, random: () => number) => unknown | null;

/** The games that have bots, by game id. */
export const BOTS: Record<string, Bot> = {
  ship2shore: ship2shoreBot,
};

/** Bots' seats hold a made-up id with this prefix, never a real account. */
export const BOT_ID_PREFIX = 'bot:';
export const isBotId = (userId: string | null | undefined) => !!userId && userId.startsWith(BOT_ID_PREFIX);

/** Bots' names, one per seat of the biggest table. */
export const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Greta', 'Hugo', 'Ines', 'Jory', 'Kit'];

/** A bot name not already at the table: "Ada (bot)". */
export function botName(taken: string[]): string {
  const n = BOT_NAMES.find((x) => !taken.includes(`${x} (bot)`));
  return n ? `${n} (bot)` : `Bot ${taken.length + 1}`;
}
