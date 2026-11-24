// Fill the Blank (#47): our own fill-in-the-blank party game. A judge reads a
// question with a blank; everyone else slips in one card from a hidden hand.
// The cards are shuffled and read out anonymously, and the judge picks the
// funniest. A point for each round won; most points after everyone judges wins.

import type { GameResult, SeatDef, SeatId } from '../game';
import { randInt, withHistory, type GameHistory } from './history';

export type Phase = 'play' | 'judge' | 'over';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const HAND_SIZE = 5;
export const QUESTION_MAX = 120;
export const ANSWER_MAX = 60;
export const CUSTOM_MAX = 80;
export const SEATS: SeatDef[] = [
  { id: 'amber', label: 'Amber' }, { id: 'teal', label: 'Teal' }, { id: 'violet', label: 'Violet' }, { id: 'rose', label: 'Rose' },
  { id: 'lime', label: 'Lime' }, { id: 'blue', label: 'Blue' }, { id: 'red', label: 'Red' }, { id: 'slate', label: 'Slate' },
];

/** Our own family-friendly cards. The judge's question always has a blank. */
const QUESTIONS = [
  'The secret ingredient in Grandma’s ___ is love.',
  'A good picnic needs a blanket, some sandwiches and ___.',
  'The worst thing to find in your backpack is ___.',
  'If a ___ could talk, the first thing it would say is “hello”.',
  'The king’s royal advisor is a ___.',
  'Nobody expected the ___ to win the talent show.',
  'My favourite smell in the whole world is ___.',
  'The dog looked at the ___ and decided to run.',
  'A very bad superpower would be ___.',
  'On a rainy day, the best place to be is ___.',
  'The teacher was surprised to find a ___ on their desk.',
  'The treasure map said to dig under the ___.',
  'Every family road trip needs a ___.',
  'The robot’s first job was to ___.',
  'The museum’s newest exhibit is a ___.',
  'The little dragon was afraid of ___.',
  'You know it’s a good party when someone brings a ___.',
  'The astronaut packed a sandwich and a ___.',
  'The best name for a pet ___ would be ___.',
  'At the end of the story, everyone shared a ___.',
  'The wizard’s spell went wrong and turned the ___ into a ___.',
  'A terrible thing to hear from your dentist is ___.',
  'The detective’s clue was a ___.',
  'The circus hired a ___ to do the announcements.',
  'The recipe called for one cup of ___ and a pinch of salt.',
];

const ANSWERS = [
  'a rubber chicken', 'a very small umbrella', 'a bag of onions', 'a singing potato', 'three clean socks',
  'a sleepy llama', 'the family cat', 'a enormous sandwich', 'a broken clock', 'a pocket full of jelly',
  'a brave little toaster', 'a suspicious cabbage', 'a disco ball', 'a garden gnome', 'a paper crown',
  'a cup of tea', 'a loud parrot', 'a second breakfast', 'a rubber duck', 'a mountain of socks',
  'a grumpy cactus', ' secretly a spy', ' a hamster in a hat', 'the wrong bus', 'a cardboard box',
  'a bag of popcorn', 'a tin of paint', 'the school choir', 'a very long scarf', 'a plastic flamingo',
  'an angry pickle', 'a magic pencil', 'a bowl of custard', 'a tiny trampoline', 'a lost shoe',
  'a duck on a skateboard', 'a plate of spaghetti', 'a snowman in July', 'a broken pencil', 'a borrowed moustache',
  'a quiz with no answers', 'a pillow fort', 'an upside-down map', 'a jar of buttons', 'a tiny drum',
  'the last slice of cake', 'a nervous penguin', 'a pile of leaves', 'a disco nap', 'a wooden spoon',
  'a cloud shaped like a fish', 'a surprise party', 'a detective’s notebook', 'a tall glass of lemonade', 'a second cup of coffee',
];

export interface FillBlankConfig {
  players: number;
  /** Host-added cards, cleaned by parseConfig (strings or arrays both accepted). */
  questions: string[];
  answers: string[];
}

export interface Play {
  by: SeatId;
  text: string;
}

