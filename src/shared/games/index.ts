import type { GameModule } from '../game';
import { chess } from './chess';
import { fourInARow } from './fourinarow';
import { checkers } from './checkers';
import { snakes } from './snakes';
import { ludo } from './ludo';
import { seaBattle } from './seabattle';
import { blackjack } from './blackjack';

// Every built-in game, by id. Adding a game = writing its module here and its
// stage in src/client/games/.
export const GAMES: Record<string, GameModule<any, any>> = {
  [chess.id]: chess,
  [fourInARow.id]: fourInARow,
  [checkers.id]: checkers,
  [snakes.id]: snakes,
  [ludo.id]: ludo,
  [seaBattle.id]: seaBattle,
  [blackjack.id]: blackjack,
};

export function gameList() {
  return Object.values(GAMES).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    howToPlay: g.howToPlay,
    seats: g.seats,
    minPlayers: g.minPlayers ?? g.seats.length,
    defaultConfig: g.defaultConfig,
  }));
}
