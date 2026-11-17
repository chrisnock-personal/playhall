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
  const kicked: string[] = [];
  const hooks: RoomHooks = {
    now: () => now,
    random: Math.random,
    setTimer: (ms, fn) => { const t = { at: now + ms, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
    save: () => {},
    chat: () => {},
    gameOver: (g) => { over.push(g.result); finished.push(g); },
    changed: () => {},
    kick: (id) => { kicked.push(id); },
  };
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Test', gameId: 'chess', hostId: host.id, hostName: host.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig: { initialSeconds: 60, incrementSeconds: 0 }, ...settings },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const room = new Room(rec, hooks);
  for (const u of [host, alex, priya, guest]) room.join(u);
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.fn(); }
  };
  return { room, rec, over, finished, kicked, advance };
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
  let clock = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const results: unknown[] = [];
  const advance = (ms: number) => { clock += ms; for (const tm of timers.splice(0)) { if (tm.at <= clock) tm.fn(); else timers.push(tm); } };
  const room = new Room(t.rec, {
    now: () => clock, random: Math.random, setTimer: (ms, fn) => { timers.push({ at: clock + ms, fn }); return () => {}; },
    save: () => {}, chat: () => {}, gameOver: (g) => { results.push(g.result); }, changed: () => {}, kick: () => {},
  });
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

test('games for more players start with some seats empty, once the minimum are seated', () => {
  const t = setup();
  t.rec.gameId = 'snakes';
  const room = new Room(t.rec, {
    now: () => 0, random: () => 0.5, setTimer: () => () => {}, save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  });
  for (const u of [host, alex, priya]) room.join(u);
  room.handle(host, { t: 'sit', seat: 'amber' });
  assert.throws(() => room.handle(host, { t: 'start' }), /at least 2 players/);
  room.handle(priya, { t: 'sit', seat: 'violet' });
  room.handle(host, { t: 'start' });
  const snap = room.snapshotFor(host.id);
  assert.equal(snap.game.status, 'playing');
  assert.ok(snap.chat.some((l) => l.text.startsWith('Game started: Amber Sam, Violet Priya')));
  room.handle(host, { t: 'act', action: { type: 'roll' } });
  assert.deepEqual(room.snapshotFor(host.id).game.turnSeats, ['violet']);
});

test('watcher delay: off by default; when set, watchers see the board and table chat late', () => {
  const plain = setup();
  assert.equal(plain.rec.settings.watcherDelay, 0);
  const { room, advance } = setup({ watcherDelay: 30 });
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  room.handle(host, move('e2', 'e4'));
  room.handle(host, { t: 'chat', channel: 'table', text: 'Bold opening' });
  const watcher = room.snapshotFor(priya.id);
  assert.equal(watcher.you.delay, 30);
  assert.equal((watcher.game.view as { san: string[] }).san.length, 0, 'the watcher hasn’t seen e4 yet');
  assert.ok(!watcher.chat.some((l) => l.text === 'Bold opening'));
  assert.equal((room.snapshotFor(alex.id).game.view as { san: string[] }).san.length, 1, 'players see it live');
  room.handle(alex, { t: 'act', action: { type: 'resign' } });
  assert.equal(room.snapshotFor(priya.id).game.result, null, 'the result isn’t given away early');
  advance(31_000);
  const later = room.snapshotFor(priya.id);
  assert.equal(later.game.status, 'over');
  assert.ok(later.chat.some((l) => l.text === 'Bold opening'));
});

test('a player who drops out has a minute to come back, then forfeits', () => {
  const t = setup();
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  t.room.leave(alex.id);
  assert.ok(t.room.snapshotFor(host.id).game.leaving.black, 'a countdown for Black');
  t.advance(30_000);
  t.room.join(alex);
  assert.deepEqual(t.room.snapshotFor(host.id).game.leaving, {}, 'back in time');
  t.room.leave(alex.id);
  t.advance(61_000);
  assert.deepEqual(t.over, [{ winner: 'white', reason: 'Alex leaving the game' }]);
});

