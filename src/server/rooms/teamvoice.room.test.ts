import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';

// Realm Battle's private side voice (#82): the room gates it with the same
// player-only, per-game rule as team chat; the game says who is on which side.
const users = {
  h: { id: 'h', name: 'Sam', guest: false },
  a: { id: 'a', name: 'Alex', guest: false },
  v: { id: 'v', name: 'Vic', guest: false },
  r: { id: 'r', name: 'Rae', guest: false },
  w: { id: 'w', name: 'Priya', guest: false },
} satisfies Record<string, RoomUser>;

function setup(mode: '2v2' | 'ffa' = '2v2', start = true) {
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Battle', gameId: 'realmbattle', hostId: users.h.id, hostName: users.h.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig: { mode, hand: 3 } },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  let ids = 0;
  const hooks: RoomHooks = {
    now: () => 1_000_000 + ids * 1000, random: () => 0.4, setTimer: () => () => {},
    newId: () => `game-${++ids}`,
    save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  };
  const room = new Room(rec, hooks);
  for (const u of Object.values(users)) room.join(u);
  for (const [id, seat] of [['h', 'amber'], ['a', 'teal'], ['v', 'violet'], ['r', 'rose']] as const) room.handle(users[id as keyof typeof users], { t: 'sit', seat });
  if (start) room.handle(users.h, { t: 'start' });
  return { room, rec };
}

test('a side voice channel appears only for players of a team game', () => {
  assert.equal(setup('2v2', false).room.snapshotFor(users.h.id).you.teamVoice, null, 'no game, no side voice');
  const { room } = setup();
  assert.deepEqual(room.snapshotFor(users.h.id).you.teamVoice, { channel: 'team-0', label: 'Sun team voice' });
  assert.deepEqual(room.snapshotFor(users.v.id).you.teamVoice, { channel: 'team-0', label: 'Sun team voice' });
  assert.equal(room.snapshotFor(users.a.id).you.teamVoice?.channel, 'team-1');
  assert.equal(room.snapshotFor(users.w.id).you.teamVoice, null, 'watchers are on no side');
  assert.equal(setup('ffa').room.snapshotFor(users.h.id).you.teamVoice, null, 'free-for-all has no sides');
});

test('only that side can use its voice, and it is audio only', () => {
  const { room } = setup();
  const sun = { listen: true, talk: true, video: false };
  assert.deepEqual(room.voiceRight(users.h.id, 'team-0'), sun);
  assert.deepEqual(room.voiceRight(users.v.id, 'team-0'), sun);
  assert.deepEqual(room.voiceRight(users.r.id, 'team-1'), sun);
  assert.equal(room.voiceRight(users.r.id, 'team-0'), null, 'the other side can’t join');
  assert.equal(room.voiceRight(users.w.id, 'team-0'), null, 'watchers can’t join');
  assert.equal(room.voiceRight(users.h.id, 'team-1'), null, 'guessing the other side doesn’t work');
  assert.equal(room.voiceRight('nobody', 'team-0'), null, 'not in the room');
  assert.deepEqual(room.teamVoiceChannels().sort(), ['team-0', 'team-1']);
});

test('a newcomer in a side’s seat can’t use the last game’s voice', () => {
  const { room } = setup();
  room.handle(users.v, { t: 'act', action: { type: 'resign' } });
  room.handle(users.h, { t: 'act', action: { type: 'resign' } });
  assert.equal(room.snapshotFor(users.h.id).you.teamVoice?.channel, 'team-0', 'the side that played keeps its channel between games');
  room.handle(users.v, { t: 'stand' });
  room.handle(users.w, { t: 'sit', seat: 'violet' });
  assert.equal(room.snapshotFor(users.w.id).you.teamVoice, null);
  assert.equal(room.voiceRight(users.w.id, 'team-0'), null);
});

test('each game gets a new side voice room', () => {
  const { room } = setup();
  const first = room.voiceGeneration();
  assert.ok(first);
  room.handle(users.v, { t: 'act', action: { type: 'resign' } });
  room.handle(users.h, { t: 'act', action: { type: 'resign' } });
  room.handle(users.h, { t: 'start' });
  const second = room.voiceGeneration();
  assert.ok(second);
  assert.notEqual(second, first, 'old tokens name a different LiveKit room');
  assert.deepEqual(room.voiceRight(users.h.id, 'team-0'), { listen: true, talk: true, video: false });
});
