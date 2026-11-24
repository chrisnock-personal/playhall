import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';
import type { ClueWordsView } from '../../shared/games/cluewords';

// The room gives each Clue Words side its own chat tab and its own view of the
// board; a watcher sees the key. There's no team chat.
const users = {
  h: { id: 'h', name: 'Sam', guest: false },
  a: { id: 'a', name: 'Alex', guest: false },
  v: { id: 'v', name: 'Vic', guest: false },
  r: { id: 'r', name: 'Rae', guest: false },
  w: { id: 'w', name: 'Priya', guest: false },
} satisfies Record<string, RoomUser>;

function setup() {
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Words', gameId: 'cluewords', hostId: 'h', hostName: 'Sam',
    settings: { ...DEFAULT_SETTINGS, gameConfig: {} },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const hooks: RoomHooks = {
    now: () => 1_000_000, random: () => 0.4, setTimer: () => () => {},
    save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  };
  const room = new Room(rec, hooks);
  for (const u of Object.values(users)) room.join(u);
  for (const [id, seat] of [['h', 'amber'], ['a', 'teal'], ['v', 'violet'], ['r', 'rose']] as const) room.handle(users[id as keyof typeof users], { t: 'sit', seat });
  room.handle(users.h, { t: 'start' });
  return room;
}

const boardOf = (room: Room, id: keyof typeof users) => room.snapshotFor(users[id].id).game.view as ClueWordsView;

test('the room starts a Clue Words game with a key only its clue-givers can see', () => {
  const room = setup();
  assert.ok(boardOf(room, 'h').cards.every((c) => c.kind !== null), 'the Sun clue-giver sees the key');
  assert.ok(boardOf(room, 'v').cards.every((c) => c.kind === null), 'the Sun guesser does not');
  assert.ok(boardOf(room, 'w').cards.every((c) => c.kind !== null), 'a watcher sees the key');
});

test('no team chat: a clue-giver can’t pass answers to the guesser in private', () => {
  const room = setup();
  for (const id of ['h', 'v', 'a', 'r', 'w'] as const) assert.equal(room.snapshotFor(users[id].id).you.teamChat, null);
  assert.throws(() => room.handle(users.h, { t: 'chat', channel: 'team-0', text: 'pick TIGER' }), /No such chat/);
});
