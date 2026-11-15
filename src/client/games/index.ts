import type { GameClient } from './types';
import { chessClient } from './chess';

export const GAME_CLIENTS: Record<string, GameClient> = {
  [chessClient.id]: chessClient,
};
