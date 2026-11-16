import { chromium } from 'playwright';
// The camera table, end to end with fake cameras (needs a server with LiveKit, --profile media):
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/cameratable.mjs https://host:8450
// The host makes a camera table room ("Catan ..." for 3), a second browser
// with no account opens the host's table camera link (phone-sized) and starts
// the camera, and its picture plays on the stage for a player and a watcher
// who aren't in voice. Then: turns, a dice roll said in the chat, the score
// pad (yours only), the host enters the places and the other player confirms,
// so it counts, filed under the typed name; stopping the camera cuts it off.
import assert from 'node:assert/strict';
const base = (process.argv[2] ?? 'https://localhost:8450').replace(/\/$/, '');
const call = async (method, path, body, token) => {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = r.status === 204 ? {} : await r.json();
  return { ok: r.ok, status: r.status, d };
};
const api = async (path, body, token) => { const r = await call('POST', path, body, token); if (!r.ok) throw new Error(path + ' ' + r.d.error); return r.d; };
const get = async (path, token) => { const r = await call('GET', path, null, token); if (!r.ok) throw new Error(path + ' ' + r.d.error); return r.d; };
const id = Math.random().toString(36).slice(2, 7);
const gameName = `Catan ${id}`;
const sam = await api('/auth/register', { username: `ct_sam${id}`, password: 'camera-table-password', displayName: 'Sam' });
const kai = await api('/auth/register', { username: `ct_kai${id}`, password: 'camera-table-password', displayName: 'Kai' });
const vic = await api('/auth/guest', { displayName: 'Vic' });

const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watchErrors = (p) => { p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
const { room } = await api('/rooms', { name: 'Camera table test', gameId: 'cameratable', hostSeat: 'amber', listed: false, ranked: true, gameConfig: { name: gameName, seats: 3, playersScore: true } }, sam.token);
assert.equal(room.seats.length, 3, 'three seats, as picked');
assert.equal(room.configLabel, `${gameName} · 3 seats`);
// A camera table needs its game's name.
assert.equal((await call('POST', '/rooms', { name: 'x', gameId: 'cameratable', gameConfig: { name: '  ', seats: 2 } }, sam.token)).status, 400);

const open = async (s) => {
  const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
  await c.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), s);
  const p = await c.newPage();
  watchErrors(p);
  await p.goto(`${base}/#/r/${room.code}`);
  await p.waitForSelector('.ct');
  return p;
};
/** A <video> matching the selector is actually playing frames. */
const playing = (p, sel, timeout = 20000) => p.waitForFunction((s) => {
  const v = document.querySelector(s);
  return !!v && v.readyState >= 2 && v.videoWidth > 0 && !v.paused;
}, sel, { timeout }).then(() => true, () => false);
const gone = (p, sel, timeout = 15000) => p.waitForFunction((s) => !document.querySelector(s), sel, { timeout }).then(() => true, () => false);

const hp = await open({ token: sam.token, user: sam.user });
const kp = await open({ token: kai.token, user: kai.user });
const wp = await open({ token: vic.token, user: vic.user });
await kp.getByRole('button', { name: 'Sit here' }).first().click();
await kp.waitForSelector('.seat-card.mine');

// Only the host has the Table camera button, and only the host gets a link.
assert.equal(await kp.locator('.ct-camera-btn').count(), 0, 'players can’t make a table camera');
assert.equal((await call('POST', `/rooms/${room.code}/table-camera`, {}, kai.token)).status, 403);
await hp.locator('.ct-camera-btn').click();
await hp.waitForSelector('.ct-link .ct-qr');
const link = await hp.locator('.ct-link-url').inputValue();
assert.match(link, new RegExp(`/#/camera/${room.code}\\?k=`), 'a link to the camera page');
const key = decodeURIComponent(link.split('?k=')[1]);
// The key buys a camera-only token: it sends its camera to the table, hears and sees nothing.
const { token: camJwt } = await api('/camera/token', { key });
const grant = JSON.parse(Buffer.from(camJwt.split('.')[1], 'base64url').toString()).video;
assert.equal(grant.room, `${room.code}:table`);
assert.equal(grant.canSubscribe, false);
assert.deepEqual(grant.canPublishSources, ['camera']);
assert.equal((await call('POST', '/camera/token', { key: key.slice(0, -3) + 'abc' })).status, 403, 'a forged key is refused');
assert.equal((await call('GET', `/rooms/${room.code}`, null, key)).status, 401, 'the key isn’t a session');
await hp.locator('.ct-link').getByRole('button', { name: 'Close' }).click();

// The phone: no account, phone-sized, opens the link and taps Start.
const phoneCtx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
const phone = await phoneCtx.newPage();
watchErrors(phone);
await phone.goto(link);
await phone.getByRole('button', { name: 'Start the table camera' }).click();
await phone.waitForSelector('.cam-page.live', { timeout: 20000 });
assert.ok(await playing(phone, 'video.cam-preview'), 'the phone shows what it sends');
assert.equal(await phone.locator('video.cam-preview').evaluate((v) => getComputedStyle(v).transform), 'none', 'never mirrored');

// The board fills the stage for a player and a watcher, neither in voice.
assert.ok(await playing(kp, '.ct-camera video'), 'the player sees the table camera');
assert.ok(await playing(wp, '.ct-camera video'), 'the watcher sees the table camera');
assert.ok(await playing(hp, '.ct-camera video'), 'the host sees it too');
assert.equal(await kp.locator('.ct-camera video.mirror').count(), 0);
const size = await kp.locator('.ct-camera').boundingBox();
assert.ok(size && size.width > 500, 'it fills most of the stage');

