// Clue Words (#46): our own four-player team word game. Two pairs sit in the
// same room; each side has a clue-giver who can see the key to the 5×5 board,
// and guessers who can only see the words. Give one word and a number, then
// find your side's words before the other side does. Touching the spy loses.

import type { GameResult, SeatDef, SeatId, TextChannel } from '../game';
import { randInt, withHistory, type GameHistory } from './history';

export type CwTeam = 0 | 1;
export type CardKind = CwTeam | 'neutral' | 'assassin';
export type ClueWordsConfig = Record<string, never>;

export const SEATS: SeatId[] = ['amber', 'teal', 'violet', 'rose'];
export const TEAM_NAMES = ['Sun', 'Moon'] as const;
export const PAIRS: [SeatId, SeatId][] = [['amber', 'violet'], ['teal', 'rose']];
const LABEL: Record<SeatId, string> = { amber: 'Amber', teal: 'Teal', violet: 'Violet', rose: 'Rose' };

/** Our own family-friendly words, not another game's cards. */
const WORDS = [
  'ANCHOR', 'BICYCLE', 'BIRD', 'BOOK', 'BRIDGE', 'BUTTON', 'CAMERA', 'CANDLE', 'CARROT', 'CASTLE',
  'CIRCUS', 'CLOUD', 'COAST', 'COFFEE', 'COMPASS', 'CROWN', 'DANCE', 'DESERT', 'DIAMOND', 'DOLPHIN',
  'DRAGON', 'DRUM', 'EAGLE', 'ENGINE', 'FARM', 'FEATHER', 'FENCE', 'FIRE', 'FISH', 'FLAG',
  'FLOWER', 'FOOTBALL', 'FOREST', 'FROG', 'GARDEN', 'GATE', 'GHOST', 'GLOBE', 'GRAPE', 'GUITAR',
  'HAMMER', 'HARBOUR', 'HAT', 'HONEY', 'HORSE', 'ISLAND', 'JAR', 'KETTLE', 'KEY', 'KITE',
  'LAKE', 'LAMP', 'LEMON', 'LIBRARY', 'LION', 'MAGIC', 'MAP', 'MARKET', 'MOON', 'MOUNTAIN',
  'MUSEUM', 'MUSIC', 'ORANGE', 'PAINT', 'PALM', 'PARROT', 'PIANO', 'PIRATE', 'POCKET', 'PUZZLE',
  'RAINBOW', 'RIVER', 'ROBOT', 'SAIL', 'SCHOOL', 'SHIP', 'SHOE', 'SILVER', 'SNOW', 'SOLAR',
  'SPICE', 'STORM', 'STORY', 'STRAWBERRY', 'SUN', 'TABLE', 'TELESCOPE', 'TENT', 'TIGER', 'TRAIN',
  'TREE', 'TRUMPET', 'UMBRELLA', 'VIOLIN', 'WATER', 'WHALE', 'WIND', 'WINDOW', 'WIZARD', 'WOOD',
  'ZEBRA',
];

export const teamOf = (seat: SeatId): CwTeam | null => {
  const i = PAIRS.findIndex((pair) => pair.includes(seat));
  return i < 0 ? null : i as CwTeam;
};
export const otherTeam = (t: CwTeam): CwTeam => t === 0 ? 1 : 0;
/** The starting side has nine words, the other eight, as in the classic game. */
export const targetOf = (t: CwTeam): number => t === 0 ? 9 : 8;

export interface CwCard { word: string; kind: CardKind; revealed: boolean }
export interface CwClue { by: CwTeam; word: string; count: number; left: number }

