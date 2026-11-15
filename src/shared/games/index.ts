import type { GameModule } from '../game';
import { chess } from './chess';

// Every built-in game, by id. Adding a game = writing its module here and its
// stage in src/client/games/.
export const GAMES: Record<string, GameModule<any, any>> = {
  [chess.id]: chess,
};

export function gameList() {
  return Object.values(GAMES).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    seats: g.seats,
    defaultConfig: g.defaultConfig,
  }));
}
