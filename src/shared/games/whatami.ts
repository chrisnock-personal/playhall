// What Am I? (#48): a talking party game for 3-8. Everyone can see your word
// but you. Ask the table yes/no questions, get answered out loud, and guess
// your word. Each player has one turn; the fewest questions to a correct guess
// takes the prize.

import type { GameResult, SeatDef, SeatId } from '../game';
import { score } from '../scoring';
import { randInt, withHistory, type GameHistory } from './history';

export type Answer = 'yes' | 'no' | 'maybe';
export type Category = 'mixed' | 'animals' | 'food' | 'jobs' | 'characters';
export type Phase = 'question' | 'answers' | 'over';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const QUESTION_MAX = 40;
export const CUSTOM_MAX = 60;
export const CATEGORIES: Category[] = ['mixed', 'animals', 'food', 'jobs', 'characters'];
export const CATEGORY_LABEL: Record<Category, string> = {
  mixed: 'Family mix', animals: 'Animals', food: 'Food', jobs: 'Jobs', characters: 'Story characters',
};
export const SEATS: SeatDef[] = [
  { id: 'amber', label: 'Amber' }, { id: 'teal', label: 'Teal' }, { id: 'violet', label: 'Violet' }, { id: 'rose', label: 'Rose' },
  { id: 'lime', label: 'Lime' }, { id: 'blue', label: 'Blue' }, { id: 'red', label: 'Red' }, { id: 'slate', label: 'Slate' },
];

/** Our own family-friendly words. No adult deck; hosts can add their own. */
const WORDS: Record<Exclude<Category, 'mixed'>, string[]> = {
  animals: ['ELEPHANT', 'KANGAROO', 'DOLPHIN', 'PENGUIN', 'GIRAFFE', 'TORTOISE', 'BUTTERFLY', 'OCTOPUS', 'HAMSTER', 'EAGLE', 'CROCODILE', 'OWL'],
  food: ['PIZZA', 'TACO', 'PANCAKE', 'POPCORN', 'ICE CREAM', 'SUSHI', 'WAFFLE', 'CHOCOLATE', 'BANANA', 'CARROT', 'MUFFIN', 'NOODLES'],
  jobs: ['TEACHER', 'DOCTOR', 'CHEF', 'PILOT', 'FARMER', 'ARTIST', 'PLUMBER', 'DENTIST', 'ASTRONAUT', 'LIBRARIAN', 'BAKER', 'ENGINEER'],
  characters: ['CINDERELLA', 'SNOW WHITE', 'RAPUNZEL', 'ROBIN HOOD', 'DRACULA', 'FRANKENSTEIN', 'MOBY DICK', 'PINOCCHIO', 'ALADDIN', 'HERCULES', 'PETER PAN', 'ODYSSEUS'],
};

export interface WhatAmIConfig {
  players: number;
  category: Category;
  /** Upper-case host words, already cleaned by parseConfig. */
  custom: string[];
}

export interface WhatAmIState {
  config: WhatAmIConfig;
  order: SeatId[];
  words: Record<SeatId, string>;
  round: number;
  guesser: SeatId;
  phase: Phase;
  question: string | null;
  answers: Partial<Record<SeatId, Answer>>;
  roundQuestions: number;
  /** Whether this turn's asker has guessed since their last answers: one
   *  guess per question. Missing in older saves = no. */
  guessed?: boolean;
  /** Correct guesses: the number of questions it took. */
  correct: Partial<Record<SeatId, number>>;
  /** Words their owner has learned (at the end of their turn, or at the end). */
  revealed: SeatId[];
  log: string[];
  result: GameResult | null;
  history?: GameHistory;
}

