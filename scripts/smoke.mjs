// End-to-end check against a running server:
//   node scripts/smoke.mjs http://host:8450
// Makes an account and two guests, opens a chess room, plays a short game
// over the WebSocket, checks who can read the gallery, then closes the room.
import WebSocket from 'ws';
import assert from 'node:assert/strict';

const base = (process.argv[2] ?? 'http://localhost:8450').replace(/\/$/, '');
const wsBase = base.replace(/^http/, 'ws');

async function api(path, { body, token, method } = {}) {
  const res = await fetch(base + '/api' + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${data?.error}`);
  return data;
}

function connect(code, token) {
  const ws = new WebSocket(`${wsBase}/ws?room=${code}&token=${encodeURIComponent(token)}`);
  const c = { ws, snap: null, errors: [], waiters: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'snapshot') c.snap = m.snapshot; else c.errors.push(m.message);
    c.waiters = c.waiters.filter((w) => !w());
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.until = (pred, label) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 5000);
    const check = () => { if (c.snap && pred(c.snap)) { clearTimeout(t); resolve(c.snap); return true; } return false; };
    if (!check()) c.waiters.push(check);
  });
  return new Promise((resolve, reject) => { ws.on('open', () => resolve(c)); ws.on('error', reject); });
}

const id = Math.random().toString(36).slice(2, 8);
const host = await api('/auth/register', { body: { username: `smoke_${id}`, password: 'smoke-test-pw', displayName: 'Smoke Host' } });
const alex = await api('/auth/guest', { body: { displayName: 'Alex' } });
const priya = await api('/auth/guest', { body: { displayName: 'Priya' } });
await assert.rejects(api('/rooms', { token: alex.token, body: { name: 'x', gameId: 'chess' } }), /Guests/);

const { room } = await api('/rooms', { token: host.token, body: { name: `Smoke ${id}`, gameId: 'chess', listed: false, hostSeat: 'white', gameConfig: { initialSeconds: 60, incrementSeconds: 0 } } });
console.log('room', room.code);

const h = await connect(room.code, host.token);
const a = await connect(room.code, alex.token);
const p = await connect(room.code, priya.token);
await h.until((s) => s.members.length >= 3, 'three members');

a.send({ t: 'sit', seat: 'black' });
await h.until((s) => s.seats.every((x) => x.userId), 'both seats filled');
a.send({ t: 'start' });
await a.until(() => a.errors.includes('Only the host can do that'), 'start refused for a guest');
h.send({ t: 'start' });
await p.until((s) => s.game.status === 'playing', 'game started');

p.send({ t: 'chat', channel: 'gallery', text: 'gallery secret' });
p.send({ t: 'chat', channel: 'table', text: 'should be refused' });
await p.until((s) => s.chat.some((l) => l.text === 'gallery secret'), 'gallery line');
await a.until(() => a.errors.some((e) => /Players can|Watchers can/.test(e)) || p.errors.some((e) => /Watchers/.test(e)), 'table refused for watcher');
assert.ok(!a.snap.chat.some((l) => l.text === 'gallery secret'), 'player must not see the gallery during play');

const moves = [[h, 'f2', 'f3'], [a, 'e7', 'e5'], [h, 'g2', 'g4'], [a, 'd8', 'h4']];
for (const [c, from, to] of moves) {
  const n = c.snap.game.view.san.length;
  c.send({ t: 'act', action: { type: 'move', from, to } });
  await p.until((s) => s.game.view.san.length === n + 1 || s.game.status === 'over', `move ${from}${to}`);
}
const end = await p.until((s) => s.game.status === 'over', 'game over');
assert.deepEqual(end.game.result, { winner: 'black', reason: 'checkmate' });
const after = await a.until((s) => s.chat.some((l) => l.text === 'gallery secret'), 'gallery visible after the game');
assert.ok(after.chat.some((l) => /won by checkmate/.test(l.text)));
assert.equal(p.errors.filter((e) => /Watchers/.test(e)).length, 1);

await api(`/rooms/${room.code}`, { method: 'DELETE', token: host.token });
await new Promise((r) => a.ws.on('close', (code) => { assert.equal(code, 4410); r(); }));
for (const c of [h, p]) c.ws.close();
console.log('PASS: accounts, guests, seats, roles, chat visibility, a full game and closing the room');
