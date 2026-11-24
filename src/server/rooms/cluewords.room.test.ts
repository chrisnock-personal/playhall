import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';
import type { ClueWordsView } from '../../shared/games/cluewords';

// The room gives each Clue Words side its own chat tab and its own view of the
// board; a watcher sees the key; a clue-giver reads its team chat but can't write.
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

test('team chat: guessers write, their clue-giver only reads, the other side and watchers see nothing', () => {
  const room = setup();
  assert.throws(() => room.handle(users.h, { t: 'chat', channel: 'team-0', text: 'pick TIGER' }), /read this team chat but not write/);
  assert.ok(!room.snapshotFor(users.h.id).you.canWrite.includes('team-0'));
  room.handle(users.v, { t: 'chat', channel: 'team-0', text: 'maybe TIGER?' });
  assert.ok(room.snapshotFor(users.h.id).chat.some((l) => l.text === 'maybe TIGER?'), 'the clue-giver reads the guesser');
  assert.ok(!room.snapshotFor(users.a.id).chat.some((l) => l.text === 'maybe TIGER?'), 'the other side doesn’t');
  assert.ok(!room.snapshotFor(users.w.id).chat.some((l) => l.text === 'maybe TIGER?'), 'nor do watchers');
  assert.throws(() => room.handle(users.a, { t: 'chat', channel: 'team-0', text: 'x' }), /No such chat/);
  assert.equal(room.snapshotFor(users.w.id).you.teamChat, null);
});