export interface WhatAmIView {
  you: SeatId | null;
  order: SeatId[];
  /** Your own word is null until your turn ends or the game is over. */
  words: Record<SeatId, string | null>;
  phase: Phase;
  round: number;
  guesser: SeatId | null;
  question: string | null;
  answers: Partial<Record<SeatId, Answer>>;
  roundQuestions: number;
  /** The asker has used this question's one guess. */
  guessed: boolean;
  correct: Partial<Record<SeatId, number>>;
  points: Record<SeatId, number>;
  /** Who the move timer is waiting on. */
  due: SeatId[];
  log: string[];
  result: GameResult | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function tidyWords(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\n,;]+/)) {
    const word = part.trim().toUpperCase().replace(/\s+/g, ' ');
    if (word.length >= 2 && word.length <= 24 && /^[A-Z][A-Z '-]*$/.test(word) && !out.includes(word)) out.push(word);
    if (out.length === CUSTOM_MAX) break;
  }
  return out;
}

export const wordsFor = (config: WhatAmIConfig): string[] => {
  const built = config.category === 'mixed' ? Object.values(WORDS).flat() : WORDS[config.category];
  return [...new Set([...built, ...config.custom])];
};

/** A word for each seat that's playing: the seats in `order`, which can have
 *  gaps (three players at Amber, Teal and Rose in a four-seat game). */
function drawWords(config: WhatAmIConfig, order: SeatId[], random: () => number): Record<SeatId, string> {
  const pool = [...wordsFor(config)];
  const words: Record<SeatId, string> = {};
  for (const seat of order) {
    const i = randInt(random, pool.length);
    words[seat] = pool[i];
    pool.splice(i, 1);
  }
  return words;
}

/** Letters only, so SNOW WHITE, Snow-White and snowwhite are the same guess. */
const letters = (w: string) => w.toUpperCase().replace(/[^A-Z]/g, '');

const nameOf = (ctx: { names?: Record<SeatId, string> }, seat: SeatId) => ctx.names?.[seat] ?? seat;
const ANSWER_LABEL: Record<Answer, string> = { yes: 'yes', no: 'no', maybe: 'maybe' };

function due(s: WhatAmIState): SeatId[] {
  if (s.result) return [];
  return s.phase === 'answers'
    ? s.order.filter((p) => p !== s.guesser && !s.answers[p])
    : [s.guesser];
}

function finish(s: WhatAmIState): WhatAmIState {
  const guessed = s.order.filter((p) => s.correct[p] !== undefined).sort((a, b) => s.correct[a]! - s.correct[b]!);
  const rest = s.order.filter((p) => s.correct[p] === undefined);
  let result: GameResult;
  if (!guessed.length) {
    result = { winner: null, placings: [s.order], reason: 'nobody guessed their word', nobodyWins: true };
  } else {
    const placings: SeatId[][] = [];
    let last: number | undefined;
    for (const p of guessed) {
      const questions = s.correct[p]!;
      if (questions !== last) { placings.push([]); last = questions; }
      placings[placings.length - 1].push(p);
    }
    if (rest.length) placings.push(rest);
    result = { winner: null, placings, reason: 'fewest questions to a correct guess' };
  }
  return { ...s, phase: 'over', guesser: s.guesser, revealed: [...new Set([...s.revealed, ...s.order])], result };
}

function nextTurn(s: WhatAmIState, revealed: boolean, ctx: { names?: Record<SeatId, string> }): WhatAmIState {
  const withReveal = revealed && !s.revealed.includes(s.guesser)
    ? { ...s, revealed: [...s.revealed, s.guesser] }
    : s;
  if (s.round >= s.order.length) return finish(withReveal);
  const round = s.round + 1;
  const guesser = s.order[round - 1];
  return {
    ...withReveal, round, guesser, phase: 'question', question: null, answers: {}, roundQuestions: 0, guessed: false,
    log: [...withReveal.log, `${nameOf(ctx, guesser)}'s turn: everyone but them can see their word.`],
  };
}

function afterAnswers(s: WhatAmIState, ctx: { names?: Record<SeatId, string> }): WhatAmIState {
  const answers = s.order.filter((p) => p !== s.guesser)
    .map((p) => `${nameOf(ctx, p)}: ${ANSWER_LABEL[s.answers[p] ?? 'maybe']}`).join(', ');
  return {
    ...s, phase: 'question', question: null, answers: {}, roundQuestions: s.roundQuestions + 1, guessed: false,
    log: [...s.log, `Q${s.roundQuestions + 1} — ${answers}`],
  };
}

export const whatAmI = withHistory<WhatAmIState, WhatAmIConfig>({
  id: 'whatami',
  name: 'What Am I?',
  description: 'Everyone sees your word but you. Ask the table yes/no questions, then guess it; the fewest questions to a correct guess wins.',
  howToPlay: {
    goal: 'Work out the word everyone else can see but you can’t. You get one turn each; the quickest correct guesses take the top places.',
    sections: [
      { title: 'The word', points: [
        'Each player is given a word. Everyone else sees it; you never do until your turn is over. Watchers see every word.',
        'The host picks a family word category (animals, food, jobs, story characters or a mix) and can add their own words.',
      ] },
      { title: 'Asking and answering', points: [
        'On your turn, type one short question and the other players answer yes, no or maybe with buttons. Talk it over in table chat or voice as well.',
        'After everyone has answered, ask another question or guess your word. You get one guess per question: a wrong guess costs nothing, but you ask again before your next one. Spaces and hyphens in a guess don’t matter.',
        'If the move timer runs out, your turn is skipped and your word is revealed to you.',
      ] },
      { title: 'Scores', points: [
        'A correct guess takes a place by how many questions it took: fewest first, then second and third. Players who never guess come after them.',
        'A tie shares a place; first place scores 3, or 1 each if shared, as in other games. Everyone gets one turn, then the game ends.',
      ] },
    ],
  },
  seats: SEATS,
  minPlayers: MIN_PLAYERS,
  seatsFor: (config) => SEATS.slice(0, config.players),
  defaultConfig: { players: 4, category: 'mixed', custom: [] },
  parseConfig(raw) {
    const r = (raw ?? {}) as Partial<WhatAmIConfig> & { custom?: unknown };
    const players = typeof r.players === 'number' && Number.isInteger(r.players)
      ? clamp(r.players, MIN_PLAYERS, MAX_PLAYERS) : 4;
    const category = CATEGORIES.includes(r.category as Category) ? r.category as Category : 'mixed';
    const custom = typeof r.custom === 'string' ? tidyWords(r.custom) : Array.isArray(r.custom) ? tidyWords(r.custom.join(', ')) : [];
    return { players, category, custom };
  },
  configError(raw) {
    const r = (raw ?? {}) as { custom?: unknown };
    if (typeof r.custom === 'string' && r.custom.length > 2000) return 'Keep your own words to 2,000 characters';
    if (typeof r.custom === 'string' && r.custom.trim() && !tidyWords(r.custom).length) return 'Use words of 2-24 letters, one per line or separated by commas';
    return null;
  },
  describeConfig: (c) => `${c.players} players · ${CATEGORY_LABEL[c.category]}${c.custom.length ? ' + own words' : ''}`,

  create(config, _now, ctx) {
    const order = ctx.seats.slice(0, config.players);
    return {
      config, order, words: drawWords(config, order, ctx.random),
      round: 1, guesser: order[0], phase: 'question', question: null, answers: {}, roundQuestions: 0,
      correct: {}, revealed: [], log: [`${nameOf(ctx, order[0])} goes first. Everyone else can see their word.`], result: null,
    };
  },

  act(s, seat, action, _now, ctx) {
    if (s.result) return { error: 'The game is over' };
    if (!s.order.includes(seat)) return { error: 'You are not playing' };
    const a = (action ?? {}) as Record<string, unknown>;

    if (a.type === 'question') {
      if (seat !== s.guesser) return { error: 'Only the player with the hidden word can ask' };
      if (s.phase !== 'question') return { error: 'Wait for the answers to your last question' };
      const text = typeof a.text === 'string' ? a.text.trim() : '';
      if (!text || text.length > QUESTION_MAX) return { error: `Ask a question of at most ${QUESTION_MAX} characters` };
      return { state: {
        ...s, phase: 'answers', question: text, answers: {},
        log: [...s.log, `${nameOf(ctx, seat)} asks: ${text}`],
      } };
    }

    if (a.type === 'answer') {
      if (seat === s.guesser) return { error: 'The player asking can’t answer' };
      if (s.phase !== 'answers' || !s.question) return { error: 'No question to answer' };
      if (s.answers[seat]) return { error: 'You have already answered' };
      const value = a.answer;
      if (value !== 'yes' && value !== 'no' && value !== 'maybe') return { error: 'Answer yes, no or maybe' };
      const next: WhatAmIState = { ...s, answers: { ...s.answers, [seat]: value as Answer } };
      return { state: due(next).length ? next : afterAnswers(next, ctx) };
    }

    if (a.type === 'guess') {
      if (seat !== s.guesser) return { error: 'Only the player with the hidden word can guess' };
      if (s.phase !== 'question' || !s.roundQuestions) return { error: 'Ask a question first' };
      if (s.guessed) return { error: 'One guess per question: ask another question first' };
      const word = typeof a.word === 'string' ? a.word.trim().toUpperCase().replace(/\s+/g, ' ') : '';
      if (!word || word.length > 24) return { error: 'Guess one word' };
      if (letters(word) !== letters(s.words[seat])) {
        // Wrong guesses are free, but one per question: otherwise guessing
        // every word in the category after one question would always win.
        return { state: { ...s, guessed: true, log: [...s.log, `${nameOf(ctx, seat)} guesses ${word} — no.`] } };
      }
      return { state: nextTurn({
        ...s, correct: { ...s.correct, [seat]: s.roundQuestions },
        log: [...s.log, `${nameOf(ctx, seat)} guesses ${word} — yes, in ${s.roundQuestions} ${s.roundQuestions === 1 ? 'question' : 'questions'}!`],
      }, true, ctx) };
    }
    return { error: 'That is not a move here' };
  },

  turn: (s) => due(s),
  timeout(s, seat, _now, ctx) {
    if (s.result || !due(s).includes(seat)) return s;
    if (s.phase === 'answers') {
      // Move time is shared by the answerers: fill everyone who hasn't replied.
      const answers = { ...s.answers };
      for (const p of s.order) if (p !== s.guesser && !answers[p]) answers[p] = 'maybe';
      return afterAnswers({ ...s, answers }, ctx);
    }
    return nextTurn({ ...s, log: [...s.log, `${nameOf(ctx, s.guesser)} ran out of time; their word was ${s.words[s.guesser]}.`] }, true, ctx);
  },
  tick: () => null,
  nextDeadline: () => null,
  result: (s) => s.result,

  view(s, _now, viewer): WhatAmIView {
    const seated = !!viewer && s.order.includes(viewer);
    const over = !!s.result;
    const words = Object.fromEntries(s.order.map((p) => [p,
      !seated || over || p !== viewer || s.revealed.includes(p) ? s.words[p] : null,
    ])) as Record<SeatId, string | null>;
    const points: Record<SeatId, number> = {};
    if (s.result) {
      const scored = score(s.result, s.order);
      for (const p of s.order) points[p] = scored[p].points;
    }
    return {
      you: seated ? viewer : null, order: s.order, words, phase: over ? 'over' : s.phase,
      round: s.round, guesser: over ? null : s.guesser, question: s.question, answers: s.answers,
      roundQuestions: s.roundQuestions, guessed: !!s.guessed, correct: s.correct, points, due: due(s), log: s.log, result: s.result,
    };
  },
}, { keys: ['text', 'answer', 'word'] });
