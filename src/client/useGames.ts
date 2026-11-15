import { useEffect, useState } from 'react';
import { api } from './api';

export interface GameInfo { id: string; name: string; description: string; seats: { id: string; label: string }[]; defaultConfig: unknown }

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
