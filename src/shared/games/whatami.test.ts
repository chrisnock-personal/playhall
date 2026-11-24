import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameContext } from '../game';
import { whatAmI, MIN_PLAYERS, MAX_PLAYERS, SEATS, type WhatAmIConfig, type WhatAmIState, type WhatAmIView } from './whatami';

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

const config = (over: Partial<WhatAmIConfig> = {}): WhatAmIConfig => ({ ...whatAmI.defaultConfig, ...over });
const context = (c: WhatAmIConfig = config()): GameContext => ({ seats: SEATS.slice(0, c.players).map((s) => s.id), random: seeded(7) });

function apply(s: WhatAmIState, seat: string, action: unknown, ctx: GameContext): WhatAmIState {
  const r = whatAmI.act(s, seat, action, 0, ctx);
  if ('error' in r) throw new Error(r.error);
  return r.state;
}

const viewOf = (s: WhatAmIState, viewer: string | null) => whatAmI.view(s, 0, viewer) as WhatAmIView;

function askAndAnswer(s: WhatAmIState, ctx: GameContext, text = 'Is it an animal?') {
  const guesser = s.guesser;
  s = apply(s, guesser, { type: 'question', text }, ctx);
  for (const p of s.order.filter((seat) => seat !== guesser)) s = apply(s, p, { type: 'answer', answer: 'yes' }, ctx);
  return s;
}

test('host settings: seat count, category and own words are cleaned and described', () => {
  assert.equal(MIN_PLAYERS, 3);
  assert.equal(MAX_PLAYERS, 8);
  assert.deepEqual(whatAmI.seatsFor!(config({ players: 5 })).map((s) => s.id), ['amber', 'teal', 'violet', 'rose', 'lime']);
  assert.equal(whatAmI.parseConfig({ players: 99 }).players, 8);
  assert.equal(whatAmI.parseConfig({ players: 1 }).players, 3);
  assert.equal(whatAmI.parseConfig({ category: 'nonsense' }).category, 'mixed');
  assert.deepEqual(whatAmI.parseConfig({ custom: ' cat, dog\ncat ;  bad-word!\nELEPHANT' }).custom, ['CAT', 'DOG', 'ELEPHANT']);
  assert.equal(whatAmI.configError!({ custom: '! ?' }), 'Use words of 2-24 letters, one per line or separated by commas');
  assert.equal(whatAmI.configError!({ custom: '' }), null);
  assert.match(whatAmI.describeConfig(config({ players: 6, category: 'food', custom: ['TACO'] })), /6 players · Food \+ own words/);
  assert.ok(whatAmI.parseConfig({ custom: 'BICYCLE' }).custom.length === 1);
});

test('every player sees other people’s words but not their own; watchers see all', () => {
  const ctx = context();
  const s = whatAmI.create(config(), 0, ctx);
  assert.equal(s.order.length, 4);
  assert.equal(new Set(Object.values(s.words)).size, 4);
  assert.equal(s.guesser, 'amber');
  assert.deepEqual(whatAmI.turn!(s), ['amber']);
  assert.equal(viewOf(s, 'amber').words.amber, null, 'the asker cannot see their own word');
  assert.equal(viewOf(s, 'teal').words.amber, s.words.amber, 'everyone else can');
  assert.equal(viewOf(s, 'teal').words.teal, null);
  assert.ok(Object.values(viewOf(s, null).words).every((w) => w !== null), 'watchers see every word');
  assert.equal(viewOf(s, 'stranger').you, null);
});

