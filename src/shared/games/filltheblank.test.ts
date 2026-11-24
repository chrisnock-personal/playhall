import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameContext } from '../game';
import {
  fillTheBlank, MIN_PLAYERS, MAX_PLAYERS, HAND_SIZE, SEATS,
  type FillBlankConfig, type FillBlankState, type FillBlankView,
} from './filltheblank';

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

const config = (over: Record<string, unknown> = {}): FillBlankConfig => ({ ...fillTheBlank.defaultConfig, ...over } as FillBlankConfig);
const context = (c: FillBlankConfig = config()): GameContext => ({ seats: SEATS.slice(0, c.players).map((s) => s.id), random: seeded(11) });

function apply(s: FillBlankState, seat: string, action: unknown, ctx: GameContext): FillBlankState {
  const r = fillTheBlank.act(s, seat, action, 0, ctx);
  if ('error' in r) throw new Error(r.error);
  return r.state;
}

const viewOf = (s: FillBlankState, viewer: string | null) => fillTheBlank.view(s, 0, viewer) as FillBlankView;

/** Everyone plays their first card; the judge picks `winner`'s (the
 *  read-out is shuffled, so look the card up by its author). */
function playRound(s: FillBlankState, ctx: GameContext, winner: string) {
  const judge = s.judge;
  for (const p of s.order.filter((seat) => seat !== judge)) s = apply(s, p, { type: 'play', card: 0 }, ctx);
  assert.equal(s.phase, 'judge');
  return apply(s, judge, { type: 'pick', play: s.plays.findIndex((p) => p.by === winner) }, ctx);
}

test('host settings: seats, own question and answer cards are cleaned', () => {
  assert.equal(MIN_PLAYERS, 3);
  assert.equal(MAX_PLAYERS, 8);
  assert.deepEqual(fillTheBlank.seatsFor!(config({ players: 5 })).map((s) => s.id), ['amber', 'teal', 'violet', 'rose', 'lime']);
  assert.equal(fillTheBlank.parseConfig({ players: 99 }).players, 8);
  assert.equal(fillTheBlank.parseConfig({ players: 1 }).players, 3);
  assert.deepEqual(fillTheBlank.parseConfig({ questions: 'Is it a ___?\nno blank here' }).questions, ['Is it a ___?', 'no blank here ___']);
  assert.deepEqual(fillTheBlank.parseConfig({ answers: 'a hat\n a hat \n!!\na spoon' }).answers, ['a hat', '!!', 'a spoon']);
  assert.deepEqual(fillTheBlank.parseConfig({ answers: ['a hat'] }).answers, ['a hat']);
  assert.equal(fillTheBlank.configError!({ answers: '  ' }), null);
  assert.equal(fillTheBlank.configError!({ answers: 'x' }), 'Use answer cards of at least two characters, one per line');
  assert.equal(fillTheBlank.configError!({ questions: 'a' }), 'Use question cards of at least two characters, one per line');
  assert.equal(fillTheBlank.configError!({ answers: 'a'.repeat(4001) }), 'Keep your own answer cards to 4,000 characters');
  assert.match(fillTheBlank.describeConfig(config({ players: 6, answers: ['a hat'] })), /6 players · family deck \+ own cards/);
});

test('a new game deals hidden hands, one judge and a question with a blank', () => {
  const ctx = context();
  const s = fillTheBlank.create(config(), 0, ctx);
  assert.equal(s.order.length, 4);
  assert.equal(s.rounds, 4);
  assert.equal(s.judge, 'amber');
  assert.equal(s.phase, 'play');
  assert.match(s.question, /___/);
  for (const p of s.order) assert.equal(s.hands[p].length, HAND_SIZE);
  assert.equal(new Set(s.hands.amber).size, HAND_SIZE);
  assert.deepEqual(fillTheBlank.turn!(s), ['teal', 'violet', 'rose']);

  const judge = viewOf(s, 'amber');
  const player = viewOf(s, 'teal');
  const watcher = viewOf(s, null);
  assert.deepEqual(judge.hand, s.hands.amber, 'you see your own hand');
  assert.deepEqual(player.hand, s.hands.teal);
  assert.equal(watcher.hand, null, 'watchers never see a hand');
  assert.equal(viewOf(s, 'stranger').you, null);
  assert.equal(judge.question, s.question);
  assert.deepEqual(judge.plays, [], 'nothing is revealed while cards are being played');
});

