import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, RoomError, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS, type RoomSettings } from '../../shared/protocol';

const host: RoomUser = { id: 'h', name: 'Sam', guest: false };
const alex: RoomUser = { id: 'a', name: 'Alex', guest: false };
const priya: RoomUser = { id: 'p', name: 'Priya', guest: false };
const guest: RoomUser = { id: 'g', name: 'Kai', guest: true };

function setup(settings: Partial<RoomSettings> = {}) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const over: unknown[] = [];
  const finished: { counted: boolean; note: string | null }[] = [];
  const hooks: RoomHooks = {
    now: () => now,
    random: Math.random,
    setTimer: (ms, fn) => { const t = { at: now + ms, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
    save: () => {},
    chat: () => {},
    gameOver: (g) => { over.push(g.result); finished.push(g); },
    changed: () => {},
  };
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Test', gameId: 'chess', hostId: host.id, hostName: host.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig: { initialSeconds: 60, incrementSeconds: 0 }, ...settings },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null,
  };
  const room = new Room(rec, hooks);
  for (const u of [host, alex, priya, guest]) room.join(u);
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.fn(); }
  };
  return { room, rec, over, finished, advance };
}

const move = (from: string, to: string) => ({ t: 'act' as const, action: { type: 'move', from, to } });

test('roles: host can sit and play; others watch until seated', () => {
  const { room } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  const snap = room.snapshotFor(host.id);
  assert.equal(snap.you.host, true);
  assert.equal(snap.you.seat, 'white');
  assert.equal(room.snapshotFor(priya.id).you.seat, null);
  assert.throws(() => room.handle(priya, { t: 'sit', seat: 'black' }), RoomError);
});

test('only the host can start, and only with every seat filled', () => {
  const { room } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  assert.throws(() => room.handle(host, { t: 'start' }), /Fill every seat/);
  room.handle(alex, { t: 'sit', seat: 'black' });
  assert.throws(() => room.handle(alex, { t: 'start' }), /Only the host/);
  room.handle(host, { t: 'start' });
  assert.equal(room.snapshotFor(host.id).game.status, 'playing');
  assert.throws(() => room.handle(alex, { t: 'stand' }), RoomError);
  assert.throws(() => room.handle(priya, move('e2', 'e4')), /Only players/);
  room.handle(host, move('e2', 'e4'));
});

test('host seat policy: watchers ask, the host seats them', () => {
  const { room } = setup({ seatPolicy: 'host' });
  assert.throws(() => room.handle(alex, { t: 'sit', seat: 'black' }), /ask for a seat/);
  room.handle(alex, { t: 'hand', up: true });
  assert.deepEqual(room.snapshotFor(host.id).queue, ['a']);
  assert.throws(() => room.handle(alex, { t: 'seat', userId: 'a', seat: 'black' }), /Only the host/);
  room.handle(host, { t: 'seat', userId: 'a', seat: 'black' });
  assert.equal(room.seatOf('a'), 'black');
  assert.deepEqual(room.snapshotFor(host.id).queue, []);
});

test('guests can be kept out of seats', () => {
  const { room } = setup({ guestsCanPlay: false });
  assert.throws(() => room.handle(guest, { t: 'sit', seat: 'white' }), /Guests/);
  assert.throws(() => room.handle(host, { t: 'makeHost', userId: 'g' }), /Guests can/);
});

test('gallery is hidden from players during play, and watchers can’t write at the table', () => {
  const { room } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(priya, { t: 'chat', channel: 'gallery', text: 'before' });
  room.handle(host, { t: 'start' });
  room.handle(priya, { t: 'chat', channel: 'gallery', text: 'play d4' });
  assert.throws(() => room.handle(priya, { t: 'chat', channel: 'table', text: 'hi' }), /Watchers/);
  assert.throws(() => room.handle(alex, { t: 'chat', channel: 'gallery', text: 'hi' }), /Players/);
  const alexSees = room.snapshotFor(alex.id);
  assert.deepEqual(alexSees.you.canRead, ['table']);
  assert.ok(!alexSees.chat.some((l) => l.channel === 'gallery'));
  assert.ok(room.snapshotFor(priya.id).chat.some((l) => l.text === 'play d4'));
  room.handle(alex, { t: 'act', action: { type: 'resign' } });
  assert.ok(room.snapshotFor(alex.id).chat.some((l) => l.text === 'play d4'), 'gallery visible after the game');
});

