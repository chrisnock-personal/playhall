// End-to-end check against a running server:
//   node scripts/smoke.mjs http://host:8450
// Makes an account and two guests, opens a chess room, plays a short game
// over the WebSocket, checks who can read the gallery, then closes the room.
// With ADMIN_USERNAMES=smoke_admin on the server it also tests the platform
// settings (it changes them for a moment and puts them back).
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
  const ws = new WebSocket(`${wsBase}/ws?room=${code}`);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token })));
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
const alex = await api('/auth/register', { body: { username: `smoke_a_${id}`, password: 'smoke-test-pw', displayName: 'Alex' } });
const priya = await api('/auth/guest', { body: { displayName: 'Priya' } });
await assert.rejects(api('/rooms', { token: priya.token, body: { name: 'x', gameId: 'chess' } }), /Guests/);

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
// Wait on Priya's own connection: the refusal is sent only to her.
await p.until(() => p.errors.some((e) => /Watchers/.test(e)), 'table refused for watcher');
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

// The result was recorded and counted: Alex (Black) +3, the host +0.
const standings = await a.until((s) => s.lastResult, 'standings in the room');
assert.equal(standings.lastResult.counted, true);
assert.deepEqual(standings.lastResult.players.map((x) => [x.name, x.points]), [['Smoke Host', 0], ['Alex', 3]]);
assert.deepEqual(standings.lastResult.headToHead, { w: 0, d: 0, l: 1 });
const stats = await api(`/players/${alex.user.id}/stats?game=chess&period=all`, { token: host.token });
assert.deepEqual(stats.totals, { played: 1, w: 1, d: 0, l: 0, points: 3 });
assert.equal(stats.recent[0].reason, 'checkmate');
const board = await api('/leaderboard?game=chess&period=week', { token: host.token });
assert.ok(board.unranked.some((r) => r.userId === alex.user.id && r.points === 3), 'Alex listed as not ranked yet');

// Private rooms: no way in without the password; a pass works until the
// password changes; the host gets in without one.
const closedWith = (code, token, pass) => new Promise((resolve) => {
  const ws = new WebSocket(`${wsBase}/ws?room=${code}`);
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, ...(pass ? { pass } : {}) })));
  let snap = false;
  ws.on('message', (d) => { if (JSON.parse(String(d)).t === 'snapshot') { snap = true; ws.close(); } });
  ws.on('close', (c) => resolve(snap ? 'in' : c));
});
const priv = (await api('/rooms', { token: host.token, body: { name: `Private ${id}`, gameId: 'chess', listed: false, password: 'open sesame' } })).room;
assert.equal(priv.locked, true);
assert.equal(await closedWith(priv.code, priya.token), 4403);
await assert.rejects(api(`/rooms/${priv.code}/pass`, { token: priya.token, body: { password: 'wrong' } }), /403/);
const { pass } = await api(`/rooms/${priv.code}/pass`, { token: priya.token, body: { password: 'open sesame' } });
assert.equal(await closedWith(priv.code, priya.token, pass), 'in');
assert.equal(await closedWith(priv.code, host.token), 'in');
await api(`/rooms/${priv.code}/password`, { method: 'PUT', token: host.token, body: { password: 'new password' } });
assert.equal(await closedWith(priv.code, priya.token, pass), 4403, 'an old pass stops working');
await api(`/rooms/${priv.code}`, { method: 'DELETE', token: host.token });

// The session token in the URL (the old way) is ignored: no hello, no entry.
assert.equal(await new Promise((resolve) => {
  const ws = new WebSocket(`${wsBase}/ws?room=${room.code}&token=${encodeURIComponent(host.token)}`);
  ws.on('close', (c) => resolve(c));
}), 4401, 'a token in the URL is not accepted');

// Voice and video (only when the server has LiveKit): a token for a channel
// you may use, refused for one you may not, and LiveKit reached through /rtc.
const health = await (await fetch(`${base}/api/health`)).json();
if (health.media) {
  const t = await api(`/rooms/${room.code}/media/gallery`, { method: 'POST', token: priya.token });
  assert.equal(t.talk, true, 'a watcher talks in the gallery');
  const v = await fetch(`${base}/rtc/validate?access_token=${encodeURIComponent(t.token)}`);
  assert.equal(v.status, 200, `LiveKit accepts the token through /rtc (${v.status} ${await v.text()})`);
  const outsider = await api('/auth/guest', { body: { displayName: 'Robin' } });
  await assert.rejects(api(`/rooms/${room.code}/media/table`, { method: 'POST', token: outsider.token }), /403/, 'not in the room, no token');
  console.log('media: token and /rtc proxy OK');
}

