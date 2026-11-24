import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameContext } from '../game';
import { clueWords, PAIRS, SEATS, TEAM_NAMES, targetOf, type CardKind, type ClueWordsState, type ClueWordsView } from './cluewords';

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

const context = (): GameContext => ({ seats: [...SEATS], random: seeded(7) });

function apply(s: ClueWordsState, seat: string, action: unknown, ctx: GameContext): ClueWordsState {
  const r = clueWords.act(s, seat, action, 0, ctx);
  if ('error' in r) throw new Error(r.error);
  return r.state;
}

const board = (s: ClueWordsState, kinds: CardKind[]): ClueWordsState => ({
  ...s, cards: s.cards.map((c, i) => ({ ...c, kind: kinds[i] })),
});

const viewOf = (s: ClueWordsState, viewer: string | null) => clueWords.view(s, 0, viewer) as ClueWordsView;

test('four seats in two teams, with a 25-word board and one spy', () => {
  assert.deepEqual(clueWords.seats.map((s) => s.id), SEATS);
  assert.deepEqual(PAIRS, [['amber', 'violet'], ['teal', 'rose']]);
  assert.deepEqual(clueWords.seats.map((s) => s.label), ['Amber (Sun)', 'Teal (Moon)', 'Violet (Sun)', 'Rose (Moon)']);
  const s = clueWords.create(clueWords.defaultConfig, 0, context());
  assert.equal(s.cards.length, 25);
  assert.equal(new Set(s.cards.map((c) => c.word)).size, 25);
  assert.equal(s.cards.filter((c) => c.kind === 0).length, 9);
  assert.equal(s.cards.filter((c) => c.kind === 1).length, 8);
  assert.equal(s.cards.filter((c) => c.kind === 'neutral').length, 7);
  assert.equal(s.cards.filter((c) => c.kind === 'assassin').length, 1);
  assert.deepEqual(s.spymaster, { 0: 'amber', 1: 'teal' });
  assert.equal(s.turnTeam, 0);
  assert.deepEqual(clueWords.turn!(s), ['amber']);
  assert.equal(clueWords.result(s), null);
  assert.deepEqual(clueWords.seats.map((s) => s.label.length > 0), [true, true, true, true]);
  assert.match(clueWords.describeConfig(clueWords.defaultConfig), /5×5/);
});

test('only the clue-giver may give a one-word clue with a valid number', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  assert.ok('error' in clueWords.act(s, 'violet', { type: 'clue', word: 'SAIL', count: 1 }, 0, ctx));
  assert.ok('error' in clueWords.act(s, 'amber', { type: 'clue', word: 'two words', count: 1 }, 0, ctx));
  assert.ok('error' in clueWords.act(s, 'amber', { type: 'clue', word: 'SAIL', count: 10 }, 0, ctx));
  assert.ok('error' in clueWords.act(s, 'amber', { type: 'clue', word: 'SAIL', count: 0 }, 0, ctx));
  s = apply(s, 'amber', { type: 'clue', word: 'sail', count: 2 }, ctx);
  assert.deepEqual(s.clue, { by: 0, word: 'SAIL', count: 2, left: 3 });
  assert.deepEqual(clueWords.turn!(s), ['violet']);
  assert.ok('error' in clueWords.act(s, 'amber', { type: 'clue', word: 'SAIL', count: 1 }, 0, ctx));
});

test('guessers use their allowance, and a miss or stop passes the turn', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  const own = s.cards.findIndex((c) => c.kind === 0);
  const enemy = s.cards.findIndex((c) => c.kind === 1);
  const neutral = s.cards.findIndex((c) => c.kind === 'neutral');
  s = board(s, s.cards.map((_, i) => i === own ? 0 : i === enemy ? 1 : 'neutral'));
  s = apply(s, 'amber', { type: 'clue', word: 'SAIL', count: 1 }, ctx);
  assert.ok('error' in clueWords.act(s, 'amber', { type: 'guess', card: enemy }, 0, ctx), 'the clue-giver does not guess');

  s = apply(s, 'violet', { type: 'guess', card: own }, ctx);
  assert.equal(s.found[0], 1);
  assert.equal(s.clue!.left, 1);
  assert.equal(s.turnTeam, 0, 'correct guesses keep the turn');
  assert.ok(s.cards[own].revealed);
  assert.ok('error' in clueWords.act(s, 'violet', { type: 'guess', card: own }, 0, ctx), 'no second guess of a revealed word');
  s = apply(s, 'violet', { type: 'stop' }, ctx);
  assert.equal(s.turnTeam, 1);
  assert.equal(s.clue, null);

  s = apply(s, 'teal', { type: 'clue', word: 'MOON', count: 1 }, ctx);
  s = apply(s, 'rose', { type: 'guess', card: neutral }, ctx);
  assert.equal(s.turnTeam, 0, 'a neutral word ends the turn');
  assert.equal(s.clue, null);

  s = apply(s, 'amber', { type: 'clue', word: 'SUN', count: 2 }, ctx);
  s = apply(s, 'violet', { type: 'guess', card: enemy }, ctx);
  assert.equal(s.turnTeam, 1, 'the other side’s word ends the turn');
  assert.equal(s.found[1], 0, 'and does not score for the guesser');
});

