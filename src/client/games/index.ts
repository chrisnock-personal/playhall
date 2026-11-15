import type { GameClient } from './types';
import { chessClient } from './chess';
import { fourInARowClient } from './fourinarow';
import { checkersClient } from './checkers';
import { snakesClient } from './snakes';

export const GAME_CLIENTS: Record<string, GameClient> = {
  [chessClient.id]: chessClient,
  [fourInARowClient.id]: fourInARowClient,
  [checkersClient.id]: checkersClient,
  [snakesClient.id]: snakesClient,
};
