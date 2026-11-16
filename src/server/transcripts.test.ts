import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Room, type RoomHooks, type RoomRecord, type RoomUser } from './rooms/room';
import { DEFAULT_SETTINGS, type ChatLine, type RoomSettings } from '../shared/protocol';
import { checkWav, cleanTranscript, handleSaid, SaidLimiter, transcriptsAllowed, type SaidDeps } from './transcripts';
import { encodeWav } from '../client/transcribe/wav';

const host: RoomUser = { id: 'h', name: 'Sam', guest: false };
const alex: RoomUser = { id: 'a', name: 'Alex', guest: false };
const vic: RoomUser = { id: 'v', name: 'Vic', guest: true };

function setup(settings: Partial<RoomSettings> = {}, allowed = true) {
  let now = 1_000_000;
  const stored: ChatLine[] = [];
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const flags = { allowed };
  const hooks: RoomHooks = {
    now: () => now,
    random: Math.random,
    setTimer: (ms, fn) => { const t = { at: now + ms, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
    save: () => {}, chat: (_id, l) => { stored.push(l); }, gameOver: () => {}, changed: () => {}, kick: () => {},
    transcriptsAllowed: () => flags.allowed,
  };
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Test', gameId: 'chess', hostId: host.id, hostName: host.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig: { initialSeconds: 60, incrementSeconds: 0 }, transcripts: true, ...settings },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const room = new Room(rec, hooks);
  for (const u of [host, alex, vic]) room.join(u);
  const advance = (ms: number) => { now += ms; for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.fn(); } };
  return { room, rec, stored, flags, advance };
}

const wav = (seconds = 1) => Buffer.from(encodeWav(new Float32Array(Math.round(16_000 * seconds)).fill(0.1)));

function deps(room: Room | null, opts: { allowed?: boolean; text?: string; fail?: boolean } = {}) {
  const sent: Buffer[] = [];
  const d: SaidDeps = {
    getRoom: async () => room,
    allowed: () => opts.allowed ?? true,
    transcribe: async (w) => { sent.push(w); if (opts.fail) throw new Error('down'); return opts.text ?? ' Your move. '; },
    limiter: new SaidLimiter(),
  };
  return { d, sent };
}

const said = (d: SaidDeps, userId: string, channel = 'table', body: unknown = wav()) => handleSaid(d, { code: 'ABC123', channel, userId, wav: body });

test('said: a player’s speech becomes a said line at the table', async () => {
  const { room, stored } = setup();
  room.handle(host, { t: 'sit', seat: 'white' });
  const { d, sent } = deps(room);
  const r = await said(d, host.id);
  assert.equal(r.status, 201);
  assert.equal(r.body.text, 'Your move.');
  assert.equal(sent.length, 1);
  const line = stored.at(-1)!;
  assert.deepEqual([line.kind, line.channel, line.name, line.text], ['said', 'table', 'Sam', 'Your move.']);
  assert.ok(room.snapshotFor(alex.id).chat.some((l) => l.kind === 'said'));
});

test('said: the room rule off, or the server not allowing it, sends no audio to Whisper', async () => {
  const off = setup({ transcripts: false });
  let { d, sent } = deps(off.room);
  assert.equal((await said(d, host.id)).status, 403);
  assert.equal(sent.length, 0);

  ({ d, sent } = deps(setup().room, { allowed: false }));
  assert.equal((await said(d, host.id)).status, 503);
  assert.equal(sent.length, 0);

  // The room's own hook too (the platform setting reaches rooms through it).
  const s = setup({}, false);
  ({ d, sent } = deps(s.room));
  assert.equal((await said(d, host.id)).status, 403);
  assert.equal(sent.length, 0);
});

test('said: only people who may talk in that channel', async () => {
  const s = setup();
  s.room.handle(host, { t: 'sit', seat: 'white' });
  s.room.handle(alex, { t: 'sit', seat: 'black' });
  s.room.handle(host, { t: 'start' });
  const { d, sent } = deps(s.room);
  // Players talk at the table, not in the gallery (hidden during play).
  assert.equal((await said(d, alex.id, 'gallery')).status, 403);
  // Watchers talk in the gallery, not at the table during play.
  assert.equal((await said(d, vic.id, 'table')).status, 403);
  assert.equal((await said(d, vic.id, 'gallery')).status, 201);
  // Not in the room at all.
  assert.equal((await said(d, 'stranger')).status, 403);
  assert.equal((await said(d, host.id, 'lounge')).status, 404);
  assert.equal(sent.length, 1);
  assert.equal(s.stored.at(-1)!.channel, 'gallery');
});

test('said: empty and noise results make no line', async () => {
  const { room, stored } = setup();
  for (const text of ['', '  ', '[BLANK_AUDIO]', ' (music) ', '[ Silence ]', '*laughs*', '...', '♪♪']) {
    const before = stored.length;
    const r = await said(deps(room, { text }).d, host.id);
    assert.equal(r.status, 200, text);
    assert.equal(r.body.text, null);
    assert.equal(stored.length, before, `no line for "${text}"`);
  }
});

test('said: bad audio, Whisper down, too many at once', async () => {
  const { room } = setup();
  assert.equal((await said(deps(room).d, host.id, 'table', Buffer.from('hello'))).status, 400);
  assert.equal((await said(deps(room).d, host.id, 'table', {})).status, 415);
  assert.equal((await said(deps(room).d, host.id, 'table', wav(0.1))).status, 400, 'too short');
  assert.equal((await said(deps(room).d, host.id, 'table', wav(17))).status, 400, 'too long');
  assert.equal((await said(deps(room, { fail: true }).d, host.id)).status, 502);

  const limiter = new SaidLimiter(3, 1);
  let finish!: () => void;
  const slow: SaidDeps = { getRoom: async () => room, allowed: () => true, limiter, transcribe: () => new Promise((res) => { finish = () => res('hi'); }) };
  const first = said(slow, host.id);
  await new Promise((r) => setImmediate(r));
  assert.equal((await said(slow, host.id)).status, 429, 'one at a time each');
  finish();
  assert.equal((await first).status, 201);
});

test('said: rights are checked again after Whisper (the game started meanwhile)', async () => {
  const s = setup();
  s.room.handle(host, { t: 'sit', seat: 'white' });
  s.room.handle(alex, { t: 'sit', seat: 'black' });
  let finish!: () => void;
  const d: SaidDeps = { getRoom: async () => s.room, allowed: () => true, limiter: new SaidLimiter(), transcribe: () => new Promise((res) => { finish = () => res('psst, take the queen'); }) };
  const p = said(d, vic.id, 'table');
  await new Promise((r) => setImmediate(r));
  s.room.handle(host, { t: 'start' });
  finish();
  assert.equal((await p).status, 403);
  assert.ok(!s.stored.some((l) => l.kind === 'said'));
});

test('said lines at the table reach delayed watchers late, like typed ones', async () => {
  const s = setup({ watcherDelay: 30 });
  s.room.handle(host, { t: 'sit', seat: 'white' });
  s.room.handle(alex, { t: 'sit', seat: 'black' });
  s.room.handle(host, { t: 'start' });
  assert.equal((await said(deps(s.room).d, alex.id)).status, 201);
  assert.ok(s.room.snapshotFor(host.id).chat.some((l) => l.kind === 'said'));
  assert.ok(!s.room.snapshotFor(vic.id).chat.some((l) => l.kind === 'said'), 'not yet for the watcher');
  s.advance(31_000);
  assert.ok(s.room.snapshotFor(vic.id).chat.some((l) => l.kind === 'said'));
});

test('the room rule: off by default, host only, refused when the server doesn’t allow it, announced', () => {
  assert.equal(DEFAULT_SETTINGS.transcripts, false);
  const s = setup({ transcripts: false });
  assert.throws(() => s.room.handle(alex, { t: 'settings', settings: { transcripts: true } }), /Only the host/);
  s.room.handle(host, { t: 'settings', settings: { transcripts: true } });
  assert.equal(s.rec.settings.transcripts, true);
  assert.match(s.stored.at(-1)!.text, /transcripts on/);
  assert.equal(s.room.snapshotFor(alex.id).room.transcriptsAllowed, true);
  s.room.handle(host, { t: 'settings', settings: { transcripts: false } });
  assert.match(s.stored.at(-1)!.text, /transcripts off/);

  s.flags.allowed = false;
  assert.throws(() => s.room.handle(host, { t: 'settings', settings: { transcripts: true } }), /switched off on this server/);
  assert.equal(s.room.snapshotFor(alex.id).room.transcriptsAllowed, false);
});

test('cleanTranscript and checkWav', () => {
  assert.equal(cleanTranscript(' Hello [inaudible] there (coughs) '), 'Hello there');
  assert.equal(cleanTranscript(42), null);
  assert.equal(cleanTranscript('a'.repeat(2000))!.length, 1000);
  const w = wav(1);
  w.writeUInt32LE(48_000, 24);
  assert.deepEqual(checkWav(w), { error: 'Send 16 kHz mono 16-bit PCM' });
});

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

test('transcriptsAllowed: needs WHISPER_URL, and TRANSCRIPTS=off turns it off', () => {
  delete process.env.WHISPER_URL; delete process.env.TRANSCRIPTS;
  assert.equal(transcriptsAllowed(), false);
  process.env.WHISPER_URL = 'http://whisper:8090';
  assert.equal(transcriptsAllowed(), true);
  process.env.TRANSCRIPTS = 'off';
  assert.equal(transcriptsAllowed(), false);
});
