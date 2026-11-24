import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';
import type { WhatAmIView } from '../../shared/games/whatami';

// The room gives each seat its own view: you can't see your own word, but
// everyone else can, and watchers see all of them.
const users = {
  h: { id: 'h', name: 'Sam', guest: false },
  a: { id: 'a', name: 'Alex', guest: false },
  v: { id: 'v', name: 'Vic', guest: false },
  w: { id: 'w', name: 'Priya', guest: false },
} satisfies Record<string, RoomUser>;

function setup() {
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Words', gameId: 'whatami', hostId: 'h', hostName: 'Sam',
    settings: { ...DEFAULT_SETTINGS, gameConfig: { players: 3, category: 'animals', custom: 'DOLPHIN' } },
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

const viewOf = (room: Room, id: keyof typeof users) => room.snapshotFor(users[id].id).game.view as WhatAmIView;

test('a three-player game hands out words that only their owner cannot see', () => {
  const room = setup();
  const host = viewOf(room, 'h');
  const watcher = viewOf(room, 'w');
  assert.equal(host.order.length, 3);
  assert.equal(host.words.amber, null, 'the host cannot see their own word');
  assert.ok(host.words.teal, 'the host sees Alex’s word');
  assert.equal(viewOf(room, 'a').words.amber, watcher.words.amber, 'Alex sees the host’s word');
  assert.equal(viewOf(room, 'a').words.teal, null, 'Alex cannot see their own word');
  assert.equal(host.words.violet, watcher.words.violet);
  assert.ok(Object.values(watcher.words).every((w) => w !== null), 'watchers see every word');
});

test('questions and answers reach the players through the room', () => {
  const room = setup();
  room.handle(users.h, { t: 'act', action: { type: 'question', text: 'Is it an animal?' } });
  assert.equal(viewOf(room, 'a').question, 'Is it an animal?');
  room.handle(users.a, { t: 'act', action: { type: 'answer', answer: 'yes' } });
  room.handle(users.v, { t: 'act', action: { type: 'answer', answer: 'no' } });
  const host = viewOf(room, 'h');
  assert.equal(host.phase, 'question');
  assert.equal(host.roundQuestions, 1);
  assert.match(host.log.at(-1)!, /Alex: yes, Vic: no/);
  assert.deepEqual(viewOf(room, 'w').due, ['amber'], 'the watcher sees whose turn it is');
});