test('own cards stay in the config so replays use the same deck', () => {
  const c = config({ players: 3, questions: 'My ___ is missing', answers: 'a silver spoon\na tiny hat' });
  const parsed = fillTheBlank.parseConfig(c);
  assert.deepEqual(parsed.questions, ['My ___ is missing']);
  assert.deepEqual(parsed.answers, ['a silver spoon', 'a tiny hat']);
  const s = fillTheBlank.create(parsed, 0, context(parsed));
  assert.deepEqual(s.config, parsed);
  const frames = fillTheBlank.replay!(s);
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0], viewOf(s, null));
});

test('cards are played privately, read out anonymously and judged', () => {
  const ctx = context();
  let s = fillTheBlank.create(config(), 0, ctx);
  assert.ok('error' in fillTheBlank.act(s, 'amber', { type: 'play', card: 0 }, 0, ctx), 'the judge cannot play');
  assert.ok('error' in fillTheBlank.act(s, 'teal', { type: 'pick', play: 0 }, 0, ctx), 'only the judge picks');
  assert.ok('error' in fillTheBlank.act(s, 'teal', { type: 'play', card: 9 }, 0, ctx));

  s = apply(s, 'teal', { type: 'play', card: 0 }, ctx);
  assert.equal(s.phase, 'play');
  assert.deepEqual(fillTheBlank.turn!(s), ['violet', 'rose']);
  assert.ok('error' in fillTheBlank.act(s, 'teal', { type: 'play', card: 1 }, 0, ctx), 'one card each');
  assert.equal(viewOf(s, 'amber').plays.length, 0, 'read-out waits for every card');
  assert.equal(viewOf(s, 'teal').played, s.plays[0].text, 'you can see the card you played');
  assert.equal(viewOf(s, 'violet').played, null);

  s = apply(s, 'violet', { type: 'play', card: 2 }, ctx);
  s = apply(s, 'rose', { type: 'play', card: 1 }, ctx);
  assert.equal(s.phase, 'judge');
  assert.deepEqual(fillTheBlank.turn!(s), ['amber']);
  const readOut = viewOf(s, 'amber');
  assert.deepEqual(readOut.plays.map((p) => p.label), ['A', 'B', 'C']);
  assert.deepEqual(readOut.plays.map((p) => p.text), s.plays.map((p) => p.text));
  assert.equal(viewOf(s, null).plays.length, 3, 'watchers get the anonymous read-out too');
  assert.ok(s.log.every((line) => !line.includes(s.plays[0].text)), 'no card text in the log before judging');

  assert.ok('error' in fillTheBlank.act(s, 'teal', { type: 'pick', play: 0 }, 0, ctx));
  s = apply(s, 'amber', { type: 'pick', play: s.plays.findIndex((p) => p.by === 'violet') }, ctx);
  assert.equal(s.points.violet, 1, 'the chosen card wins a point');
  assert.equal(s.points.teal, 0);
  assert.equal(s.round, 2);
  assert.equal(s.judge, 'teal');
  assert.equal(s.phase, 'play');
  assert.match(s.log.at(-1)!, /violet’s “.*” wins round 1/, 'the author is named only after the pick');
  assert.equal(s.hands.violet.length, HAND_SIZE, 'played cards are replaced');
  assert.equal(s.plays.length, 0);
});

