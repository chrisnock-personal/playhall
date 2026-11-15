import type { GameClient } from './types';
import { chessClient } from './chess';
import { fourInARowClient } from './fourinarow';
import { checkersClient } from './checkers';
import { snakesClient } from './snakes';
import { ludoClient } from './ludo';
import { seaBattleClient } from './seabattle';
import { blackjackClient } from './blackjack';
import { colourClashClient } from './colourclash';

export const GAME_CLIENTS: Record<string, GameClient> = {
  [chessClient.id]: chessClient,
  [fourInARowClient.id]: fourInARowClient,
  [checkersClient.id]: checkersClient,
  [snakesClient.id]: snakesClient,
  [ludoClient.id]: ludoClient,
  [seaBattleClient.id]: seaBattleClient,
  [blackjackClient.id]: blackjackClient,
  [colourClashClient.id]: colourClashClient,
};
