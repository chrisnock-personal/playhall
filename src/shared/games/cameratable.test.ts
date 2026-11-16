import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraTable, nameKey, tidyName, DICE, MAX_DICE, type CameraTableState } from './cameratable';
import { seatsIn, type GameContext } from '../game';
import { score } from '../scoring';

const NAMES = { amber: 'Kai', teal: 'Sam', violet: 'Alex' };
const ctx = (seats = ['amber', 'teal', 'violet'], host: { name: string; seat: string | null } = { name: 'Kai', seat: 'amber' }, random: () => number = Math.random): GameContext =>
  ({ seats, random, names: NAMES, host });
const config = (over = {}) => cameraTable.parseConfig({ name: 'Catan', seats: 4, playersScore: true, ...over });
const fresh = (seats = ['amber', 'teal', 'violet'], over = {}) => cameraTable.create(config(over), 0, ctx(seats));
type R = ReturnType<typeof cameraTable.act>;
const ok = (r: R): CameraTableState => { if ('error' in r) throw new Error(r.error); return r.state; };
const said = (r: R): string[] => ('error' in r ? [] : r.say ?? []);
const err = (r: R) => ('error' in r ? r.error : null);
const act = (s: CameraTableState, seat: string, a: unknown, c = ctx()) => cameraTable.act(s, seat, a, 0, c);
const host = (s: CameraTableState, a: unknown, c = ctx()) => cameraTable.hostAct!(s, a, 0, c);

test('config: the typed name is tidied and required; 2 to 8 seats', () => {
  assert.equal(tidyName('  Ticket\nto   Ride ​'), 'Ticket to Ride');
  assert.equal(tidyName('x'.repeat(80)).length, 60);
  assert.equal(cameraTable.configError!({ name: '   ' }), 'Type the name of the game you’re playing');
  assert.equal(cameraTable.configError!({}), 'Type the name of the game you’re playing');
  assert.match(String(cameraTable.configError!({ name: 'x'.repeat(61) })), /60 characters/);
  assert.equal(cameraTable.configError!({ name: 'Catan' }), null);
  assert.equal(cameraTable.parseConfig({ name: 'Catan', seats: 12 }).seats, 8);
  assert.equal(cameraTable.parseConfig({ name: 'Catan', seats: 1 }).seats, 2);
  assert.equal(cameraTable.parseConfig({ name: 'Catan', seats: 2.5 }).seats, 4);
  assert.equal(cameraTable.parseConfig(null).name, 'Board game', 'never empty once parsed');
  assert.deepEqual(seatsIn(cameraTable, { name: 'Catan', seats: 3 }).map((s) => s.id), ['amber', 'teal', 'violet']);
  assert.equal(seatsIn(cameraTable, { name: 'Catan', seats: 8 }).length, 8);
  assert.equal(cameraTable.describeConfig(config()), 'Catan · 4 seats');
});

test('names group case-insensitively for the leaderboard', () => {
  assert.equal(nameKey('  CATAN '), nameKey('catan'));
  assert.equal(nameKey('Ticket  to Ride'), 'ticket to ride');
  assert.notEqual(nameKey('Catan'), nameKey('Carcassonne'));
  assert.equal(cameraTable.boardName!(fresh()), 'Catan');
});

test('turns: Next turn by the player whose turn it is, or the host; round count', () => {
  let s = fresh();
  assert.deepEqual(cameraTable.turn!(s), ['amber']);
  assert.equal(err(act(s, 'teal', { type: 'next' })), 'It’s not your turn');
  s = ok(act(s, 'amber', { type: 'next' }));
  assert.deepEqual(cameraTable.turn!(s), ['teal']);
  s = ok(host(s, { type: 'next' }));
  assert.deepEqual(cameraTable.turn!(s), ['violet']);
  s = ok(act(s, 'violet', { type: 'next' }));
  assert.deepEqual(cameraTable.turn!(s), ['amber']);
  assert.equal(s.round, 2);
  assert.equal(err(act(s, 'amber', { type: 'next', seat: 'violet' })), 'Only the host can choose whose turn it is');
  s = ok(host(s, { type: 'next', seat: 'violet' }));
  assert.deepEqual(cameraTable.turn!(s), ['violet']);
  assert.equal(err(host(s, { type: 'next', seat: 'slate' })), 'That player isn’t in this game');
});

test('the move timer passes the turn on', () => {
  const s = fresh();
  const t = cameraTable.timeout!(s, 'amber', 0, ctx());
  assert.deepEqual(cameraTable.turn!(t), ['teal']);
  assert.equal(cameraTable.timeout!(t, 'amber', 0, ctx()), t, 'a stale timeout changes nothing');
});

