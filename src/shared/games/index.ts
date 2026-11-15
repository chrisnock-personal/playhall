import type { GameModule } from '../game';
import { chess } from './chess';
import { fourInARow } from './fourinarow';

// Every built-in game, by id. Adding a game = writing its module here and its
// stage in src/client/games/.
export const GAMES: Record<string, GameModule<any, any>> = {
  [chess.id]: chess,
  [fourInARow.id]: fourInARow,
};

export function gameList() {
  return Object.values(GAMES).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    howToPlay: g.howToPlay,
    seats: g.seats,
    defaultConfig: g.defaultConfig,
  }));
}
