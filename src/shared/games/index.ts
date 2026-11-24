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
import { ship2shore } from './ship2shore';
import { whoDat } from './whodat';
import { poophead } from './poophead';
import { hearts } from './hearts';
import { spades } from './spades';
import { thirtyOne } from './thirtyone';
import { ginRummy } from './ginrummy';
import { bingo } from './bingo';
import { chineseCheckers } from './chinesecheckers';
import { roulette } from './roulette';
import { craps } from './craps';
import { bridge } from './bridge';
import { realmBattle } from './realmbattle';
import { BOTS } from '../bots';

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
  [ship2shore.id]: ship2shore,
  [whoDat.id]: whoDat,
  [poophead.id]: poophead,
  [hearts.id]: hearts,
  [spades.id]: spades,
  [thirtyOne.id]: thirtyOne,
  [ginRummy.id]: ginRummy,
  [bingo.id]: bingo,
  [chineseCheckers.id]: chineseCheckers,
  [roulette.id]: roulette,
  [craps.id]: craps,
  [bridge.id]: bridge,
  [realmBattle.id]: realmBattle,
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
    bots: !!BOTS[g.id],
  }));
}