test('questions, answers and guesses follow the turn', () => {
  const ctx = context();
  let s = whatAmI.create(config(), 0, ctx);
  assert.ok('error' in whatAmI.act(s, 'teal', { type: 'question', text: 'Animal?' }, 0, ctx));
  assert.ok('error' in whatAmI.act(s, 'amber', { type: 'guess', word: s.words.amber }, 0, ctx), 'ask a question first');
  assert.ok('error' in whatAmI.act(s, 'amber', { type: 'question', text: 'x'.repeat(41) }, 0, ctx));

  s = apply(s, 'amber', { type: 'question', text: 'Is it an animal?' }, ctx);
  assert.equal(s.phase, 'answers');
  assert.deepEqual(whatAmI.turn!(s), ['teal', 'violet', 'rose']);
  assert.ok('error' in whatAmI.act(s, 'amber', { type: 'answer', answer: 'yes' }, 0, ctx));
  assert.ok('error' in whatAmI.act(s, 'teal', { type: 'answer', answer: 'perhaps' }, 0, ctx));
  assert.ok('error' in whatAmI.act(s, 'amber', { type: 'guess', word: s.words.amber }, 0, ctx), 'wait for the answers');
  s = apply(s, 'teal', { type: 'answer', answer: 'yes' }, ctx);
  s = apply(s, 'violet', { type: 'answer', answer: 'no' }, ctx);
  assert.equal(s.phase, 'answers', 'still waiting for Rose');
  assert.ok('error' in whatAmI.act(s, 'violet', { type: 'answer', answer: 'no' }, 0, ctx), 'one answer each');
  s = apply(s, 'rose', { type: 'answer', answer: 'maybe' }, ctx);
  assert.equal(s.phase, 'question');
  assert.equal(s.roundQuestions, 1);
  assert.deepEqual(whatAmI.turn!(s), ['amber']);
  assert.match(s.log.at(-1)!, /teal: yes, violet: no, rose: maybe/);
  assert.equal(viewOf(s, 'amber').log.at(-1), s.log.at(-1));

  s = apply(s, 'amber', { type: 'guess', word: 'NOT THE WORD' }, ctx);
  assert.equal(s.correct.amber, undefined, 'a wrong guess does not score');
  assert.equal(s.roundQuestions, 1, 'a wrong guess is free');
  assert.equal(s.round, 1);
  assert.ok('error' in whatAmI.act(s, 'amber', { type: 'guess', word: s.words.amber }, 0, ctx), 'one guess per question');
  assert.equal(viewOf(s, 'amber').guessed, true, 'the asker sees their guess is used');
  s = apply(s, 'amber', { type: 'question', text: 'Is it big?' }, ctx);
  for (const p of ['teal', 'violet', 'rose']) s = apply(s, p, { type: 'answer', answer: 'no' }, ctx);
  s = apply(s, 'amber', { type: 'guess', word: s.words.amber.toLowerCase() }, ctx);
  assert.equal(s.correct.amber, 2, 'two questions; the wrong guess cost nothing');
  assert.equal(s.round, 2);
  assert.equal(s.guesser, 'teal');
  assert.equal(s.phase, 'question');
  assert.equal(viewOf(s, 'amber').words.amber, s.words.amber, 'the word is revealed after the turn');
  assert.equal(viewOf(s, 'teal').words.teal, null, 'the next player’s word stays hidden');
});

test('the move timer skips a silent asker and fills in missing answers', () => {
  const ctx = context();
  let s = whatAmI.create(config(), 0, ctx);
  s = whatAmI.timeout!(s, 'amber', 0, ctx);
  assert.equal(s.round, 2);
  assert.equal(s.guesser, 'teal');
  assert.equal(viewOf(s, 'amber').words.amber, s.words.amber, 'a skipped player still learns the word');

  s = apply(s, 'teal', { type: 'question', text: 'Is it food?' }, ctx);
  s = apply(s, 'amber', { type: 'answer', answer: 'no' }, ctx);
  s = whatAmI.timeout!(s, 'rose', 0, ctx);
  assert.equal(s.phase, 'question', 'all outstanding answers are filled in');
  assert.match(s.log.at(-1)!, /amber: no, violet: maybe, rose: maybe/);
  assert.equal(s.roundQuestions, 1);
  assert.equal(whatAmI.timeout!(s, 'stranger', 0, ctx), s, 'only the side to move times out');
});

