import type { GameClient } from './types';
import { chessClient } from './chess';
import { fourInARowClient } from './fourinarow';
import { checkersClient } from './checkers';
import { snakesClient } from './snakes';
import { ludoClient } from './ludo';
import { seaBattleClient } from './seabattle';
import { blackjackClient } from './blackjack';
import { colourClashClient } from './colourclash';
import { pokerClient } from './poker';
import { letterworksClient } from './letterworks';
import { realmDuelClient } from './realmduel';
import { manorMysteryClient } from './manormystery';
import { cameraTableClient } from './cameratable';
import { ship2shoreClient } from './ship2shore';
import { whoDatClient } from './whodat';
import { poopheadClient } from './poophead';
import { heartsClient } from './hearts';
import { spadesClient } from './spades';
import { thirtyOneClient } from './thirtyone';
import { ginRummyClient } from './ginrummy';
import { bingoClient } from './bingo';
import { chineseCheckersClient } from './chinesecheckers';
import { rouletteClient } from './roulette';
import { crapsClient } from './craps';
import { bridgeClient } from './bridge';
import { realmBattleClient } from './realmbattle';
import { clueWordsClient } from './cluewords';
import { whatAmIClient } from './whatami';

export const GAME_CLIENTS: Record<string, GameClient> = {
  [chessClient.id]: chessClient,
  [fourInARowClient.id]: fourInARowClient,
  [checkersClient.id]: checkersClient,
  [snakesClient.id]: snakesClient,
  [ludoClient.id]: ludoClient,
  [seaBattleClient.id]: seaBattleClient,
  [blackjackClient.id]: blackjackClient,
  [colourClashClient.id]: colourClashClient,
  [pokerClient.id]: pokerClient,
  [letterworksClient.id]: letterworksClient,
  [realmDuelClient.id]: realmDuelClient,
  [manorMysteryClient.id]: manorMysteryClient,
  [cameraTableClient.id]: cameraTableClient,
  [ship2shoreClient.id]: ship2shoreClient,
  [whoDatClient.id]: whoDatClient,
  [poopheadClient.id]: poopheadClient,
  [heartsClient.id]: heartsClient,
  [spadesClient.id]: spadesClient,
  [thirtyOneClient.id]: thirtyOneClient,
  [ginRummyClient.id]: ginRummyClient,
  [bingoClient.id]: bingoClient,
  [chineseCheckersClient.id]: chineseCheckersClient,
  [rouletteClient.id]: rouletteClient,
  [crapsClient.id]: crapsClient,
  [bridgeClient.id]: bridgeClient,
  [realmBattleClient.id]: realmBattleClient,
  [clueWordsClient.id]: clueWordsClient,
  [whatAmIClient.id]: whatAmIClient,
};

// Pictures for the rules (#57).
import RULES_PICTURES from './rulesPictures';
for (const [id, pics] of Object.entries(RULES_PICTURES)) if (GAME_CLIENTS[id]) GAME_CLIENTS[id].rulesPictures = pics;
