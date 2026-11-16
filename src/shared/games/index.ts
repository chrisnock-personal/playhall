import type { GameModule } from '../game';
import { chess } from './chess';
import { fourInARow } from './fourinarow';
import { checkers } from './checkers';
import { snakes } from './snakes';
import { ludo } from './ludo';
import { seaBattle } from './seabattle';
import { blackjack } from './blackjack';
import { colourClash } from './colourclash';
import { poker } from './poker';
import { letterworks } from './letterworks';
import { realmDuel } from './realmduel';
import { manorMystery } from './manormystery';
import { cameraTable } from './cameratable';

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
  [colourClash.id]: colourClash,
  [poker.id]: poker,
  [letterworks.id]: letterworks,
  [realmDuel.id]: realmDuel,
  [manorMystery.id]: manorMystery,
  [cameraTable.id]: cameraTable,
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
    tableCamera: !!g.tableCamera,
  }));
}
