import { useEffect, useState } from 'react';
import { api } from './api';
import type { HowToPlay } from '../shared/game';

export interface GameInfo { id: string; name: string; description: string; seats: { id: string; label: string }[]; minPlayers: number; defaultConfig: unknown; howToPlay?: HowToPlay;
  /** Played on a real table under a typed name (the camera table): a leaderboard per name. */
  tableCamera?: boolean;
  /** The host can put computer players in free seats (#18). */
  bots?: boolean }

let cache: GameInfo[] | null = null;

/** The built-in games, from the server (fetched once). */
export function useGames(): GameInfo[] {
  const [games, setGames] = useState<GameInfo[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    api<{ games: GameInfo[] }>('/games').then((g) => { cache = g.games; setGames(g.games); }).catch(() => {});
  }, []);
  return games;
}