test('a wrong number of guesses ends the turn after the allowance', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  const own = s.cards.map((c, i) => c.kind === 0 ? i : -1).filter((i) => i >= 0);
  s = apply(s, 'amber', { type: 'clue', word: 'SAIL', count: 1 }, ctx);
  s = apply(s, 'violet', { type: 'guess', card: own[0] }, ctx);
  assert.equal(s.turnTeam, 0, 'one more guess remains');
  s = apply(s, 'violet', { type: 'guess', card: own[1] }, ctx);
  assert.equal(s.turnTeam, 1, 'the last allowed guess ends the turn');
  assert.equal(s.clue, null);
});

test('finding every word wins as a team, and the spy loses instantly', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  const own = s.cards.map((c, i) => c.kind === 0 ? i : -1).filter((i) => i >= 0);
  s = apply(s, 'amber', { type: 'clue', word: 'SUNSHINE', count: own.length }, ctx);
  for (const card of own) s = apply(s, 'violet', { type: 'guess', card }, ctx);
  assert.deepEqual(s.result, {
    winner: null, placings: [['amber', 'violet'], ['teal', 'rose']],
    reason: 'finding every word on their side', teamWin: true,
  });
  assert.equal(TEAM_NAMES[0], 'Sun');
  assert.ok('error' in clueWords.act(s, 'teal', { type: 'clue', word: 'MOON', count: 1 }, 0, ctx), 'the game is over');

  let lost = clueWords.create({}, 0, ctx);
  const spy = lost.cards.findIndex((c) => c.kind === 'assassin');
  lost = apply(lost, 'amber', { type: 'clue', word: 'SAIL', count: 1 }, ctx);
  lost = apply(lost, 'violet', { type: 'guess', card: spy }, ctx);
  assert.deepEqual(lost.result, {
    winner: null, placings: [['teal', 'rose'], ['amber', 'violet']],
    reason: 'the other side found the spy', teamWin: true,
  });
});

test('only clue-givers and watchers see the key; revealed words show their side', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  const own = s.cards.findIndex((c) => c.kind === 0);
  assert.ok(viewOf(s, 'violet').cards.every((c) => c.kind === null), 'a guesser sees no colours');
  assert.ok(!JSON.stringify(viewOf(s, 'violet')).includes('assassin'), 'the spy is hidden');
  assert.ok(viewOf(s, 'amber').cards.every((c) => c.kind !== null), 'a clue-giver sees the key');
  assert.ok(viewOf(s, null).cards.every((c) => c.kind !== null), 'a watcher sees the key');
  assert.equal(viewOf(s, null).you, null);
  assert.deepEqual(viewOf(s, 'amber').spymaster, s.spymaster);

  s = apply(s, 'amber', { type: 'clue', word: 'SAIL', count: 1 }, ctx);
  s = apply(s, 'violet', { type: 'guess', card: own }, ctx);
  assert.equal(viewOf(s, 'violet').cards[own].kind, 0, 'a revealed word shows what it was');
  assert.equal(viewOf(s, 'teal').cards[own].kind, 0, 'the other team sees it too');
  assert.equal(viewOf(s, 'violet').phase, 'guessing');
  assert.deepEqual(viewOf(s, 'rose').clue, { by: 0, word: 'SAIL', count: 1, left: 1 });
  assert.equal(viewOf(s, 'teal').target[1], targetOf(1));
});

test('each side gets its own private team chat; watchers get none', () => {
  const s = clueWords.create({}, 0, context());
  assert.deepEqual(clueWords.teamChat!(s, 'amber'), { channel: 'team-0', label: 'Sun team' });
  assert.deepEqual(clueWords.teamChat!(s, 'violet'), { channel: 'team-0', label: 'Sun team' });
  assert.deepEqual(clueWords.teamChat!(s, 'teal'), { channel: 'team-1', label: 'Moon team' });
  assert.deepEqual(clueWords.teamChat!(s, 'rose'), { channel: 'team-1', label: 'Moon team' });
  assert.equal(clueWords.teamChat!(s, null), null);
  assert.equal(clueWords.teamChat!(s, 'stranger'), null);
});

test('a move timer passes the turn, and only the side to move can time out', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  const before = clueWords.timeout!(s, 'teal', 0, ctx);
  assert.equal(before, s, 'the Moon clue-giver is not due');
  s = clueWords.timeout!(s, 'amber', 0, ctx);
  assert.equal(s.turnTeam, 1);
  assert.equal(s.clue, null);
  s = apply(s, 'teal', { type: 'clue', word: 'MOON', count: 1 }, ctx);
  s = clueWords.timeout!(s, 'rose', 0, ctx);
  assert.equal(s.turnTeam, 0);
  assert.equal(s.clue, null);
});

test('replays show the watcher’s view after each clue, guess and timeout', () => {
  const ctx = context();
  let s = clueWords.create({}, 0, ctx);
  const own = s.cards.findIndex((c) => c.kind === 0);
  s = apply(s, 'amber', { type: 'clue', word: 'SAIL', count: 1 }, ctx);
  s = apply(s, 'violet', { type: 'guess', card: own }, ctx);
  s = clueWords.timeout!(s, 'violet', 0, ctx);
  s = apply(s, 'teal', { type: 'clue', word: 'MOON', count: 1 }, ctx);
  s = apply(s, 'rose', { type: 'stop' }, ctx);
  const frames = clueWords.replay!(s);
  assert.equal(frames.length, s.history!.steps.length + 1);
  assert.deepEqual(frames[0], clueWords.view(clueWords.create({}, 0, context()), 0, null), 'the same starting board');
  assert.deepEqual(frames.at(-1), clueWords.view(s, 0, null));
  assert.deepEqual(clueWords.replay!({ ...s, history: undefined }), [], 'older saves have no replay');
});
