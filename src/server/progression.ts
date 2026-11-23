// Progression (#50) on the server: who is on the ladder and which games they
// have opened, kept in memory so a room can check a seat without waiting on
// the database. Loaded when someone opens a room or creates one, refreshed
// after each game they finish and when an admin changes something.

import type { Db } from './db';
import { getPlatformSettings } from './platform';
import { GAMES } from '../shared/games';
import { ladderProgress, type MyProgression } from '../shared/progression';

let db: Db | null = null;
/** Players on the ladder: the games they may play. Players not here are free. */
const allowed = new Map<string, Set<string>>();
/** How many tiers each player on the ladder had open, last time we looked. */
const openTiers = new Map<string, number>();

export function initProgression(d: Db): void { db = d; }

/** Work out (again) where `userId` is; returns what they'd see. */
export async function loadProgression(userId: string): Promise<MyProgression> {
  const ladder = getPlatformSettings().progression;
  if (!db) return { on: false, ladder, progress: null };
  const { rows } = await db.query<{ progression: boolean }>('SELECT progression FROM users WHERE id = $1', [userId]);
  if (!rows[0]?.progression) { allowed.delete(userId); openTiers.delete(userId); return { on: false, ladder, progress: null }; }
  const { rows: wins } = await db.query<{ game_id: string; n: number }>(
    `SELECT game_id, count(*)::int AS n FROM game_results WHERE user_id = $1 AND outcome = 'win' GROUP BY game_id`, [userId]);
  const progress = ladderProgress(ladder, Object.fromEntries(wins.map((w) => [w.game_id, w.n])));
  allowed.set(userId, new Set(progress.allowed));
  openTiers.set(userId, progress.open);
  return { on: true, ladder, progress };
}

/** After a game: work out `userId`'s ladder again, and say which tier they just
 *  opened (its number and games), or null. */
export async function newTierAfterGame(userId: string): Promise<{ tier: number; games: string[] } | null> {
  const before = openTiers.get(userId);
  const now = await loadProgression(userId);
  if (!now.progress || before === undefined || now.progress.open <= before) return null;
  const tier = now.progress.open;
  return { tier, games: now.ladder.tiers[tier - 1].games.map((g) => GAMES[g]?.name ?? g) };
}

/** Why `userId` can't play or host `gameId`, or null when they can. */
export function progressionBlock(userId: string, gameId: string): string | null {
  const mine = allowed.get(userId);
  if (!mine || mine.has(gameId)) return null;
  return `${GAMES[gameId]?.name ?? 'This game'} isn’t open on your ladder yet: win more of your open games to unlock it. You can still watch.`;
}

/** The ladder changed: everyone's games are worked out again as they come back. */
export async function reloadAllProgression(): Promise<void> {
  await Promise.all([...allowed.keys()].map((id) => loadProgression(id).catch(() => undefined)));
}