test('dice: rolled from the room’s numbers, within bounds, said to everyone', () => {
  const s = fresh();
  const seq = [0, 0.999999, 0.5];
  let i = 0;
  const r = act(s, 'teal', { type: 'roll', dice: [6, 6, 20] }, ctx(undefined, undefined, () => seq[i++]));
  const st = ok(r);
  assert.deepEqual(st.rolls[0].dice, [{ sides: 6, value: 1 }, { sides: 6, value: 6 }, { sides: 20, value: 11 }]);
  assert.equal(st.rolls[0].total, 18);
  assert.equal(st.rolls[0].name, 'Sam');
  assert.deepEqual(said(r), ['Sam rolled 1 + 6 + 11 = 18 (2d6 + d20)']);
  const one = act(s, 'amber', { type: 'roll', dice: [4] }, ctx(undefined, undefined, () => 0.3));
  assert.deepEqual(said(one), ['Kai rolled 2 (d4)']);
  assert.equal(err(act(s, 'teal', { type: 'roll', dice: [7] })), 'Those dice aren’t in the box');
  assert.equal(err(act(s, 'teal', { type: 'roll', dice: [] })), 'Choose some dice');
  assert.equal(err(act(s, 'teal', { type: 'roll', dice: Array(MAX_DICE + 1).fill(6) })), `At most ${MAX_DICE} dice at once`);
  assert.equal(err(act(s, 'teal', { type: 'roll', dice: '6' })), 'Choose some dice');
  // A host who isn't seated can roll too, under their own name.
  const h = host(s, { type: 'roll', dice: [6] }, ctx(undefined, { name: 'Priya', seat: null }));
  assert.equal(ok(h).rolls[0].by, null);
  assert.match(said(h)[0], /^Priya rolled/);
});

test('dice are fair: every face of every die comes up about as often', () => {
  for (const sides of DICE) {
    const counts = Array(sides).fill(0);
    let s = fresh();
    const n = sides * 600;
    for (let k = 0; k < n; k++) {
      s = ok(act(s, 'amber', { type: 'roll', dice: [sides] }));
      const v = s.rolls.at(-1)!.dice[0].value;
      assert.ok(Number.isInteger(v) && v >= 1 && v <= sides, `d${sides} rolled ${v}`);
      counts[v - 1]++;
    }
    // Each face expects 600; allow a wide margin (about 6 standard deviations).
    for (const c of counts) assert.ok(c > 450 && c < 750, `d${sides} faces: ${counts.join(' ')}`);
    assert.ok(s.rolls.length <= 20, 'only recent rolls are kept');
  }
});

test('score pad: the host edits anyone’s; players their own, unless the host keeps the scores', () => {
  let s = fresh();
  s = ok(act(s, 'teal', { type: 'score', seat: 'teal', delta: 5 }));
  s = ok(act(s, 'teal', { type: 'score', seat: 'teal', delta: -2 }));
  assert.equal(s.scores.teal, 3);
  assert.equal(err(act(s, 'teal', { type: 'score', seat: 'violet', value: 10 })), 'You can only change your own score');
  s = ok(host(s, { type: 'score', seat: 'violet', value: 42 }));
  assert.equal(s.scores.violet, 42);
  assert.match(String(err(act(s, 'teal', { type: 'score', seat: 'teal', value: 1.5 }))), /whole numbers/);
  assert.match(String(err(host(s, { type: 'score', seat: 'teal', value: 1e9 }))), /whole numbers/);
  assert.equal(err(host(s, { type: 'score', seat: 'slate', value: 1 })), 'That player isn’t in this game');
  const strict = fresh(undefined, { playersScore: false });
  assert.equal(err(act(strict, 'teal', { type: 'score', seat: 'teal', delta: 1 })), 'The host keeps the scores in this room');
  assert.equal(ok(host(strict, { type: 'score', seat: 'teal', delta: 1 })).scores.teal, 1);
});