// Start: Sam (amber) goes first; Next turn passes to Kai.
await hp.getByRole('button', { name: 'Start the game' }).click();
await hp.waitForSelector('.ct-turn.mine');
await kp.waitForSelector('.ct-turn:not(.mine)');
assert.equal(await kp.getByRole('button', { name: 'Next turn' }).count(), 0, 'not your turn: no Next turn');
await hp.getByRole('button', { name: 'Next turn' }).click();
await kp.waitForSelector('.ct-turn.mine');

// Dice: Kai rolls 2d6 (the default); everyone sees it, and it's in the table chat.
await kp.getByRole('button', { name: 'Roll 2d6' }).click();
await wp.waitForSelector('.ct-roll');
await wp.getByRole('tab', { name: /^Table/ }).click();
await wp.locator('li.sys', { hasText: /^Kai rolled \d \+ \d = \d+ \(2d6\)$/ }).first().waitFor({ timeout: 10000 });
// A d20 too, built from the picker.
await kp.getByRole('button', { name: 'Clear' }).click();
await kp.getByRole('button', { name: 'Add a d20' }).click();
await kp.getByRole('button', { name: 'Roll d20' }).click();
await hp.locator('li.sys', { hasText: /^Kai rolled \d+ \(d20\)$/ }).first().waitFor({ timeout: 10000 });
assert.equal(await wp.getByRole('button', { name: /^Roll/ }).count(), 0, 'watchers can’t roll');

// Score pad: Kai changes their own score; it shows for everyone; not Sam's.
await kp.getByRole('button', { name: 'Add one to Kai' }).click();
await kp.getByRole('button', { name: 'Add one to Kai' }).click();
await hp.waitForFunction(() => document.querySelector('input[aria-label="Kai’s score"]')?.value === '2');
assert.equal(await kp.locator('input[aria-label="Sam’s score"]').count(), 0, 'players edit only their own score');
await hp.locator('input[aria-label="Sam’s score"]').fill('1');
await hp.locator('input[aria-label="Sam’s score"]').press('Enter');
await wp.waitForFunction(() => [...document.querySelectorAll('.ct-scores tr')].some((r) => r.textContent?.includes('Sam') && r.textContent.includes('1')));

// The result: the host enters places (from the scores: Kai 1st), Sam is confirmed by proposing it.
await hp.getByRole('button', { name: 'Enter the result' }).click();
assert.equal(await hp.locator('select[aria-label="Kai’s place"]').inputValue(), '1', 'places start from the score pad');
await hp.getByRole('button', { name: 'Ask everyone to confirm' }).click();
await kp.getByRole('button', { name: 'Confirm' }).waitFor();
assert.equal(await wp.locator('.ct-result .ct-ok').count(), 1, 'everyone sees who has confirmed (the host)');
assert.equal(await wp.getByRole('button', { name: 'Confirm' }).count(), 0, 'watchers don’t confirm');
// Kai disputes first: it goes back to the host...
await kp.getByRole('button', { name: 'Dispute' }).click();
await hp.getByRole('button', { name: 'Change the places and ask again' }).click();
await hp.getByRole('button', { name: 'Ask everyone to confirm' }).click();
// ...who asks again, and Kai confirms: it counts.
await kp.getByRole('button', { name: 'Confirm' }).click();
await kp.waitForSelector('.result-card');
assert.match(await kp.locator('.result-card h2').innerText(), /Kai wins by the agreed result/);

// Filed under the typed name, case-insensitively.
await new Promise((r) => setTimeout(r, 1000));
const names = await get('/leaderboard/names?game=cameratable', sam.token);
const entry = names.names.find((n) => n.key === gameName.toLowerCase());
assert.ok(entry, 'a leaderboard tab for the name');
assert.equal(entry.name, gameName);
const board = await get(`/leaderboard?game=cameratable&period=all&name=${encodeURIComponent(gameName.toUpperCase())}`, sam.token);
const rows = [...board.ranked, ...board.unranked];
assert.equal(rows.find((r) => r.userId === kai.user.id)?.points, 3);
assert.equal(rows.find((r) => r.userId === sam.user.id)?.points, 0);
const other = await get('/leaderboard?game=cameratable&period=all&name=Some%20other%20game', sam.token);
assert.equal([...other.ranked, ...other.unranked].length, 0, 'other names have their own board');

// The host stops the table camera: the device is cut off and its link stops working.
assert.equal((await call('DELETE', `/rooms/${room.code}/table-camera`, null, sam.token)).status, 204);
await phone.waitForSelector('.cam-page:not(.live)', { timeout: 15000 });
assert.ok(await gone(kp, '.ct-camera video'), 'the board is gone from the stage');
assert.equal((await call('POST', '/camera/token', { key })).status, 403, 'the old link no longer works');

await b.close();
// The phone's disconnect is logged by LiveKit as an error; nothing else should be.
const unexpected = errors.filter((e) => !/livekit|websocket|disconnect|signal/i.test(e));
assert.deepEqual(unexpected, [], 'no errors in the browser');
await fetch(`${base}/api/rooms/${room.code}`, { method: 'DELETE', headers: { authorization: `Bearer ${sam.token}` } });
console.log('PASS: camera table: the phone as table camera for a player and a watcher, turns, dice, score pad, an agreed result filed by name');