test('a clock running out ends the game through the timer', () => {
  const { room, over, advance } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  room.handle(host, move('e2', 'e4'));
  room.handle(alex, move('e7', 'e5'));
  advance(59_000);
  assert.equal(over.length, 0);
  advance(2_000);
  assert.deepEqual(over, [{ winner: 'black', reason: 'time' }]);
  assert.equal(room.snapshotFor(host.id).game.status, 'over');
});

test('winner stays: the next person asking takes the loser’s seat', () => {
  const { room } = setup({ afterGame: 'winnerStays' });
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(priya, { t: 'hand', up: true });
  room.handle(host, { t: 'start' });
  room.handle(alex, { t: 'act', action: { type: 'resign' } });
  assert.equal(room.seatOf('h'), 'white');
  assert.equal(room.seatOf('p'), 'black');
  assert.equal(room.seatOf('a'), null);
});

test('the host unseating a player stops the game', () => {
  const { room, over } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  room.handle(host, { t: 'unseat', userId: 'a' });
  assert.equal(over.length, 1);
  assert.equal(room.seatOf('a'), null);
  assert.equal(room.snapshotFor(host.id).game.status, 'over');
});

test('settings: game config can’t change mid-game', () => {
  const { room } = setup();
  room.handle(host, { t: 'settings', settings: { gameConfig: { initialSeconds: 180, incrementSeconds: 2 } } });
  assert.equal(room.snapshotFor(host.id).room.configLabel, '3 min + 2 s');
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  assert.throws(() => room.handle(host, { t: 'settings', settings: { gameConfig: { initialSeconds: 60 } } }), /between games/);
});

test('what counts: account holders in a ranked room; not guests, casual rooms or stopped games', () => {
  let t = setup();
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  t.room.handle(alex, { t: 'act', action: { type: 'resign' } });
  assert.deepEqual(t.finished.map((f) => f.counted), [true]);

  t = setup();
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(guest, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  t.room.handle(guest, { t: 'act', action: { type: 'resign' } });
  assert.equal(t.finished[0].counted, false);
  assert.match(t.finished[0].note!, /guest/);

  t = setup({ ranked: false });
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  assert.throws(() => t.room.handle(host, { t: 'settings', settings: { ranked: true } }), /between games/);
  t.room.handle(host, { t: 'unseat', userId: 'a' });
  assert.equal(t.finished[0].counted, false);
  assert.match(t.finished[0].note!, /stopped/);
});

test('the move timer: a player who runs out of time loses a two-player game', () => {
  const t = setup({ moveSeconds: 30 });
  t.rec.gameId = 'fourinarow';
  const room = new Room(t.rec, {
    now: () => clock, random: Math.random, setTimer: (ms, fn) => { timers.push({ at: clock + ms, fn }); return () => {}; },
    save: () => {}, chat: () => {}, gameOver: (g) => { results.push(g.result); }, changed: () => {},
  });
  let clock = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const results: unknown[] = [];
  const advance = (ms: number) => { clock += ms; for (const tm of timers.splice(0)) { if (tm.at <= clock) tm.fn(); else timers.push(tm); } };
  for (const u of [host, alex]) room.join(u);
  room.handle(host, { t: 'sit', seat: 'amber' });
  room.handle(alex, { t: 'sit', seat: 'teal' });
  room.handle(host, { t: 'start' });
  assert.deepEqual(room.snapshotFor(host.id).game.turnSeats, ['amber']);
  assert.equal(room.snapshotFor(host.id).game.moveDeadline, 30_000);
  advance(20_000);
  room.handle(host, { t: 'act', action: { type: 'drop', col: 3 } });
  assert.equal(room.snapshotFor(host.id).game.moveDeadline, 50_000, 'a fresh 30 s for teal');
  advance(29_000);
  assert.equal(results.length, 0);
  advance(2_000);
  assert.deepEqual(results, [{ winner: 'amber', reason: 'Teal running out of move time' }]);
  assert.equal(room.snapshotFor(host.id).game.result?.reason, 'Teal running out of move time');
  assert.throws(() => room.handle(host, { t: 'settings', settings: { moveSeconds: 7 } }), /from the list/);
});