test('no reconnect grace for a seat whose player never took part (the demo\u2019s live game)', () => {
  const t = setup();
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.leave(alex.id);
  t.room.handle(host, { t: 'start' });
  // Alex wasn't there at the start: opening the room and leaving again
  // doesn't put the game at risk.
  t.room.join(alex);
  t.room.leave(alex.id);
  assert.deepEqual(t.room.snapshotFor(host.id).game.leaving, {});
  t.advance(61_000);
  assert.deepEqual(t.over, []);
  // Once they play, they're in it: leaving starts the grace.
  t.room.join(alex);
  t.room.handle(host, move('e2', 'e4'));
  t.room.handle(alex, move('e7', 'e5'));
  t.room.leave(alex.id);
  assert.ok(t.room.snapshotFor(host.id).game.leaving.black);
});

test('a game loaded with players who never connected (no record of who joined) isn\u2019t forfeited', () => {
  const t = setup();
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  delete t.rec.game.joined; // as the demo seeds it, or an older save
  t.room.leave(host.id);
  t.room.leave(alex.id);
  t.advance(120_000);
  assert.deepEqual(t.over, []);
  assert.equal(t.rec.game.status, 'playing');
});

test('a restart doesn\u2019t charge the downtime to the player whose clock was running', () => {
  const t = setup({ moveSeconds: 0 });
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  t.room.handle(host, move('e2', 'e4'));
  t.room.handle(alex, move('e7', 'e5'));
  t.advance(10_000); // White thinks for 10 s...
  t.room.markAlive(); // (the manager's heartbeat)
  const saved = JSON.parse(JSON.stringify(t.rec)) as RoomRecord;
  t.room.dispose();
  // ...then the server is down for five minutes.
  const later = 1_000_000 + 10_000 + 5 * 60_000;
  const timers: (() => void)[] = [];
  const hooks: RoomHooks = {
    now: () => later, random: Math.random, setTimer: (_ms, fn) => { timers.push(fn); return () => {}; },
    save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  };
  const back = new Room(saved, hooks);
  const view = back.snapshotFor(host.id).game.view as { clocks: { white: number; black: number } };
  assert.equal(view.clocks.white, 50_000, 'White still has the 50 s left at the restart');
  assert.equal(view.clocks.black, 60_000);
  assert.equal(saved.game.status, 'playing');
});

