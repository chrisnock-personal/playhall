// The camera table in a room: seats by setting, the host running things,
// dice and turns in the chat, results by confirmation, and the table camera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRACE_MS, Room, RoomError, type FinishedGame, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS, type RoomSettings } from '../../shared/protocol';
import type { CameraTableView } from '../../shared/games/cameratable';

const host: RoomUser = { id: 'h', name: 'Sam', guest: false };
const kai: RoomUser = { id: 'k', name: 'Kai', guest: false };
const alex: RoomUser = { id: 'a', name: 'Alex', guest: false };
const priya: RoomUser = { id: 'p', name: 'Priya', guest: false };

function setup(settings: Partial<RoomSettings> = {}, gameConfig: unknown = { name: 'Catan', seats: 3 }) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const finished: FinishedGame[] = [];
  let ids = 0;
  const hooks: RoomHooks = {
    now: () => now,
    random: Math.random,
    setTimer: (ms, fn) => { const t = { at: now + ms, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
    save: () => {},
    chat: () => {},
    gameOver: (g) => { finished.push(g); },
    changed: () => {},
    kick: () => {},
    newId: () => `cam${++ids}`,
  };
  const rec: RoomRecord = {
    id: 'r1', code: 'CAM123', name: 'Games night', gameId: 'cameratable', hostId: host.id, hostName: host.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig, ...settings },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const room = new Room(rec, hooks);
  for (const u of [host, kai, alex, priya]) room.join(u);
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.fn(); }
  };
  const view = () => room.snapshotFor(host.id).game.view as CameraTableView;
  const lines = (who = host) => room.snapshotFor(who.id).chat.map((l) => l.text);
  return { room, rec, finished, advance, view, lines };
}

/** Kai (amber) and Alex (teal) play; Sam hosts without a seat; Priya watches. */
function started(settings: Partial<RoomSettings> = {}) {
  const t = setup(settings);
  t.room.handle(kai, { t: 'sit', seat: 'amber' });
  t.room.handle(alex, { t: 'sit', seat: 'teal' });
  t.room.handle(host, { t: 'start' });
  return t;
}

test('seats: as many as the host picked, from 2 to 8', () => {
  const { room } = setup();
  const snap = room.snapshotFor(host.id);
  assert.deepEqual(snap.seats.map((s) => s.id), ['amber', 'teal', 'violet']);
  assert.equal(snap.room.gameName, 'Camera table');
  assert.equal(snap.room.configLabel, 'Catan · 3 seats');
  assert.equal(snap.room.minPlayers, 2);
  assert.throws(() => room.handle(kai, { t: 'sit', seat: 'rose' }), /No such seat/);
  room.handle(kai, { t: 'sit', seat: 'violet' });
  assert.throws(() => room.handle(host, { t: 'start' }), /needs at least 2 players/);
  // Fewer seats: whoever sat in one that's gone watches.
  room.handle(host, { t: 'settings', settings: { gameConfig: { name: 'Catan', seats: 2 } } });
  assert.equal(room.seatOf(kai.id), null);
  assert.equal(room.snapshotFor(host.id).seats.length, 2);
  room.handle(host, { t: 'settings', settings: { gameConfig: { name: 'Twilight Imperium', seats: 8 } } });
  assert.deepEqual(room.snapshotFor(host.id).seats.map((s) => s.id), ['amber', 'teal', 'violet', 'rose', 'lime', 'blue', 'red', 'slate']);
  assert.equal(room.summary().seats.length, 8);
  // The name can't be emptied.
  assert.throws(() => room.handle(host, { t: 'settings', settings: { gameConfig: { name: '  ', seats: 4 } } }), /Type the name/);
});