test('fewest questions places first, and nobody winning is a draw', () => {
  const ctx = context(config({ players: 3 }));
  let s = whatAmI.create(config({ players: 3 }), 0, ctx);
  s = askAndAnswer(s, ctx);
  s = apply(s, 'amber', { type: 'guess', word: s.words.amber }, ctx);
  s = askAndAnswer(s, ctx);
  s = askAndAnswer(s, ctx, 'Is it a food?');
  s = apply(s, 'teal', { type: 'guess', word: s.words.teal }, ctx);
  s = whatAmI.timeout!(s, 'violet', 0, ctx);
  assert.deepEqual(s.result, {
    winner: null, placings: [['amber'], ['teal'], ['violet']],
    reason: 'fewest questions to a correct guess',
  });
  assert.deepEqual(viewOf(s, 'amber').points, { amber: 3, teal: 1, violet: 0 });
  assert.ok('error' in whatAmI.act(s, 'amber', { type: 'question', text: 'More?' }, 0, ctx));

  let none = whatAmI.create(config({ players: 3 }), 0, context(config({ players: 3 })));
  for (const seat of ['amber', 'teal', 'violet']) none = whatAmI.timeout!(none, seat, 0, context(config({ players: 3 })));
  assert.equal(none.result?.nobodyWins, true);
  assert.deepEqual(none.result?.placings, [['amber', 'teal', 'violet']]);
});

test('a tie on questions shares a place', () => {
  const ctx = context(config({ players: 3 }));
  let s = whatAmI.create(config({ players: 3 }), 0, ctx);
  s = askAndAnswer(s, ctx);
  s = apply(s, 'amber', { type: 'guess', word: s.words.amber }, ctx);
  s = askAndAnswer(s, ctx);
  s = apply(s, 'teal', { type: 'guess', word: s.words.teal }, ctx);
  s = whatAmI.timeout!(s, 'violet', 0, ctx);
  assert.deepEqual(s.result?.placings, [['amber', 'teal'], ['violet']]);
  assert.deepEqual(viewOf(s, 'teal').points, { amber: 1, teal: 1, violet: 0 });
});

test('replays show the watcher’s view after each question, answer and guess', () => {
  const ctx = context();
  let s = whatAmI.create(config(), 0, ctx);
  s = askAndAnswer(s, ctx);
  s = apply(s, 'amber', { type: 'guess', word: s.words.amber }, ctx);
  s = apply(s, 'teal', { type: 'question', text: 'Is it a colour?' }, ctx);
  s = whatAmI.timeout!(s, 'amber', 0, ctx);
  const frames = whatAmI.replay!(s);
  assert.equal(frames.length, s.history!.steps.length + 1);
  assert.deepEqual(frames[0], viewOf(whatAmI.create(config(), 0, context()), null), 'the same words at the start');
  assert.deepEqual(frames.at(-1), viewOf(s, null));
  assert.ok((frames[0] as WhatAmIView).words.amber, 'watchers saw every word from the first frame');
  assert.deepEqual(whatAmI.replay!({ ...s, history: undefined }), [], 'older saves have no replay');
});

test('three players in a four-seat game each get a word, gaps and all', () => {
  const s = whatAmI.create({ players: 4, category: 'animals', custom: [] }, 0, { seats: ['amber', 'teal', 'rose'], random: () => 0.3 } as never);
  assert.deepEqual(Object.keys(s.words).sort(), ['amber', 'rose', 'teal']);
  assert.ok(Object.values(s.words).every((w) => typeof w === 'string' && w.length > 0));
});

test('a guess matches whatever its spaces, hyphens and case', () => {
  const ctx = { seats: ['amber', 'teal', 'violet'], random: () => 0 } as never;
  let s = whatAmI.create({ players: 3, category: 'characters', custom: [] }, 0, ctx);
  s = { ...s, words: { ...s.words, amber: 'SNOW WHITE' } };
  s = apply(s, 'amber', { type: 'question', text: 'Am I a princess?' }, ctx);
  for (const p of ['teal', 'violet']) s = apply(s, p, { type: 'answer', answer: 'yes' }, ctx);
  s = apply(s, 'amber', { type: 'guess', word: 'snow-white' }, ctx);
  assert.equal(s.correct.amber, 1);
});
