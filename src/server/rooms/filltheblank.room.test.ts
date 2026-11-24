import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';
import type { FillBlankView } from '../../shared/games/filltheblank';

// The room gives each player their own hand and nobody else's. Watchers get
// the read-out but never a hand, and there's no private team chat to leak through.
const users = {
  h: { id: 'h', name: 'Sam', guest: false },
  a: { id: 'a', name: 'Alex', guest: false },
  v: { id: 'v', name: 'Vic', guest: false },
  w: { id: 'w', name: 'Priya', guest: false },
} satisfies Record<string, RoomUser>;

function setup() {
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Blanks', gameId: 'filltheblank', hostId: 'h', hostName: 'Sam',
    settings: { ...DEFAULT_SETTINGS, gameConfig: { players: 3, questions: 'My ___ is missing', answers: 'a silver spoon\na tiny hat' } },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const hooks: RoomHooks = {
    now: () => 1_000_000, random: () => 0.4, setTimer: () => () => {},
    save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  };
  const room = new Room(rec, hooks);
  for (const u of Object.values(users)) room.join(u);
  for (const [id, seat] of [['h', 'amber'], ['a', 'teal'], ['v', 'violet']] as const) room.handle(users[id as keyof typeof users], { t: 'sit', seat });
  room.handle(users.h, { t: 'start' });
  return room;
}

const viewOf = (room: Room, id: keyof typeof users) => room.snapshotFor(users[id].id).game.view as FillBlankView;

test('players see only their own hand; watchers see none', () => {
  const room = setup();
  const host = viewOf(room, 'h');
  assert.equal(host.order.length, 3);
  assert.equal(host.hand?.length, 5);
  assert.equal(viewOf(room, 'a').hand?.length, 5);
  assert.deepEqual(viewOf(room, 'a').hand !== host.hand, true);
  assert.equal(viewOf(room, 'w').hand, null);
  assert.equal(viewOf(room, 'w').you, null);
  assert.match(host.question, /___/);
  assert.deepEqual(host.plays, []);
});

test('cards and judging travel through the room without naming authors early', () => {
  const room = setup();
  room.handle(users.a, { t: 'act', action: { type: 'play', card: 0 } });
  room.handle(users.v, { t: 'act', action: { type: 'play', card: 0 } });
  const judge = viewOf(room, 'h');
  assert.equal(judge.phase, 'judge');
  assert.deepEqual(judge.plays.map((p) => p.label), ['A', 'B']);
  assert.deepEqual(viewOf(room, 'w').plays, judge.plays);
  assert.ok(judge.log.every((line) => !line.includes(judge.plays[0].text)));

  room.handle(users.h, { t: 'act', action: { type: 'pick', play: 0 } });
  const after = viewOf(room, 'h');
  assert.equal(after.round, 2);
  assert.equal(after.judge, 'teal');
  assert.equal(Object.values(after.points).reduce((n, p) => n + p, 0), 1);
  assert.match(after.log.at(-1)!, /wins round 1/);
});

test('no team chat: a private channel can’t carry the answers', () => {
  const room = setup();
  for (const id of ['h', 'a', 'v', 'w'] as const) assert.equal(room.snapshotFor(users[id].id).you.teamChat, null);
  assert.throws(() => room.handle(users.h, { t: 'chat', channel: 'team-0', text: 'a silver spoon' }), /No such chat/);
});