test('the host runs things, seated or not; only the host can use host actions', () => {
  const { room, view, lines } = started();
  assert.throws(() => room.handle(kai, { t: 'hostAct', action: { type: 'next' } }), /Only the host/);
  room.handle(host, { t: 'hostAct', action: { type: 'next' } });
  assert.deepEqual(room.snapshotFor(kai.id).game.turnSeats, ['teal']);
  room.handle(alex, { t: 'act', action: { type: 'next' } });
  assert.deepEqual(room.snapshotFor(kai.id).game.turnSeats, ['amber']);
  // Dice: said in the table chat for everyone, with who rolled.
  room.handle(kai, { t: 'act', action: { type: 'roll', dice: [6, 6] } });
  room.handle(host, { t: 'hostAct', action: { type: 'roll', dice: [20] } });
  assert.equal(view().rolls.length, 2);
  assert.ok(lines(priya).some((l) => /^Kai rolled \d \+ \d = \d+ \(2d6\)$/.test(l)), 'watchers see the roll');
  assert.ok(lines(kai).some((l) => /^Sam rolled \d+ \(d20\)$/.test(l)), 'the host rolls under their own name');
  // Watchers can't act at all.
  assert.throws(() => room.handle(priya, { t: 'act', action: { type: 'roll', dice: [6] } }), /Only players/);
  // Score pad.
  room.handle(kai, { t: 'act', action: { type: 'score', seat: 'amber', delta: 7 } });
  assert.throws(() => room.handle(kai, { t: 'act', action: { type: 'score', seat: 'teal', delta: 7 } }), /your own score/);
  room.handle(host, { t: 'hostAct', action: { type: 'score', seat: 'teal', value: 12 } });
  assert.deepEqual(room.snapshotFor(priya.id).game.view && (room.snapshotFor(priya.id).game.view as CameraTableView).scores, { amber: 7, teal: 12 });
  // Not for other games.
  assert.ok(room.snapshotFor(host.id).room.tableCamera);
});

test('host actions are refused in games that don’t have them', () => {
  const t = setup();
  const chess = new Room({ ...t.rec, gameId: 'chess', settings: { ...t.rec.settings, gameConfig: { initialSeconds: 60, incrementSeconds: 0 } }, seats: {} }, {
    now: () => 0, random: Math.random, setTimer: () => () => {}, save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  });
  chess.join(host); chess.join(kai);
  chess.handle(host, { t: 'sit', seat: 'white' });
  chess.handle(kai, { t: 'sit', seat: 'black' });
  chess.handle(host, { t: 'start' });
  assert.throws(() => chess.handle(host, { t: 'hostAct', action: { type: 'next' } }), /Unknown request/);
  assert.equal(chess.snapshotFor(host.id).room.tableCamera, null);
  assert.throws(() => chess.tableCameraId(), /Only camera table rooms/);
});

test('the move timer passes the turn on instead of ending the game', () => {
  const { room, advance, finished } = started({ moveSeconds: 30 });
  assert.deepEqual(room.snapshotFor(kai.id).game.turnSeats, ['amber']);
  advance(31_000);
  assert.deepEqual(room.snapshotFor(kai.id).game.turnSeats, ['teal']);
  assert.equal(finished.length, 0);
});

test('a player who drops out isn’t put out of the game: it waits for them', () => {
  const { room, advance, finished, lines } = started();
  room.leave(alex.id);
  advance(GRACE_MS * 3);
  assert.equal(finished.length, 0);
  assert.equal(room.snapshotFor(kai.id).game.status, 'playing');
  assert.ok(lines().includes('Alex dropped out: the game waits for them'));
  room.join(alex);
  assert.ok(lines().includes('Alex is back'));
});

test('results: the host enters places, each player confirms, then it counts', () => {
  const { room, view, finished, lines } = started();
  assert.throws(() => room.handle(kai, { t: 'act', action: { type: 'propose', placings: [['amber'], ['teal']] } }), /Only the host/);
  room.handle(host, { t: 'hostAct', action: { type: 'propose', placings: [['teal'], ['amber']] } });
  assert.ok(lines(priya).some((l) => l.startsWith('The host entered the result: 1st Alex, 2nd Kai')));
  assert.deepEqual(view().proposal!.confirmed, [], 'a host without a seat doesn’t confirm for anyone');
  assert.deepEqual(room.snapshotFor(kai.id).game.turnSeats, []);
  assert.throws(() => room.handle(priya, { t: 'act', action: { type: 'confirm', version: 1 } }), /Only players/);
  room.handle(alex, { t: 'act', action: { type: 'confirm', version: 1 } });
  assert.deepEqual(view().proposal!.confirmed, ['teal'], 'everyone sees who has confirmed');
  assert.equal(finished.length, 0);
  room.handle(kai, { t: 'act', action: { type: 'confirm', version: 1 } });
  assert.equal(finished.length, 1);
  assert.equal(finished[0].counted, true);
  assert.equal(finished[0].note, null);
  assert.deepEqual(finished[0].result, { winner: 'teal', placings: [['teal'], ['amber']], reason: 'the agreed result' });
  assert.equal(room.snapshotFor(kai.id).game.status, 'over');
  assert.ok(lines().includes('Alex (Teal) won by the agreed result'));
});