// Letterworks: racks are private, a word off the list is refused with nothing
// changed, a real two-letter word from the rack scores.
const TWO = new Set('AA AB AD AE AG AH AI AL AM AN AR AS AT AW AX AY BA BE BI BO BY DE DO ED EF EH EL EM EN ER ES ET EX FA GO HA HE HI HM HO ID IF IN IS IT JO KA LA LI LO MA ME MI MM MO MU MY NA NE NO NU OD OE OF OH OM ON OP OR OS OW OX OY PA PE PI RE SH SI SO TA TI TO UH UM UN UP US UT WE WO XI XU YA YE YO'.split(' '));
const words = (await api('/rooms', { token: host.token, body: { name: `Words ${id}`, gameId: 'letterworks', listed: false, hostSeat: 'amber', gameConfig: {} } })).room;
const wh = await connect(words.code, host.token);
const wa = await connect(words.code, alex.token);
wa.send({ t: 'sit', seat: 'teal' });
await wh.until((s) => s.seats.filter((x) => x.userId).length === 2, 'two seated for Letterworks');
wh.send({ t: 'start' });
await wa.until((s) => s.game.status === 'playing' && s.game.view?.rack, 'Letterworks started');
await wh.until((s) => s.game.status === 'playing' && s.game.view?.rack, 'the host has a rack');
assert.equal(wa.snap.game.view.rack.length, 7);
let played = false;
let movesSoFar = 0;
for (let turn = 0; turn < 8 && !played; turn++) {
  // Both connections must have seen the last move before we ask whose turn it is.
  for (const c of [wh, wa]) await c.until((s) => s.game.view.moves.length >= movesSoFar, 'both players see the last move');
  const me = [wh, wa].find((c) => c.snap.game.view.turn === c.snap.you.seat);
  const rack = me.snap.game.view.rack.filter((l) => l !== '?');
  const pairs = rack.flatMap((x, i) => rack.filter((_, j) => j !== i).map((y) => x + y));
  const good = pairs.find((w) => TWO.has(w));
  const bad = pairs.find((w) => !TWO.has(w));
  if (bad && turn === 0) {
    const errs = me.errors.length;
    me.send({ t: 'act', action: { type: 'play', tiles: [{ cell: 112, letter: bad[0] }, { cell: 113, letter: bad[1] }] } });
    await me.until(() => me.errors.length > errs, 'a non-word refused');
    assert.match(me.errors.at(-1), /isn’t a word/);
  }
  const movesBefore = me.snap.game.view.moves.length;
  if (good) me.send({ t: 'act', action: { type: 'play', tiles: [{ cell: 112, letter: good[0] }, { cell: 113, letter: good[1] }] } });
  else me.send({ t: 'act', action: { type: 'exchange', letters: me.snap.game.view.rack } });
  const after = await me.until((s) => s.game.view.moves.length > movesBefore, 'a Letterworks move');
  movesSoFar = after.game.view.moves.length;
  played = !!good;
  if (good) { assert.ok(after.game.view.scores[me.snap.you.seat] > 0, 'the word scored'); assert.equal(after.game.view.rack.length, 7, 'drew back to seven'); }
}
assert.ok(played, 'a two-letter word was played');
await api(`/rooms/${words.code}`, { method: 'DELETE', token: host.token });
for (const c of [wh, wa]) c.ws.close();

// Platform settings (admins only). Runs only when the smoke admin is an
// admin: ADMIN_USERNAMES only names accounts that exist when the server starts
// (#63), so register smoke_admin (password smoke-admin-pw), start the server
// with ADMIN_USERNAMES=smoke_admin (CI does both), or set SMOKE_ADMIN to
// another name in ADMIN_USERNAMES.
const adminName = process.env.SMOKE_ADMIN ?? 'smoke_admin';
const adminPw = process.env.SMOKE_ADMIN_PASSWORD ?? 'smoke-admin-pw';
const admin = await api('/auth/register', { body: { username: adminName, password: adminPw, displayName: 'Smoke Admin' } })
  .catch((e) => (/409/.test(e.message) ? api('/auth/login', { body: { username: adminName, password: adminPw } }) : Promise.reject(e)));
