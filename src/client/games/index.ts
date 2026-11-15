import type { GameClient } from './types';
import { chessClient } from './chess';
import { fourInARowClient } from './fourinarow';

export const GAME_CLIENTS: Record<string, GameClient> = {
  [chessClient.id]: chessClient,
  [fourInARowClient.id]: fourInARowClient,
};