test('a restart moves the move timer on by the downtime', () => {
  let now = 5_000_000;
  const hooks: RoomHooks = {
    now: () => now, random: Math.random, setTimer: () => () => {},
    save: () => {}, chat: () => {}, gameOver: () => {}, changed: () => {}, kick: () => {},
  };
  const rec: RoomRecord = {
    id: 'r2', code: 'DEF456', name: 'Test', gameId: 'fourinarow', hostId: host.id, hostName: host.name,
    settings: { ...DEFAULT_SETTINGS, moveSeconds: 30, gameConfig: {} },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const room = new Room(rec, hooks);
  room.join(host); room.join(alex);
  room.handle(host, { t: 'sit', seat: room.game.seats[0].id });
  room.handle(alex, { t: 'sit', seat: room.game.seats[1].id });
  room.handle(host, { t: 'start' });
  const deadline = rec.game.moveDeadline!;
  now += 10_000;
  room.markAlive();
  const saved = JSON.parse(JSON.stringify(rec)) as RoomRecord;
  now += 3_600_000;
  new Room(saved, hooks);
  assert.equal(saved.game.moveDeadline, deadline + 3_600_000);
});

test('the host can remove someone; they can\u2019t come back', () => {
  const t = setup();
  t.room.handle(host, { t: 'sit', seat: 'white' });
  t.room.handle(alex, { t: 'sit', seat: 'black' });
  t.room.handle(host, { t: 'start' });
  assert.throws(() => t.room.handle(alex, { t: 'kick', userId: 'p' }), /Only the host/);
  t.room.handle(host, { t: 'kick', userId: 'a' });
  assert.deepEqual(t.kicked, ['a']);
  assert.equal(t.room.seatOf('a'), null);
  assert.equal(t.finished.length, 1, 'the game was stopped');
  assert.ok(t.room.isBanned('a'));
  assert.ok(t.rec.banned.includes('a'));
});

test('voice and video follow the chat rules', () => {
  const { room } = setup();
  assert.equal(room.mediaRights('nobody'), null, 'not in the room');
  const W = priya.id, P = alex.id;
  room.handle(alex, { t: 'sit', seat: 'black' });
  assert.deepEqual(room.mediaRights(W), { table: { listen: true, talk: true, video: false }, gallery: { listen: true, talk: true, video: false } }, 'before the game, watchers can talk at the table');
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(host, { t: 'start' });
  assert.deepEqual(room.mediaRights(P)?.table, { listen: true, talk: true, video: true });
  assert.equal(room.mediaRights(P)?.gallery.talk, false, 'players don’t talk in the gallery');
  assert.deepEqual(room.mediaRights(W)?.table, { listen: true, talk: false, video: false }, 'watchers listen at the table during play');
  assert.deepEqual(room.mediaRights(W)?.gallery, { listen: true, talk: true, video: false });
});

test('watchers on a delay don’t hear the table live', () => {
  const { room } = setup({ watcherDelay: 30 });
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  assert.deepEqual(room.mediaRights(priya.id)?.table, { listen: false, talk: false, video: false });
  assert.equal(room.mediaRights(priya.id)?.gallery.listen, true);
});

test('rematch: when every player agrees, the next game starts with the same seats', () => {
  const { room } = setup();
  room.handle(alex, { t: 'sit', seat: 'white' });
  room.handle(priya, { t: 'sit', seat: 'black' });
  assert.throws(() => room.handle(alex, { t: 'rematch', want: true }), /after a game/);
  room.handle(host, { t: 'start' });
  room.handle(priya, { t: 'act', action: { type: 'resign' } });
  assert.deepEqual(room.snapshotFor(alex.id).rematch, { allowed: true, agreed: [] });
  assert.throws(() => room.handle(guest, { t: 'rematch', want: true }), /Only players/);
  room.handle(alex, { t: 'rematch', want: true });
  assert.deepEqual(room.snapshotFor(host.id).rematch?.agreed, ['a'], 'shows who agreed');
  room.handle(alex, { t: 'rematch', want: false });
  assert.deepEqual(room.snapshotFor(host.id).rematch?.agreed, [], 'taken back');
  room.handle(alex, { t: 'rematch', want: true });
  room.handle(priya, { t: 'rematch', want: true });
  const snap = room.snapshotFor(host.id);
  assert.equal(snap.game.status, 'playing');
  assert.equal(snap.rematch, null);
  assert.equal(room.seatOf('a'), 'white');
  assert.equal(room.seatOf('p'), 'black');
});

test('rematch: follows the after-game rule, and the host can still start', () => {
  const { room } = setup({ afterGame: 'winnerStays' });
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(priya, { t: 'hand', up: true });
  room.handle(host, { t: 'start' });
  room.handle(alex, { t: 'act', action: { type: 'resign' } });
  // Priya took Alex's seat: Alex can't ask, and the two now seated must agree.
  assert.throws(() => room.handle(alex, { t: 'rematch', want: true }), /Only players/);
  room.handle(host, { t: 'rematch', want: true });
  assert.equal(room.snapshotFor(host.id).game.status, 'over', 'Priya hasn’t agreed yet');
  room.handle(priya, { t: 'rematch', want: true });
  assert.equal(room.snapshotFor(host.id).game.status, 'playing');
  assert.equal(room.seatOf('p'), 'black');
  room.handle(priya, { t: 'act', action: { type: 'resign' } });
  room.handle(priya, { t: 'rematch', want: true });
  room.handle(host, { t: 'start' });
  assert.equal(room.snapshotFor(host.id).game.status, 'playing', 'the host starts without waiting');
});

test('rematch: not for players in rooms where the host seats people', () => {
  const { room } = setup({ seatPolicy: 'host' });
  room.handle(host, { t: 'seat', userId: 'a', seat: 'white' });
  room.handle(host, { t: 'seat', userId: 'p', seat: 'black' });
  room.handle(host, { t: 'start' });
  room.handle(priya, { t: 'act', action: { type: 'resign' } });
  assert.equal(room.snapshotFor(alex.id).rematch?.allowed, false);
  assert.throws(() => room.handle(alex, { t: 'rematch', want: true }), /host starts/);
});

test('cameras: players at the table, watchers in the gallery only when the host allows it', () => {
  const { room } = setup();
  const W = priya.id, P = alex.id;
  room.handle(alex, { t: 'sit', seat: 'black' });
  // Before the game: players send video to the table (their seat cards), never the gallery.
  assert.equal(room.mediaRights(P)?.table.video, true);
  assert.equal(room.mediaRights(P)?.gallery.video, false, 'a player’s camera belongs on the seat card');
  // Watchers: no camera anywhere by default, even where they may talk.
  assert.equal(room.mediaRights(W)?.table.talk, true);
  assert.equal(room.mediaRights(W)?.table.video, false, 'watchers never send video to the table');
  assert.equal(room.mediaRights(W)?.gallery.video, false, 'watcher video is off by default');
  assert.equal(room.snapshotFor(W).room.settings.watcherVideo, false);
  // Only the host turns it on.
  assert.throws(() => room.handle(priya, { t: 'settings', settings: { watcherVideo: true } }), /Only the host/);
  room.handle(host, { t: 'settings', settings: { watcherVideo: true } });
  assert.deepEqual(room.mediaRights(W)?.gallery, { listen: true, talk: true, video: true });
  assert.equal(room.mediaRights(W)?.table.video, false, 'still not at the table');
  assert.deepEqual(room.snapshotFor(W).you.media, room.mediaRights(W), 'the snapshot carries your rights');
  // The game starts: players keep their cameras; the gallery is hidden from them (the default rule).
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(host, { t: 'start' });
  assert.equal(room.mediaRights(P)?.table.video, true);
  assert.deepEqual(room.mediaRights(P)?.gallery, { listen: false, talk: false, video: false }, 'players don’t see the gallery during play');
  assert.equal(room.mediaRights(W)?.gallery.video, true);
  assert.equal(room.mediaRights(W)?.table.video, false);
  // The host turns it off again: watcher cameras are no longer allowed.
  room.handle(host, { t: 'settings', settings: { watcherVideo: false } });
  assert.equal(room.mediaRights(W)?.gallery.video, false);
});

test('players see watcher video when the gallery isn’t hidden from them', () => {
  const { room } = setup({ hideGalleryFromPlayers: false, watcherVideo: true });
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  assert.deepEqual(room.mediaRights(alex.id)?.gallery, { listen: true, talk: false, video: false }, 'they see and hear it, but don’t send to it');
  assert.equal(room.mediaRights(priya.id)?.gallery.video, true);
});

test('watchers on a delay see no table video either', () => {
  const { room, advance } = setup({ watcherDelay: 30, watcherVideo: true });
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.handle(host, { t: 'start' });
  assert.equal(room.mediaRights(priya.id)?.table.listen, false, 'no live voice or video from the table');
  assert.equal(room.mediaRights(priya.id)?.gallery.video, true, 'the gallery stays live');
  room.handle(alex, { t: 'act', action: { type: 'resign' } });
  advance(1000);
  assert.deepEqual(room.mediaRights(priya.id)?.table, { listen: true, talk: true, video: false }, 'it comes back between games (still no watcher camera at the table)');
});

test('a seated player away 5 minutes between games gives up their seat; back sooner, they keep it', () => {
  const { room, rec, advance } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.leave(alex.id);
  advance(4 * 60_000);
  room.join(alex);
  advance(2 * 60_000);
  assert.equal(rec.seats.black?.userId, alex.id, 'back within 5 minutes: still seated');
  room.leave(alex.id);
  advance(5 * 60_000 + 1);
  assert.equal(rec.seats.black, null, 'away 5 minutes: the seat is free');
  assert.equal(rec.seats.white?.userId, host.id);
});

test('a host away 5 minutes hands the room to someone seated (an account, never a guest)', () => {
  const { room, rec, advance } = setup();
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.leave(host.id);
  advance(5 * 60_000 + 1);
  assert.equal(rec.hostId, alex.id);
  assert.equal(room.snapshotFor(alex.id).you.host, true);
  // With only a guest left, nobody takes over until someone with an account comes.
  const s2 = setup();
  for (const u of [alex, priya]) s2.room.leave(u.id);
  s2.room.leave(host.id);
  s2.advance(5 * 60_000 + 1);
  assert.equal(s2.rec.hostId, host.id, 'only a guest here: the host stays');
});

test('a seated player missing when the game starts gets a minute, then the game goes on without them', () => {
  const { room, rec, over, advance } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  room.handle(alex, { t: 'sit', seat: 'black' });
  room.leave(alex.id);
  room.handle(host, { t: 'start' });
  assert.equal(rec.game.status, 'playing');
  advance(61_000);
  assert.equal(rec.game.status, 'over', 'two players: the one still here wins');
  assert.equal((over.at(-1) as { winner: string }).winner, 'white');
});