export interface FillBlankState {
  config: FillBlankConfig;
  order: SeatId[];
  round: number;
  rounds: number;
  judge: SeatId;
  phase: Phase;
  question: string;
  hands: Record<SeatId, string[]>;
  draw: string[];
  discard: string[];
  questionDraw: string[];
  questionDiscard: string[];
  plays: Play[];
  points: Record<SeatId, number>;
  log: string[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface FillBlankView {
  you: SeatId | null;
  order: SeatId[];
  round: number;
  rounds: number;
  judge: SeatId | null;
  phase: Phase;
  question: string;
  /** Only your own cards, hidden from everyone else (including watchers). */
  hand: string[] | null;
  /** The card you slipped in this round, so you can spot it in the read-out. */
  played: string | null;
  /** Anonymous read-out; authors never appear here. */
  plays: { label: string; text: string }[];
  due: SeatId[];
  points: Record<SeatId, number>;
  log: string[];
  result: GameResult | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const nameOf = (ctx: { names?: Record<SeatId, string> }, seat: SeatId) => ctx.names?.[seat] ?? seat;
const LABELS = 'ABCDEFGH';

function tidy(raw: unknown, maxLength: number, blank: boolean): string[] {
  const lines = typeof raw === 'string' ? raw.split(/\n+/) : Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of lines) {
    if (typeof item !== 'string') continue;
    const body = item.trim().replace(/\s+/g, ' ').slice(0, maxLength);
    if (body.length < 2) continue;
    const text = blank && !body.includes('___') ? `${body} ___` : body;
    if (!out.includes(text)) out.push(text);
    if (out.length === CUSTOM_MAX) break;
  }
  return out;
}

const tidyQuestions = (raw: unknown) => tidy(raw, QUESTION_MAX, true);
const tidyAnswers = (raw: unknown) => tidy(raw, ANSWER_MAX, false);

/** Fisher-Yates through randInt, so a shuffle can be replayed exactly. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(random, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Take one card, reshuffling the discards when the deck runs dry. */
function take(draw: string[], discard: string[], random: () => number) {
  let deck = [...draw];
  let used = [...discard];
  if (!deck.length) { deck = shuffle(used, random); used = []; }
  const card = deck.shift()!;
  return { card, draw: deck, discard: used };
}

function pool(base: string[], custom: string[], count: number): string[] {
  const cards = [...new Set([...base, ...custom])];
  const copies = Math.max(1, Math.ceil(count / cards.length));
  return Array.from({ length: copies }, () => cards).flat();
}

function due(s: FillBlankState): SeatId[] {
  if (s.result) return [];
  return s.phase === 'judge' ? [s.judge] : s.order.filter((p) => p !== s.judge && !s.plays.some((play) => play.by === p));
}

function finish(s: FillBlankState): FillBlankState {
  const ranked = [...s.order].sort((a, b) => s.points[b] - s.points[a] || s.order.indexOf(a) - s.order.indexOf(b));
  const placings: SeatId[][] = [];
  let last: number | undefined;
  for (const p of ranked) {
    if (s.points[p] !== last) { placings.push([]); last = s.points[p]; }
    placings[placings.length - 1].push(p);
  }
  return {
    ...s, phase: 'over', plays: [],
    result: { winner: placings[0].length === 1 ? placings[0][0] : null, placings, reason: 'the most funny answers' },
  };
}

function advance(s: FillBlankState, ctx: { random(): number }): FillBlankState {
  const used = [...s.questionDiscard, s.question];
  const round = s.round + 1;
  if (round > s.rounds) return finish({ ...s, questionDiscard: used });
  const next = take(s.questionDraw, used, ctx.random);
  return {
    ...s, round, judge: s.order[(round - 1) % s.order.length], phase: 'play', question: next.card,
    questionDraw: next.draw, questionDiscard: next.discard, plays: [],
  };
}

/** All the cards are in: shuffle them for the read-out. They were stored in
 *  the order played, which the log shows by name, so unshuffled letters
 *  would tell the judge who wrote each one. */
function reveal(s: FillBlankState, ctx: { random(): number }): FillBlankState {
  return { ...s, phase: 'judge', plays: shuffle(s.plays, ctx.random), log: [...s.log, 'All the cards are in — judge, pick your favourite.'] };
}

function playCard(s: FillBlankState, seat: SeatId, index: number, ctx: { random(): number; names?: Record<SeatId, string> }): FillBlankState {
  const hand = s.hands[seat];
  const card = hand[index];
  const replacement = take(s.draw, s.discard, ctx.random);
  const hands = { ...s.hands, [seat]: [...hand.filter((_, i) => i !== index), replacement.card] };
  const next: FillBlankState = {
    ...s, hands, draw: replacement.draw, discard: [...replacement.discard, card],
    plays: [...s.plays, { by: seat, text: card }],
    log: [...s.log, `${nameOf(ctx, seat)} slipped in a card.`],
  };
  return due(next).length ? next : reveal(next, ctx);
}

function judgePick(s: FillBlankState, index: number, ctx: { random(): number; names?: Record<SeatId, string> }): FillBlankState {
  const chosen = s.plays[index];
  const points = { ...s.points, [chosen.by]: s.points[chosen.by] + 1 };
  const log = [...s.log, `${nameOf(ctx, chosen.by)}’s “${chosen.text}” wins round ${s.round}.`];
  return advance({ ...s, points, log }, ctx);
}

export const fillTheBlank = withHistory<FillBlankState, FillBlankConfig>({
  id: 'filltheblank',
  name: 'Fill the Blank',
  description: 'A judge reads a question with a blank; everyone else secretly plays a card. Read them out anonymously and give a point to the funniest.',
  howToPlay: {
    goal: 'Play the card that makes the judge’s question funniest. Win rounds to earn points, and have the most when everyone has judged.',
    sections: [
      { title: 'A round', points: [
        'Each player starts with five answer cards, hidden from everyone else. One player is the judge for the round and reads out a question with a blank.',
        'Everyone else chooses one of their cards and slips it in. Nobody sees who played which card, and table chat stays out of it until the judge has picked.',
        'When every card is in, the answers are read out in a random order with letters instead of names.',
      ] },
      { title: 'Judging', points: [
        'The judge picks their favourite answer and it scores one point. The winner is named only after the pick.',
        'Used cards are replaced, the next player becomes judge, and a new question is read out.',
        'If the move timer runs out, the game plays a card for anyone who hasn’t and picks for the judge.',
      ] },
      { title: 'Scores', points: [
        'Play one round per player. Most points wins; a tie shares the place and scores as a shared first.',
        'Watchers see the read-out but never any player’s hand. Replays show the watcher’s view after each card and pick.',
      ] },
    ],
  },
  seats: SEATS,
  minPlayers: MIN_PLAYERS,
  seatsFor: (config) => SEATS.slice(0, config.players),
  defaultConfig: { players: 4, questions: [], answers: [] },
  parseConfig(raw) {
    const r = (raw ?? {}) as Partial<FillBlankConfig>;
    const players = typeof r.players === 'number' && Number.isInteger(r.players)
      ? clamp(r.players, MIN_PLAYERS, MAX_PLAYERS) : 4;
    return { players, questions: tidyQuestions(r.questions), answers: tidyAnswers(r.answers) };
  },
  configError(raw) {
    const r = (raw ?? {}) as { questions?: unknown; answers?: unknown };
    for (const [key, label] of [['questions', 'question'], ['answers', 'answer']] as const) {
      const value = r[key];
      if (typeof value === 'string') {
        if (value.length > 4000) return `Keep your own ${label} cards to 4,000 characters`;
        if (value.trim() && !tidy(value, key === 'questions' ? QUESTION_MAX : ANSWER_MAX, key === 'questions').length) {
          return `Use ${label} cards of at least two characters, one per line`;
        }
      }
    }
    return null;
  },
  describeConfig: (c) => `${c.players} players · family deck${c.questions.length || c.answers.length ? ' + own cards' : ''}`,

  create(config, _now, ctx) {
    const order = [...ctx.seats].slice(0, config.players);
    const rounds = order.length;
    const answers = pool(ANSWERS, config.answers, order.length * (HAND_SIZE + rounds));
    const questions = pool(QUESTIONS, config.questions, rounds);
    const shuffledAnswers = shuffle(answers, ctx.random);
    const shuffledQuestions = shuffle(questions, ctx.random);
    const hands = Object.fromEntries(order.map((p) => [p, shuffledAnswers.splice(0, HAND_SIZE)])) as Record<SeatId, string[]>;
    const question = shuffledQuestions.shift()!;
    const points = Object.fromEntries(order.map((p) => [p, 0])) as Record<SeatId, number>;
    return {
      config, order, round: 1, rounds, judge: order[0], phase: 'play', question, hands,
      draw: shuffledAnswers, discard: [], questionDraw: shuffledQuestions, questionDiscard: [],
      plays: [], points, log: [`Round 1: ${nameOf(ctx, order[0])} is the judge.`], result: null,
    };
  },

  act(s, seat, action, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You are not playing' };
    const a = (action ?? {}) as Record<string, unknown>;

    if (a.type === 'play') {
      if (s.phase !== 'play') return { error: 'Wait for the judge to pick' };
      if (seat === s.judge) return { error: 'The judge doesn’t play a card' };
      if (s.plays.some((p) => p.by === seat)) return { error: 'You have already played a card' };
      const index = a.card;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= s.hands[seat].length) return { error: 'Pick a card from your hand' };
      return { state: playCard(s, seat, index, ctx) };
    }

    if (a.type === 'pick') {
      if (s.phase !== 'judge') return { error: 'Wait for all the cards' };
      if (seat !== s.judge) return { error: 'Only the judge can pick a winner' };
      const index = a.play;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= s.plays.length) return { error: 'Pick one of the answers' };
      return { state: judgePick(s, index, ctx) };
    }
    return { error: 'That is not a move here' };
  },

  turn: (s) => due(s),
  timeout(s, seat, _now, ctx) {
    if (s.result || !due(s).includes(seat)) return s;
    if (s.phase === 'judge') return judgePick(s, randInt(ctx.random, s.plays.length), ctx);
    let next = s;
    for (const p of due(s)) {
      const hand = next.hands[p];
      next = playCard(next, p, randInt(ctx.random, hand.length), ctx);
    }
    return next;
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): FillBlankView {
    const seated = !!viewer && s.order.includes(viewer);
    const points: Record<SeatId, number> = {};
    for (const p of s.order) points[p] = s.points[p] ?? 0;
    const plays = s.phase === 'play' && !s.result ? [] : s.plays.map((p, i) => ({ label: LABELS[i] ?? String(i + 1), text: p.text }));
    return {
      you: seated ? viewer : null,
      order: s.order,
      round: s.round,
      rounds: s.rounds,
      judge: s.result ? null : s.judge,
      phase: s.result ? 'over' : s.phase,
      question: s.question,
      hand: seated ? [...s.hands[viewer!]] : null,
      played: seated ? s.plays.find((p) => p.by === viewer)?.text ?? null : null,
      plays,
      due: due(s),
      points,
      log: s.log,
      result: s.result,
    };
  },
}, { keys: ['card', 'play'] });