test('a seated host’s own proposal is their confirmation', () => {
  const t = setup();
  t.room.handle(host, { t: 'sit', seat: 'amber' });
  t.room.handle(kai, { t: 'sit', seat: 'teal' });
  t.room.handle(host, { t: 'start' });
  t.room.handle(host, { t: 'hostAct', action: { type: 'propose', placings: [['amber'], ['teal']] } });
  assert.deepEqual(t.view().proposal!.confirmed, ['amber']);
  t.room.handle(kai, { t: 'act', action: { type: 'confirm', version: 1 } });
  assert.equal(t.finished[0].counted, true);
});

test('a dispute: the host revises and asks again, or ends it and it doesn’t count', () => {
  const { room, view, finished } = started();
  room.handle(host, { t: 'hostAct', action: { type: 'propose', placings: [['amber'], ['teal']] } });
  room.handle(kai, { t: 'act', action: { type: 'confirm', version: 1 } });
  room.handle(alex, { t: 'act', action: { type: 'dispute', version: 1 } });
  assert.equal(view().proposal, null);
  assert.deepEqual(view().disputed!.disputed, ['teal']);
  assert.equal(finished.length, 0);
  // Revised, and disputed again: the host ends it without a result.
  room.handle(host, { t: 'hostAct', action: { type: 'propose', placings: [['amber', 'teal']] } });
  assert.throws(() => room.handle(alex, { t: 'act', action: { type: 'confirm', version: 1 } }), /changed the result/);
  room.handle(alex, { t: 'act', action: { type: 'dispute', version: 2 } });
  room.handle(host, { t: 'hostAct', action: { type: 'abandon' } });
  assert.equal(finished.length, 1);
  assert.equal(finished[0].counted, false);
  assert.equal(finished[0].result.aborted, true);
  assert.match(String(finished[0].note), /stopped/);
});

test('a confirmed result still follows the room’s rules: casual rooms and guests don’t count', () => {
  const { room, finished } = started({ ranked: false });
  room.handle(host, { t: 'hostAct', action: { type: 'propose', placings: [['amber'], ['teal']] } });
  room.handle(kai, { t: 'act', action: { type: 'confirm', version: 1 } });
  room.handle(alex, { t: 'act', action: { type: 'confirm', version: 1 } });
  assert.equal(finished[0].counted, false);
  assert.match(String(finished[0].note), /casual/);
});

test('the table camera: one device at a time, made and stopped by the host', () => {
  const { room, rec, lines } = setup();
  assert.equal(room.snapshotFor(kai.id).room.tableCamera?.on, false);
  const id = room.tableCameraId();
  assert.equal(id, 'cam1');
  assert.equal(room.tableCameraId(), id, 'showing the link again keeps the same device');
  assert.equal(room.isTableCamera(id), true);
  assert.equal(room.snapshotFor(kai.id).room.tableCamera?.on, true);
  assert.ok(!JSON.stringify(room.snapshotFor(kai.id)).includes(id), 'the device id never goes to browsers');
  assert.ok(!JSON.stringify(room.snapshotFor(host.id)).includes(id), 'not even the host’s');
  // A new link cuts off the old device.
  const next = room.tableCameraId(true);
  assert.notEqual(next, id);
  assert.equal(room.isTableCamera(id), false);
  assert.equal(room.isTableCamera(next), true);
  room.stopTableCamera();
  assert.equal(room.isTableCamera(next), false);
  assert.equal(rec.tableCamera, null);
  assert.ok(lines().includes('The host stopped the table camera'));
  assert.equal(room.isTableCamera(''), false);
  // The device isn't a member: it has no voice or video rights of its own.
  assert.equal(room.mediaRights('camera:' + next), null);
  assert.equal(room.members().length, 4);
});

test('RoomError for anything a client sends wrong', () => {
  const { room } = started();
  assert.throws(() => room.handle(host, { t: 'hostAct', action: { type: 'propose', placings: 'everyone' } }), RoomError);
  assert.throws(() => room.handle(kai, { t: 'act', action: { type: 'roll', dice: [3] } }), RoomError);
});
