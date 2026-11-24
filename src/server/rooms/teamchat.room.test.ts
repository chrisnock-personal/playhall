import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';

// Realm Battle's private team chat (#68): the room allows and filters it; the
// game says who is on which side.
const users = {
  h: { id: 'h', name: 'Sam', guest: false },
  a: { id: 'a', name: 'Alex', guest: false },
  v: { id: 'v', name: 'Vic', guest: false },
  r: { id: 'r', name: 'Rae', guest: false },
  w: { id: 'w', name: 'Priya', guest: false },
} satisfies Record<string, RoomUser>;

function setup(start: boolean) {
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Battle', gameId: 'realmbattle', hostId: users.h.id, hostName: users.h.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig: { mode: '2v2', hand: 3 } },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const hooks: RoomHooks = {
    now: () => 1_000_000, random: () => 0.4, setTimer: () => () => {},
    save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  };
  const room = new Room(rec, hooks);
  for (const u of Object.values(users)) room.join(u);
  for (const [id, seat] of [['h', 'amber'], ['a', 'teal'], ['v', 'violet'], ['r', 'rose']] as const) room.handle(users[id as keyof typeof users], { t: 'sit', seat });
  if (start) room.handle(users.h, { t: 'start' });
  return { room, rec };
}

test('team chat appears only when a team game is on', () => {
  const before = setup(false).room;
  assert.equal(before.snapshotFor(users.h.id).you.teamChat, null);
  const after = setup(true).room;
  assert.deepEqual(after.snapshotFor(users.h.id).you.teamChat, { channel: 'team-0', label: 'Sun team' });
  assert.deepEqual(after.snapshotFor(users.v.id).you.teamChat, { channel: 'team-0', label: 'Sun team' });
  assert.deepEqual(after.snapshotFor(users.a.id).you.teamChat, { channel: 'team-1', label: 'Moon team' });
  assert.equal(after.snapshotFor(users.w.id).you.teamChat, null, 'watchers are on no team');
});

test('only that team can write and read its chat', () => {
  const { room } = setup(true);
  assert.throws(() => room.handle(users.a, { t: 'chat', channel: 'team-0', text: 'spies' }), /No such chat/);
  assert.throws(() => room.handle(users.w, { t: 'chat', channel: 'team-0', text: 'spies' }), /No such chat/);
  room.handle(users.h, { t: 'chat', channel: 'team-0', text: 'sun plan' });
  room.handle(users.r, { t: 'chat', channel: 'team-1', text: 'moon plan' });
  room.handle(users.h, { t: 'chat', channel: 'table', text: 'hello all' });

  const sun = room.snapshotFor(users.v.id);
  assert.ok(sun.chat.some((l) => l.text === 'sun plan' && l.channel === 'team-0'));
  assert.ok(sun.chat.some((l) => l.text === 'hello all' && l.channel === 'table'));
  assert.ok(!sun.chat.some((l) => l.text === 'moon plan'), 'the other team’s chat is hidden');

  const moon = room.snapshotFor(users.a.id);
  assert.ok(moon.chat.some((l) => l.text === 'moon plan' && l.channel === 'team-1'));
  assert.ok(!moon.chat.some((l) => l.text === 'sun plan'));

  const watcher = room.snapshotFor(users.w.id);
  assert.ok(watcher.chat.some((l) => l.text === 'hello all'));
  assert.ok(!watcher.chat.some((l) => l.channel === 'team-0' || l.channel === 'team-1'), 'no team chat for watchers');
});

test('a new game cannot read the last game’s lines on the same side', () => {
  const { room, rec } = setup(true);
  room.handle(users.h, { t: 'chat', channel: 'team-0', text: 'old plan' });
  const old = room.snapshotFor(users.h.id).chat.find((l) => l.text === 'old plan')!;
  // Side numbers are reused; a new game starts after the old line's id.
  rec.game.teamChatSince = old.id + 1;
  room.handle(users.h, { t: 'chat', channel: 'team-0', text: 'new plan' });
  const snap = room.snapshotFor(users.h.id);
  assert.ok(!snap.chat.some((l) => l.text === 'old plan'));
  assert.ok(snap.chat.some((l) => l.text === 'new plan'));
});

test('after the game, a newcomer in a side’s seat can’t read that side’s chat', () => {
  const { room, rec } = setup(true);
  room.handle(users.v, { t: 'chat', channel: 'team-0', text: 'sun secret' });
  room.handle(users.v, { t: 'act', action: { type: 'resign' } });
  room.handle(users.h, { t: 'act', action: { type: 'resign' } });
  assert.equal(rec.game.status, 'over');
  assert.ok(room.snapshotFor(users.h.id).chat.some((l) => l.text === 'sun secret'), 'the team that played still reads it');
  if (rec.seats.violet) room.handle(users.v, { t: 'stand' });
  room.handle(users.w, { t: 'sit', seat: 'violet' });
  const snap = room.snapshotFor(users.w.id);
  assert.equal(snap.you.teamChat, null);
  assert.ok(!snap.chat.some((l) => l.text === 'sun secret'));
  assert.throws(() => room.handle(users.w, { t: 'chat', channel: 'team-0', text: 'hi' }), /No such chat/);
});