export interface ClueWordsState {
  config: ClueWordsConfig;
  order: SeatId[];
  team: Record<SeatId, CwTeam>;
  spymaster: Record<CwTeam, SeatId>;
  cards: CwCard[];
  turnTeam: CwTeam;
  clue: CwClue | null;
  found: Record<CwTeam, number>;
  lines: string[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface ClueWordsView {
  you: SeatId | null;
  teams: Record<SeatId, CwTeam>;
  spymaster: Record<CwTeam, SeatId>;
  order: SeatId[];
  turnTeam: CwTeam;
  phase: 'clue' | 'guessing' | 'over';
  clue: CwClue | null;
  /** Hidden kinds are null unless you're a clue-giver, the word is revealed,
   *  or the game is over (watchers see the key so they can enjoy it). */
  cards: { word: string; revealed: boolean; kind: CardKind | null }[];
  found: Record<CwTeam, number>;
  target: Record<CwTeam, number>;
  lines: string[];
  result: GameResult | null;
}

const guessers = (s: ClueWordsState, t: CwTeam) => s.order.filter((p) => s.team[p] === t && p !== s.spymaster[t]);

function shuffle(random: () => number): string[] {
  const deck = [...WORDS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(random, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function endTurn(s: ClueWordsState, line?: string): ClueWordsState {
  return { ...s, turnTeam: otherTeam(s.turnTeam), clue: null, lines: line ? [...s.lines, line] : s.lines };
}

function finish(s: ClueWordsState, winners: CwTeam, reason: string): ClueWordsState {
  const first = s.order.filter((p) => s.team[p] === winners);
  const second = s.order.filter((p) => s.team[p] !== winners);
  return { ...s, clue: null, result: { winner: null, placings: [first, second], reason, teamWin: true } };
}

export const clueWords = withHistory<ClueWordsState, ClueWordsConfig>({
  id: 'cluewords',
  name: 'Clue Words',
  description: 'A team word game: clue-givers see the key, guessers find their side’s words, and one wrong word on the spy loses the game.',
  howToPlay: {
    goal: 'Find all nine words on your side (eight for the second side) before the other team finds theirs. Revealing the spy loses at once.',
    sections: [
      { title: 'The board', points: [
        'Twenty-five words are laid out in a five-by-five grid: nine for the Sun team, eight for the Moon team, seven neutral, and one spy.',
        'One player on each side is the clue-giver. Clue-givers (and watchers) see which word is which; everyone sees the words themselves.',
        'Your side has its own private chat tab. The clue-giver gives the clue at the table; the guessers talk it over in team chat.',
      ] },
      { title: 'A turn', points: [
        'The clue-giver says one word and a number: the word is about that many of their side’s words on the board.',
        'Their guessers may reveal up to one more word than the number. They can stop whenever they like, and the turn passes when they use all their guesses.',
        'Revealing one of your own words continues the turn. Revealing the other side’s or a neutral word ends it. Revealing the spy loses the game.',
      ] },
      { title: 'Teams', points: [
        'Amber and Violet are the Sun team; Teal and Rose are the Moon team. Amber and Teal start as clue-givers.',
        'Everyone on the winning side gets the win. Replays show what a watcher saw, including the whole key.',
      ] },
    ],
  },
  seats: SEATS.map((id) => ({ id, label: `${LABEL[id]} (${TEAM_NAMES[teamOf(id)!]})` })) as SeatDef[],
  defaultConfig: {},
  parseConfig: () => ({}),
  describeConfig: () => 'Family words · 5×5 board',

  create(_config, _now, ctx) {
    const order = [...ctx.seats];
    const team = Object.fromEntries(order.map((p) => [p, teamOf(p) ?? 0])) as Record<SeatId, CwTeam>;
    const spymaster = {
      0: order.find((p) => team[p] === 0) ?? SEATS[0],
      1: order.find((p) => team[p] === 1) ?? SEATS[1],
    } as Record<CwTeam, SeatId>;
    const deck = shuffle(ctx.random);
    const cards = deck.slice(0, 25).map((word, i): CwCard => ({
      word, kind: i < 9 ? 0 : i < 17 ? 1 : i < 24 ? 'neutral' : 'assassin', revealed: false,
    }));
    return { config: {}, order, team, spymaster, cards, turnTeam: 0, clue: null, found: { 0: 0, 1: 0 }, lines: ['The Sun team starts.'], result: null };
  },

  act(s, seat, action, _now, _ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You are not playing' };
    const a = (action ?? {}) as Record<string, unknown>;

    if (a.type === 'clue') {
      if (s.clue) return { error: 'The clue has already been given' };
      if (seat !== s.spymaster[s.turnTeam]) return { error: 'Only the clue-giver can give a clue' };
      const word = typeof a.word === 'string' ? a.word.trim().toUpperCase() : '';
      if (!/^[A-Z][A-Z'-]*$/.test(word) || word.length > 40) return { error: 'Give one word' };
      const count = a.count;
      const max = targetOf(s.turnTeam) - s.found[s.turnTeam];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > max) return { error: `Give a number from 1 to ${max}` };
      return { state: {
        ...s, clue: { by: s.turnTeam, word, count, left: count + 1 },
        lines: [...s.lines, `${LABEL[seat]} says “${word}” — ${count}.`],
      } };
    }

    if (a.type === 'guess') {
      if (!s.clue) return { error: 'Wait for a clue' };
      if (s.team[seat] !== s.turnTeam || seat === s.spymaster[s.turnTeam]) return { error: 'Only the guessers on this team can guess' };
      const card = a.card;
      if (typeof card !== 'number' || !Number.isInteger(card) || card < 0 || card >= s.cards.length) return { error: 'Pick a word on the board' };
      const picked = s.cards[card];
      if (picked.revealed) return { error: 'That word is already revealed' };
      const next: ClueWordsState = {
        ...s, cards: s.cards.map((c, i) => i === card ? { ...c, revealed: true } : c),
        lines: [...s.lines, `${LABEL[seat]} guesses ${picked.word}.`],
      };
      if (picked.kind === 'assassin') {
        const winner = otherTeam(s.turnTeam);
        return { state: finish({ ...next, lines: [...next.lines, `That was the spy: ${TEAM_NAMES[winner]} wins.`] }, winner, 'the other side found the spy') };
      }
      if (picked.kind === s.turnTeam) {
        const found = { ...s.found, [s.turnTeam]: s.found[s.turnTeam] + 1 } as Record<CwTeam, number>;
        const withFind = { ...next, found, lines: [...next.lines, `${TEAM_NAMES[s.turnTeam]} finds ${picked.word}.`] };
        if (found[s.turnTeam] === targetOf(s.turnTeam)) return { state: finish(withFind, s.turnTeam, 'finding every word on their side') };
        if (s.clue.left <= 1) return { state: endTurn(withFind, `${LABEL[seat]} used the last guess.`) };
        return { state: { ...withFind, clue: { ...s.clue, left: s.clue.left - 1 } } };
      }
      const what = picked.kind === 'neutral' ? 'neutral' : `${TEAM_NAMES[picked.kind]}'s`;
      return { state: endTurn({ ...next, lines: [...next.lines, `${picked.word} was ${what}.`] }) };
    }

    if (a.type === 'stop') {
      if (!s.clue) return { error: 'Wait for a clue' };
      if (s.team[seat] !== s.turnTeam || seat === s.spymaster[s.turnTeam]) return { error: 'Only the guessers on this team can stop' };
      return { state: endTurn(s, `${LABEL[seat]} stops guessing.`) };
    }
    return { error: 'That is not a move here' };
  },

  turn(s) {
    if (s.result) return [];
    return s.clue ? guessers(s, s.turnTeam) : [s.spymaster[s.turnTeam]];
  },
  timeout(s, seat) {
    if (s.result || !this.turn!(s).includes(seat)) return s;
    return endTurn(s, `${LABEL[seat]} ran out of time${s.clue ? ' and passes the turn' : ' and gives no clue'}.`);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): ClueWordsView {
    const seated = !!viewer && s.order.includes(viewer);
    const key = !seated || !!s.result || !!viewer && (viewer === s.spymaster[0] || viewer === s.spymaster[1]);
    return {
      you: seated ? viewer : null,
      teams: s.team,
      spymaster: s.spymaster,
      order: s.order,
      turnTeam: s.turnTeam,
      phase: s.result ? 'over' : s.clue ? 'guessing' : 'clue',
      clue: s.clue,
      cards: s.cards.map((c) => ({ word: c.word, revealed: c.revealed, kind: key || c.revealed ? c.kind : null })),
      found: s.found,
      target: { 0: targetOf(0), 1: targetOf(1) },
      lines: s.lines,
      result: s.result,
    };
  },

  teamChat(s, viewer): { channel: TextChannel; label: string } | null {
    if (!viewer || !s.order.includes(viewer)) return null;
    const t = s.team[viewer];
    return { channel: `team-${t}`, label: `${TEAM_NAMES[t]} team` };
  },
}, { keys: ['word', 'count', 'card'] });