let adminTested = false;
if ((await api('/auth/me', { token: admin.token })).user.admin) {
  await assert.rejects(api('/admin'), /401/, 'not signed in');
  await assert.rejects(api('/admin', { token: host.token }), /403/, 'not an admin');
  await assert.rejects(api('/admin', { token: priya.token }), /403/, 'a guest');
  assert.equal((await api('/auth/me', { token: host.token })).user.admin, false);
  const overview = await api('/admin', { token: admin.token });
  assert.ok(!/PRIVATE KEY/.test(JSON.stringify(overview)), 'never the private key');
  const original = overview.settings;
  const put = (body) => api('/admin/settings', { method: 'PUT', token: admin.token, body });
  try {
    await assert.rejects(put({ nope: true }), /400/);
    await assert.rejects(put({ roomDefaults: { moveSeconds: 7 } }), /400/);

    await put({ guestsAllowed: false, signupsAllowed: false });
    await assert.rejects(api('/auth/guest', { body: { displayName: 'Nope' } }), /403/, 'guests off');
    await assert.rejects(api('/auth/register', { body: { username: `smoke_n_${id}`, password: 'smoke-test-pw' } }), /403/, 'sign-ups off');
    assert.deepEqual(await api('/auth/options'), { allowSignup: false, allowGuests: false });
    await put({ guestsAllowed: true, signupsAllowed: true });
    await api('/auth/guest', { body: { displayName: 'Back' } });

    await put({ voiceVideoAllowed: false });
    assert.equal((await api('/health')).media, false, 'health says no voice');
    assert.equal((await api('/platform')).voiceVideo, false);
    await assert.rejects(api(`/rooms/${room.code}/media/gallery`, { method: 'POST', token: priya.token }), /503/, 'no voice tokens');
    await put({ voiceVideoAllowed: original.voiceVideoAllowed });

    await put({ roomDefaults: { moveSeconds: 30, watcherDelay: 15, ranked: false } });
    assert.deepEqual((await api('/platform')).roomDefaults, { moveSeconds: 30, watcherDelay: 15, ranked: false });
    const dflt = (await api('/rooms', { token: host.token, body: { name: `Defaults ${id}`, gameId: 'chess', listed: false } })).room;
    assert.equal(dflt.ranked, false, 'a new room is casual by default');
    const dc = await connect(dflt.code, host.token);
    const ds = await dc.until((x) => x.room, 'the defaults room');
    assert.equal(ds.room.settings.moveSeconds, 30);
    assert.equal(ds.room.settings.watcherDelay, 15);
    const chosen = (await api('/rooms', { token: host.token, body: { name: `Ranked ${id}`, gameId: 'chess', listed: false, ranked: true } })).room;
    assert.equal(chosen.ranked, true, 'the host can still choose');
    await api(`/rooms/${chosen.code}`, { method: 'DELETE', token: host.token });

    // Admins: make and remove; guests can't be; ADMIN_USERNAMES ones stay.
    const { users } = await api('/admin/users', { token: admin.token });
    const me = users.find((u) => u.username === adminName);
    assert.ok(me.admin && me.envAdmin);
    await api(`/admin/users/${alex.user.id}/admin`, { method: 'PUT', token: admin.token, body: { admin: true } });
    assert.equal((await api('/auth/me', { token: alex.token })).user.admin, true, 'admin without signing in again');
    await api('/admin', { token: alex.token });
    await api(`/admin/users/${alex.user.id}/admin`, { method: 'PUT', token: alex.token, body: { admin: false } });
    assert.equal((await api('/auth/me', { token: alex.token })).user.admin, false, 'stepped down');
    await assert.rejects(api(`/admin/users/${priya.user.id}/admin`, { method: 'PUT', token: admin.token, body: { admin: true } }), /400 Guests/);
    await assert.rejects(api(`/admin/users/${me.id}/admin`, { method: 'PUT', token: admin.token, body: { admin: false } }), /ADMIN_USERNAMES/);

    // Rooms: every open one is listed, and an admin can close any of them.
    const { rooms: open } = await api('/admin/rooms', { token: admin.token });
    assert.ok(open.some((r) => r.code === dflt.code), 'unlisted rooms too');
    const live = open.find((r) => r.code === dflt.code);
    assert.equal(live.present, 1);
    const closed = new Promise((r) => dc.ws.on('close', (code) => r(code)));
    await api(`/admin/rooms/${dflt.code}`, { method: 'DELETE', token: admin.token });
    assert.equal(await closed, 4411, 'everyone in it is told an admin closed it');
    await assert.rejects(api(`/rooms/${dflt.code}`, { token: host.token }), /404/);

    // The certificate: refused when TLS is off; a bad pair is refused (the
    // real one is left alone).
    if (!overview.tls) await assert.rejects(api('/admin/tls', { method: 'PUT', token: admin.token, body: { cert: 'x', key: 'y' } }), /409/);
    else {
      assert.match(overview.tls.fingerprint256, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      await assert.rejects(api('/admin/tls', { method: 'PUT', token: admin.token, body: { cert: 'not a cert', key: 'not a key' } }), /400 The certificate isn/);
    }
    adminTested = true;
  } finally {
    await put(original);
  }
  console.log('admin: platform settings, admins, rooms and the certificate OK');
} else console.log(`admin: skipped (${adminName} isn't an admin: start the server with ADMIN_USERNAMES=${adminName} to test the platform settings)`);

await api(`/rooms/${room.code}`, { method: 'DELETE', token: host.token });
await new Promise((r) => a.ws.on('close', (code) => { assert.equal(code, 4410); r(); }));
for (const c of [h, p]) c.ws.close();
console.log(`PASS: accounts, guests, seats, roles, chat visibility, a full game, results and stats, private rooms, Letterworks, ${adminTested ? 'platform settings, ' : ''}and closing the room`);
