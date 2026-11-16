import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RoomSnapshot } from '../../shared/protocol';
import * as C from './cues';
import { snakesWalk, tableCues, timerCue, type Cue } from './cues';
import { parsePrefs, DEFAULT_PREFS } from './sound';

const sounds = (cues: Cue[]) => cues.map((c) => c.sound);
const as = <T>(x: unknown) => x as T;
// The tests build views loosely (only the fields a detector reads).
type Loose = (prev: any, next: any) => Cue[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const [snakesCues, ludoCues, fourCues, checkersCues, chessCues, seaCues, blackjackCues, pokerCues, clashCues] = [
  C.snakesCues, C.ludoCues, C.fourCues, C.checkersCues, C.chessCues, C.seaCues, C.blackjackCues, C.pokerCues, C.clashCues,
] as Loose[];

test('snakes: a roll up a ladder rattles, steps, then climbs; nothing on arrival', () => {
  const before = ({ order: ['amber', 'teal'], pos: { amber: 1, teal: 0 }, turn: 'amber', last: null, rolls: [], result: null });
  const roll = { seat: 'amber', value: 3, from: 1, to: 25, via: 'ladder', bounced: false };
  const after = { ...before, pos: { amber: 25, teal: 0 }, last: roll, rolls: [roll] };
  assert.deepEqual(sounds(snakesCues(before, after)), ['dice', 'move', 'climb']);
  assert.deepEqual(snakesCues(null, after), []);
  assert.deepEqual(snakesCues(after, { ...after }), [], 'the same roll again is not a new roll');
  const down = { ...roll, from: 22, value: 5, to: 5, via: 'snake' };
  assert.deepEqual(sounds(snakesCues(after, { ...after, last: down })), ['dice', 'move', 'slide']);
  const cues = snakesCues(after, { ...after, last: down });
  assert.ok(cues.every((c) => c.at <= 650), 'all inside the animation');
});

test('snakes: the walk bounces back off 100', () => {
  assert.deepEqual(snakesWalk(97, 5), [97, 98, 99, 100, 99, 98]);
  assert.deepEqual(snakesWalk(0, 2), [0, 1, 2]);
});

test('ludo: the roll, a step per square, a capture', () => {
  const base = ({ order: ['amber', 'teal'], tokens: { amber: [3, -1, -1, -1], teal: [10, -1, -1, -1] }, turn: 'amber', roll: null, movable: [], last: null, log: [], result: null });
  const rolled = { ...base, roll: 4, movable: [0] };
  assert.deepEqual(sounds(ludoCues(base, rolled)), ['dice']);
  const entry = { seat: 'amber', roll: 4, token: 0, captured: ['teal'] };
  const moved = { ...rolled, roll: null, tokens: { amber: [7, -1, -1, -1], teal: [-1, -1, -1, -1] }, last: entry, log: [entry] };
  assert.deepEqual(sounds(ludoCues(rolled, moved)), ['move', 'move', 'move', 'move', 'capture']);
  const none = { seat: 'teal', roll: 2, token: null, captured: [], note: 'no move' };
  assert.deepEqual(sounds(ludoCues(moved, { ...moved, last: none, log: [entry, none] })), ['dice']);
});

test('four in a row: a disc lands when the drop animation ends', () => {
  const a = ({ grid: [], cols: 7, rows: 6, turn: 'amber', moves: [3], lastCell: 3, winLine: null, result: null });
  const cues = fourCues(a, { ...a, moves: [3, 4] });
  assert.deepEqual(sounds(cues), ['drop']);
  assert.ok(cues[0].at > 200 && cues[0].at < 400);
  assert.deepEqual(fourCues(a, a), []);
});

test('checkers: a slide, and a capture for each hop of a double jump', () => {
  const a = ({ board: [], turn: 'black', lastMove: null, legal: [], moveCount: 4, drawOfferBy: null, result: null, counts: { black: 12, white: 12 } });
  assert.deepEqual(sounds(checkersCues(a, { ...a, moveCount: 5, lastMove: [20, 29] })), ['move']);
  assert.deepEqual(sounds(checkersCues(a, { ...a, moveCount: 5, lastMove: [20, 38, 52] })), ['capture', 'capture']);
  assert.deepEqual(sounds(checkersCues(a, { ...a, moveCount: 5, lastMove: [20, 38] })), ['capture']);
});

test('chess: captures sound different from moves', () => {
  const a = ({ san: ['e4'] });
  assert.deepEqual(sounds(chessCues(a, as({ san: ['e4', 'd5'] }))), ['move']);
  assert.deepEqual(sounds(chessCues(as({ san: ['e4', 'd5'] }), as({ san: ['e4', 'd5', 'exd5'] }))), ['capture']);
});

test('sea battle: launch, then a splash, a bang, or a bigger bang for a sinking', () => {
  const a = ({ phase: 'firing', shots: { amber: [], teal: [] } });
  assert.deepEqual(sounds(seaCues(a, as({ ...a, shots: { amber: [{ cell: 4, hit: false }], teal: [] } }))), ['launch', 'splash']);
  assert.deepEqual(sounds(seaCues(a, as({ ...a, shots: { amber: [{ cell: 4, hit: true }], teal: [] } }))), ['launch', 'hit']);
  const sunk = seaCues(a, as({ ...a, shots: { amber: [], teal: [{ cell: 4, hit: true, sunk: 'Destroyer' }] } }));
  assert.deepEqual(sounds(sunk), ['launch', 'sink']);
  assert.ok(sunk[1].at > sunk[0].at, 'the bang comes when the missile lands');
});

test('blackjack: bets clink, cards deal one after another, the payout rattles', () => {
  const v = ({
    hand: 1, hands: 10, phase: 'betting', order: ['amber', 'teal'], chips: { amber: 1000, teal: 1000 },
    bets: { amber: null, teal: null }, cards: { amber: [], teal: [] }, done: {}, dealer: [], turn: null, last: null, shoeLeft: 300, result: null,
  });
  assert.deepEqual(sounds(blackjackCues(null, v)), ['shuffle']);
  const bet = { ...v, bets: { amber: 50, teal: null } };
  assert.deepEqual(sounds(blackjackCues(v, bet)), ['chip']);
  const dealt = { ...bet, phase: 'playing' as const, bets: { amber: 50, teal: 20 }, cards: { amber: ['AS', 'KD'], teal: ['2C', '3C'] }, dealer: ['9H', null], shoeLeft: 294 };
  const cues = blackjackCues(bet, dealt);
  assert.equal(cues.filter((c) => c.sound === 'card').length, 6);
  const settled = { ...v, hand: 2, last: { dealer: ['9H', '8D'], deltas: { amber: 75, teal: -20 } } };
  assert.deepEqual(sounds(blackjackCues(dealt, settled)), ['chips']);
});

test('poker: bets, the flop, and a new hand', () => {
  const v = ({
    order: ['amber', 'teal'], chips: { amber: 980, teal: 990 }, hand: 1, bet: { amber: 20, teal: 10 }, pot: 30, board: [],
    inHand: { amber: true, teal: true },
  });
  assert.deepEqual(sounds(pokerCues(v, { ...v, bet: { amber: 20, teal: 20 }, pot: 40 })), ['chip']);
  assert.deepEqual(sounds(pokerCues(v, { ...v, bet: { amber: 0, teal: 0 }, pot: 40, board: ['AS', 'KS', 'QS'] })), ['chips', 'flip', 'flip', 'flip']);
  const next = sounds(pokerCues(v, { ...v, hand: 2 }));
  assert.deepEqual(next.slice(0, 2), ['chips', 'shuffle']);
  assert.ok(next.includes('card'));
});

test('colour clash: playing a card, drawing two, the deal at the start', () => {
  const v = ({ counts: { amber: 7, teal: 7 }, top: { id: 1 }, drawLeft: 80 });
  assert.deepEqual(sounds(clashCues(v, { ...v, top: { id: 2 } as never, counts: { amber: 6, teal: 7 } })), ['card']);
  assert.deepEqual(sounds(clashCues(v, { ...v, drawLeft: 78, counts: { amber: 7, teal: 9 } })), ['draw', 'draw']);
  assert.deepEqual(sounds(clashCues(null, v)).slice(0, 2), ['shuffle', 'card']);
});

function snap(over: Partial<{ status: string; turn: string[]; seat: string | null; winner: string | null; view: unknown; gameId: string }>): RoomSnapshot {
  const o = { status: 'playing', turn: [], seat: 'amber', winner: null, view: { moves: [], grid: [] }, gameId: 'fourinarow', ...over };
  return as<RoomSnapshot>({
    room: { code: 'ABCD', gameId: o.gameId },
    game: { status: o.status, view: o.view, result: o.status === 'over' ? { winner: o.winner, reason: 'four in a row' } : null, turnSeats: o.turn, moveDeadline: null, leaving: {} },
    you: { userId: 'u1', seat: o.seat },
    lastResult: null,
  });
}

test('the room: your turn, a win, a gentler end for everyone else', () => {
  assert.deepEqual(sounds(tableCues(snap({ turn: ['teal'] }), snap({ turn: ['amber'] }))), ['turn']);
  assert.deepEqual(sounds(tableCues(snap({ turn: ['amber'] }), snap({ turn: ['amber'] }))), [], 'not again while it stays your turn');
  assert.deepEqual(sounds(tableCues(snap({ turn: ['amber'] }), snap({ turn: ['amber'], seat: null }))), [], 'watchers have no turn');
  assert.deepEqual(sounds(tableCues(snap({}), snap({ status: 'over', winner: 'amber' }))), ['win']);
  assert.deepEqual(sounds(tableCues(snap({}), snap({ status: 'over', winner: 'teal' }))), ['end']);
  assert.deepEqual(sounds(tableCues(snap({ seat: null }), snap({ status: 'over', winner: 'amber', seat: null }))), ['end']);
  // The last move's sound comes first, then the result.
  const last = tableCues(snap({ view: { moves: [1], grid: [] } }), snap({ status: 'over', winner: 'amber', view: { moves: [1, 2], grid: [] } }));
  assert.deepEqual(sounds(last), ['drop', 'win']);
  assert.ok(last[1].at > last[0].at);
});

test('the room: a new game starts the cards from a shuffle', () => {
  const v = { order: ['amber', 'teal'], inHand: { amber: true, teal: true }, hand: 1, bet: {}, pot: 0, board: [] };
  const cues = tableCues(snap({ status: 'over', gameId: 'poker', view: v }), snap({ gameId: 'poker', view: v }));
  assert.equal(cues[0].sound, 'shuffle');
});

test('the move timer: a warning at 10 s, ticks for the last 5', () => {
  assert.equal(timerCue(10_100, 9_900), 'warn');
  assert.equal(timerCue(9_900, 9_700), null);
  assert.equal(timerCue(5_100, 4_900), 'tick');
  assert.equal(timerCue(1_050, 950), 'tick');
  assert.equal(timerCue(500, 300), null);
  assert.equal(timerCue(3_000, 8_000), null, 'a fresh timer is not a tick');
});

test('sound settings: defaults (off while watching) and bad values', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.equal(DEFAULT_PREFS.watching, false);
  assert.deepEqual(parsePrefs('not json'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('{"muted":true,"volume":3,"watching":"yes"}'), { muted: true, volume: 1, watching: false });
});

test('camera table and Ship2Shore: a roll; orders passed to you, the ship sailing on', () => {
  assert.deepEqual(sounds(C.cameraCues(as({ rollCount: 2 }), as({ rollCount: 3 }))), ['dice']);
  assert.deepEqual(C.cameraCues(as({ rollCount: 3 }), as({ rollCount: 3 })), []);
  const ship = { ship: { a: 0, b: 0 }, phase: 'pick', you: { hand: null, helmCards: null } };
  assert.deepEqual(sounds(C.shipCues(as(ship), as({ ...ship, phase: 'draw', you: { hand: ['ne.x', 's.y'], helmCards: null } }))), ['draw', 'draw']);
  assert.deepEqual(sounds(C.shipCues(as(ship), as({ ...ship, ship: { a: 1, b: 0 } }))), ['move', 'splash']);
});