test('the move timer plays for everyone who is due and picks for the judge', () => {
  const ctx = context();
  let s = fillTheBlank.create(config(), 0, ctx);
  s = apply(s, 'teal', { type: 'play', card: 1 }, ctx);
  s = fillTheBlank.timeout!(s, 'rose', 0, ctx);
  assert.equal(s.phase, 'judge', 'all outstanding cards are filled in');
  assert.equal(s.plays.length, 3);
  assert.equal(s.hands.violet.length, HAND_SIZE);
  assert.equal(fillTheBlank.timeout!(s, 'teal', 0, ctx), s, 'only the side to move times out');

  s = fillTheBlank.timeout!(s, 'amber', 0, ctx);
  assert.equal(s.round, 2);
  assert.equal(s.points.teal + s.points.violet + s.points.rose, 1, 'the judge picked a winner');
});

test('most points wins after one round per player, with ties sharing a place', () => {
  const ctx = context(config({ players: 3 }));
  const c = config({ players: 3 });
  let s = fillTheBlank.create(c, 0, ctx);
  for (const winner of ['teal', 'amber', 'amber']) s = playRound(s, ctx, winner);
  assert.equal(s.result?.winner, 'amber');
  assert.deepEqual(s.result?.placings, [['amber'], ['teal'], ['violet']]);
  assert.match(s.result!.reason, /most funny answers/);
  assert.ok('error' in fillTheBlank.act(s, 'amber', { type: 'play', card: 0 }, 0, ctx));
  assert.deepEqual(viewOf(s, null).points, { amber: 2, teal: 1, violet: 0 });

  const tied = fillTheBlank.create(c, 0, context(c));
  const withTie = playRound({ ...tied, round: 3, judge: 'violet', points: { amber: 0, teal: 1, violet: 0 } }, context(c), 'amber');
  assert.deepEqual(withTie.result?.placings, [['amber', 'teal'], ['violet']]);
  assert.equal(withTie.result?.winner, null);
});

test('replays show the watcher’s anonymous view after each card and pick', () => {
  const ctx = context();
  let s = fillTheBlank.create(config(), 0, ctx);
  s = apply(s, 'teal', { type: 'play', card: 0 }, ctx);
  s = apply(s, 'violet', { type: 'play', card: 1 }, ctx);
  s = apply(s, 'rose', { type: 'play', card: 2 }, ctx);
  s = apply(s, 'amber', { type: 'pick', play: 0 }, ctx);
  const frames = fillTheBlank.replay!(s) as FillBlankView[];
  assert.equal(frames.length, s.history!.steps.length + 1);
  assert.deepEqual(frames[0], viewOf(fillTheBlank.create(config(), 0, context()), null));
  assert.deepEqual(frames.at(-1), viewOf(s, null));
  assert.ok(frames.every((f) => f.hand === null), 'no hidden hands in a replay');
  assert.ok(frames.every((f) => f.plays.every((p) => typeof p.text === 'string')), 'read-outs are replayable');
  assert.deepEqual(fillTheBlank.replay!({ ...s, history: undefined }), []);
});

test('the read-out is shuffled, so its letters don’t follow the order cards went in', () => {
  // The log names players in the order they played; over a few games the
  // read-out must not always come back in that order.
  let differs = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const ctx: GameContext = { seats: ['amber', 'teal', 'violet', 'rose'], random: seeded(seed) };
    let s = fillTheBlank.create(config(), 0, ctx);
    const playedOrder = ['rose', 'teal', 'violet'];
    for (const p of playedOrder) s = apply(s, p, { type: 'play', card: 0 }, ctx);
    assert.deepEqual([...s.plays.map((p) => p.by)].sort(), [...playedOrder].sort(), 'every card is read out once');
    if (s.plays.map((p) => p.by).join() !== playedOrder.join()) differs++;
  }
  assert.ok(differs >= 6, `read-out order matched the play order too often (${12 - differs} of 12)`);
});
