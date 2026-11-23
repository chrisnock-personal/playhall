// Computer players in a room (#18): the host seats bots, the room plays their
// turns after a short pause, and games with a bot never count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, RoomError, type RoomHooks, type RoomRecord, type RoomUser } from './room';
import { DEFAULT_SETTINGS } from '../../shared/protocol';
import { BOTS, isBotId } from '../../shared/bots';
import type { ShipView } from '../../shared/games/ship2shore';

const host: RoomUser = { id: 'h', name: 'Sam', guest: false };
const alex: RoomUser = { id: 'a', name: 'Alex', guest: false };

function setup(gameId: string, ai?: { ask(system: string, user: string): Promise<string | null> }) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  const finished: { counted: boolean; note: string | null; players: Record<string, { bot?: boolean }> }[] = [];
  const lines: string[] = [];
  let seed = 11;
  const hooks: RoomHooks = {
    now: () => now,
    random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
    setTimer: (ms, fn) => { const t = { at: now + ms, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
    save: () => {},
    chat: (_id, l) => { lines.push(l.text); },
    gameOver: (g) => { finished.push(g); },
    changed: () => {},
    kick: () => {},
    ...(ai ? { aiAvailable: () => true, aiAsk: ai.ask } : {}),
  };
  const rec: RoomRecord = {
    id: 'r1', code: 'ABC123', name: 'Test', gameId, hostId: host.id, hostName: host.name,
    settings: { ...DEFAULT_SETTINGS, gameConfig: gameId === 'chess' ? { initialSeconds: 60, incrementSeconds: 0 } : {} },
    seats: {}, game: { status: 'idle', state: null, startedAt: null, players: null }, passwordHash: null, banned: [],
  };
  const room = new Room(rec, hooks);
  room.join(host); room.join(alex);
  const advance = (ms: number) => {
    now += ms;
    for (const t of [...timers]) if (t.live && t.at <= now) { t.live = false; t.fn(); }
  };
  return { room, rec, finished, lines, advance };
}

test('the host fills seats with bots; a whole Ship2Shore game plays out; it doesn’t count', () => {
  const { room, rec, finished, lines, advance } = setup('ship2shore');
  room.handle(host, { t: 'sit', seat: 'amber' });
  for (const seat of ['teal', 'violet', 'rose', 'lime']) room.handle(host, { t: 'addBot', seat });
  const snap = room.snapshotFor(host.id);
  const bots = snap.seats.filter((s) => s.bot);
  assert.equal(bots.length, 4);
  assert.deepEqual(bots.map((s) => s.name), ['Ada (bot)', 'Bram (bot)', 'Cleo (bot)', 'Dov (bot)']);
  assert.ok(bots.every((s) => isBotId(s.userId)));
  assert.ok(snap.members.filter((m) => m.bot).every((m) => m.online), 'bots show as here');
  assert.throws(() => room.handle(alex, { t: 'addBot', seat: 'blue' }), /Only the host/);
  assert.throws(() => room.handle(host, { t: 'addBot', seat: 'teal' }), /taken/);

  room.handle(host, { t: 'start' });
  assert.throws(() => room.handle(host, { t: 'addBot', seat: 'blue' }), /End the game first/);
  let moves = 0;
  for (let i = 0; i < 5000 && rec.game.status === 'playing'; i++) {
    const v = room.snapshotFor(host.id).game.view as ShipView;
    if (v.you?.toAct) {
      // The host plays too, here with the same strategy as the bots.
      room.handle(host, { t: 'act', action: BOTS.ship2shore(v, 'amber', Math.random) });
    } else {
      advance(2000);
      moves++;
    }
  }
  assert.equal(rec.game.status, 'over', 'the game ended');
  assert.ok(moves > 10, 'the bots played their turns');
  assert.equal(finished.length, 1);
  assert.equal(finished[0].counted, false);
  assert.match(finished[0].note ?? '', /computer player/);
  assert.ok(lines.some((l) => /The host added Ada \(bot\) as Teal/.test(l)));

  // After the game: no rematch vote waits on the bots; the host can remove one.
  room.handle(host, { t: 'unseat', userId: bots[0].userId! });
  assert.equal(room.snapshotFor(host.id).seats.find((s) => s.id === 'teal')?.userId, null);
  assert.ok(lines.some((l) => l === 'The host removed Ada (bot)'));
});

test('a bot whose answer is refused falls back to the out-of-time move', () => {
  const { room, rec, advance } = setup('ship2shore');
  // All five seats bots: the host just watches.
  for (const seat of ['amber', 'teal', 'violet', 'rose', 'lime']) room.handle(host, { t: 'addBot', seat });
  const real = BOTS.ship2shore;
  BOTS.ship2shore = () => ({ type: 'nonsense' });
  try {
    room.handle(host, { t: 'start' });
    const before = JSON.stringify(rec.game.state);
    for (let i = 0; i < 20; i++) advance(2000);
    assert.notEqual(JSON.stringify(rec.game.state), before, 'the game moved on regardless');
  } finally {
    BOTS.ship2shore = real;
  }
});

test('games without bots refuse them', () => {
  // The camera table (a real board game over a camera) is the one game without them.
  const { room } = setup('cameratable');
  assert.throws(() => room.handle(host, { t: 'addBot', seat: 'p2' }), (e: unknown) => e instanceof RoomError && /no computer players/.test(e.message));
});

const settle = () => new Promise((r) => setImmediate(r));

test('AI players: off unless the server has them; the model picks the social moves and talks; it falls back to the rule bot', async () => {
  // Without a model server, AI players aren't offered.
  const off = setup('ship2shore');
  assert.equal(off.room.snapshotFor(host.id).room.aiPlayers, false);
  assert.throws(() => off.room.handle(host, { t: 'addBot', seat: 'teal', ai: true }), /AI players aren/);

  // A stand-in model: always the first option, and something to say.
  const prompts: string[] = [];
  const { room, rec, lines, advance } = setup('ship2shore', { ask: async (_s, user) => { prompts.push(user); return '{"thought": "t", "choice": 1, "say": "Steady, crew."}'; } });
  assert.equal(room.snapshotFor(host.id).room.aiPlayers, true);
  for (const seat of ['amber', 'teal', 'violet', 'rose', 'lime']) room.handle(host, { t: 'addBot', seat, ai: seat === 'teal' || seat === 'rose' });
  const seats = room.snapshotFor(host.id).seats;
  assert.deepEqual(seats.filter((s) => s.ai).map((s) => s.name), ['Bram (AI)', 'Dov (AI)']);
  room.handle(host, { t: 'start' });
  for (let i = 0; i < 3000 && rec.game.status === 'playing'; i++) { advance(2000); await settle(); }
  assert.equal(rec.game.status, 'over', 'the game ended');
  assert.ok(prompts.length > 0, 'the model was asked');
  assert.ok(prompts.every((p) => !/Keep |Discard /.test(p.split('Options:')[1] ?? '')), 'course orders are left to the rule bot');
  assert.ok(lines.some((l) => l === 'Steady, crew.'), 'what the AI says goes in the table chat');

  // A model that never answers: the rule bot plays every move.
  const quiet = setup('ship2shore', { ask: async () => null });
  for (const seat of ['amber', 'teal', 'violet', 'rose', 'lime']) quiet.room.handle(host, { t: 'addBot', seat, ai: true });
  quiet.room.handle(host, { t: 'start' });
  for (let i = 0; i < 3000 && quiet.rec.game.status === 'playing'; i++) { quiet.advance(2000); await settle(); }
  assert.equal(quiet.rec.game.status, 'over', 'the game ended without the model');
});

test('bots and AI players answer when someone asks what orders they had', async () => {
  const { room, rec, lines, advance } = setup('ship2shore', { ask: async (system) => (/asked you something/.test(system) ? '{"say": "Two Navy orders, I swear."}' : '{"choice": 1}') });
  room.handle(host, { t: 'sit', seat: 'amber' });
  for (const seat of ['teal', 'violet', 'rose', 'lime']) room.handle(host, { t: 'addBot', seat, ai: seat === 'rose' });
  room.handle(host, { t: 'start' });
  const st = () => rec.game.state as { secrets: Record<string, { k: string }[]>; result: unknown };
  const bridged = (seat: string) => st().secrets[seat]?.some((x) => x.k === 'drew' || x.k === 'steered');
  // Play (the host as a bot too) until a bot and the AI player have both had orders in hand.
  for (let i = 0; i < 4000 && rec.game.status === 'playing' && !(['teal', 'violet', 'lime'].some(bridged) && bridged('rose')); i++) {
    const v = room.snapshotFor(host.id).game.view as ShipView;
    if (v.you?.toAct) room.handle(host, { t: 'act', action: BOTS.ship2shore(v, 'amber', Math.random) });
    else { advance(2000); await settle(); }
  }
  assert.equal(rec.game.status, 'playing', 'still sailing when the questions are asked');
  const names = Object.fromEntries(room.snapshotFor(host.id).seats.map((s) => [s.id, (s.name ?? '').replace(/ \((bot|AI)\)$/, '')]));
  const bot = ['teal', 'violet', 'lime'].find(bridged)!;
  const before = lines.length;
  room.handle(host, { t: 'chat', channel: 'table', text: `${names[bot]}, what orders did you have?` });
  room.handle(host, { t: 'chat', channel: 'table', text: `And ${names.rose}, what did you have?` });
  for (let i = 0; i < 40 && lines.slice(before).filter((l) => /order|U-boat|Navy|Lisbon/i.test(l)).length < 3; i++) { advance(3000); await settle(); }
  const after = lines.slice(before);
  assert.ok(after.some((l) => /(Navy|U-boat|Lisbon)/.test(l) && !/swear/.test(l) && !/what/.test(l)), `the bot answered: ${after.join(' | ')}`);
  assert.ok(after.includes('Two Navy orders, I swear.'), 'the AI player answered in its own words');
});