test('results: the host enters places, every player confirms, then it ends', () => {
  let s = fresh();
  assert.equal(err(act(s, 'amber', { type: 'propose', placings: [['amber'], ['teal'], ['violet']] })), 'Only the host enters the result');
  assert.equal(err(host(s, { type: 'propose', placings: [['amber'], ['teal']] })), 'Give every player a place');
  assert.equal(err(host(s, { type: 'propose', placings: [['amber'], ['amber', 'teal', 'violet']] })), 'Each player has one place');
  assert.equal(err(host(s, { type: 'propose', placings: [['amber'], [], ['teal', 'violet']] })), 'Each place needs at least one player');
  assert.equal(err(host(s, { type: 'propose', placings: [['amber', 'slate'], ['teal', 'violet']] })), 'That player isn’t in this game');
  const r = host(s, { type: 'propose', placings: [['teal'], ['amber', 'violet']] });
  s = ok(r);
  assert.match(said(r)[0], /1st Sam, 2nd Kai and Alex/);
  assert.deepEqual(s.proposal!.confirmed, ['amber'], 'the seated host proposing it counts as their confirmation');
  assert.deepEqual(cameraTable.turn!(s), [], 'no turns (or move timer) while the result is agreed');
  assert.equal(err(act(s, 'teal', { type: 'next' })), 'The result is being agreed');
  assert.equal(err(act(s, 'teal', { type: 'confirm', version: 0 })), 'The host has changed the result: have another look');
  const v = s.proposal!.version;
  s = ok(act(s, 'teal', { type: 'confirm', version: v }));
  assert.equal(cameraTable.result(s), null, 'not everyone yet');
  assert.equal(ok(act(s, 'teal', { type: 'confirm', version: v })), s, 'confirming twice changes nothing');
  const last = act(s, 'violet', { type: 'confirm', version: v });
  s = ok(last);
  assert.deepEqual(said(last), ['Alex confirmed the result', 'Everyone confirmed the result']);
  const result = cameraTable.result(s)!;
  assert.deepEqual(result, { winner: 'teal', placings: [['teal'], ['amber', 'violet']], reason: 'the agreed result' });
  const pts = score(result, ['amber', 'teal', 'violet']);
  assert.equal(pts.teal.points, 3);
  assert.equal(pts.amber.points, 1, 'shared second in a game of three: 1 each');
  assert.equal(err(act(s, 'teal', { type: 'roll', dice: [6] })), 'The game is over');
});

test('a host who isn’t playing: every seated player confirms, ties at the top are a draw', () => {
  const watchingHost = ctx(['amber', 'teal'], { name: 'Priya', seat: null });
  let s = cameraTable.create(config(), 0, watchingHost);
  s = ok(host(s, { type: 'propose', placings: [['amber', 'teal']] }, watchingHost));
  assert.deepEqual(s.proposal!.confirmed, []);
  assert.equal(err(host(s, { type: 'confirm', version: 1 }, watchingHost)), 'Only the players confirm the result');
  s = ok(act(s, 'amber', { type: 'confirm', version: 1 }, watchingHost));
  s = ok(act(s, 'teal', { type: 'confirm', version: 1 }, watchingHost));
  assert.deepEqual(cameraTable.result(s), { winner: null, placings: [['amber', 'teal']], reason: 'the agreed result' });
});

test('a dispute sends it back: the host revises and asks again, or ends it without counting', () => {
  let s = fresh();
  s = ok(host(s, { type: 'propose', placings: [['amber'], ['teal'], ['violet']] }));
  s = ok(act(s, 'teal', { type: 'confirm', version: 1 }));
  const d = act(s, 'violet', { type: 'dispute', version: 1 });
  s = ok(d);
  assert.match(said(d)[0], /Alex disputed the result/);
  assert.equal(s.proposal, null);
  assert.deepEqual(s.disputed!.disputed, ['violet']);
  assert.deepEqual(cameraTable.turn!(s), ['amber'], 'play goes on meanwhile');
  assert.equal(err(act(s, 'teal', { type: 'confirm', version: 1 })), 'There’s no result to confirm');
  // Revised: everyone confirms afresh (the earlier confirmations don't carry over).
  s = ok(host(s, { type: 'propose', placings: [['violet'], ['amber'], ['teal']] }));
  assert.equal(s.proposal!.version, 2);
  assert.deepEqual(s.proposal!.confirmed, ['amber']);
  assert.equal(s.disputed, null);
  s = ok(act(s, 'violet', { type: 'dispute', version: 2 }));
  // The host gives up on agreeing: it doesn't count.
  assert.equal(err(act(s, 'teal', { type: 'abandon' })), 'Only the host can do that');
  s = ok(host(s, { type: 'abandon' }));
  assert.deepEqual(cameraTable.result(s), { winner: null, reason: 'the result being disputed', aborted: true });
});

test('the host can take a result back before everyone has confirmed', () => {
  let s = fresh();
  s = ok(host(s, { type: 'propose', placings: [['amber'], ['teal'], ['violet']] }));
  s = ok(host(s, { type: 'withdraw' }));
  assert.equal(s.proposal, null);
  assert.deepEqual(cameraTable.turn!(s), ['amber']);
  assert.equal(err(host(s, { type: 'withdraw' })), 'There’s no result to take back');
  const ended = ok(host(s, { type: 'abandon' }));
  assert.equal(cameraTable.result(ended)!.reason, 'the host ending it without a result');
});

test('watchers can’t act; unknown actions are refused', () => {
  const s = fresh(['amber', 'teal']);
  assert.equal(err(act(s, 'violet', { type: 'roll', dice: [6] }, ctx(['amber', 'teal']))), 'Only players can roll');
  assert.equal(err(act(s, 'amber', { type: 'resign' })), 'Unknown action');
  assert.equal(err(act(s, 'amber', null)), 'Unknown action');
});
