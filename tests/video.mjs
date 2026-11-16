import { chromium } from 'playwright';
import WebSocket from 'ws';
// Video in rooms, with fake cameras (needs a server with LiveKit, --profile media):
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/video.mjs https://host:8450
// A player turns the camera on and the other player sees it playing on that
// seat card (and a watcher in the gallery sees it too); a watcher can't send
// video until the host allows it, then shows in the gallery strip; turning the
// rule off stops it; with a watcher delay, watchers lose the table video.
import assert from 'node:assert/strict';
const base = (process.argv[2] ?? 'https://localhost:8450').replace(/\/$/, '');
const api = async (path, body, token) => { const r = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(path + ' ' + d.error); return d; };
const grant = async (code, channel, token) => { const { token: jwt } = await api(`/rooms/${code}/media/${channel}`, {}, token); return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).video; };
const id = Math.random().toString(36).slice(2, 7);
const a = await api('/auth/register', { username: `vidtest_a${id}`, password: 'video-test-password', displayName: 'Sam' });
const pat = await api('/auth/guest', { displayName: 'Pat' });
const vic = await api('/auth/guest', { displayName: 'Vic' });
const { room } = await api('/rooms', { name: 'Video test', gameId: 'fourinarow', hostSeat: 'amber', listed: false, gameConfig: {} }, a.token);
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const open = async (s) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true }); await c.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), s); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); await p.goto(`${base}/#/r/${room.code}`); await p.waitForSelector('.voice-dock'); return p; };
/** A <video> matching the selector is actually playing frames. */
const playing = (p, sel, timeout = 20000) => p.waitForFunction((s) => {
  const v = document.querySelector(s);
  return !!v && v.readyState >= 2 && v.videoWidth > 0 && !v.paused;
}, sel, { timeout }).then(() => true, () => false);
const gone = (p, sel, timeout = 15000) => p.waitForFunction((s) => !document.querySelector(s), sel, { timeout }).then(() => true, () => false);
const camOn = 'button[aria-label="Turn your camera on"]';
const camOff = 'button[aria-label="Turn your camera off"]';

const hp = await open({ token: a.token, user: a.user });
const pp = await open({ token: pat.token, user: pat.user });
const wp = await open({ token: vic.token, user: vic.user });
// Pat takes the other seat; Sam (the host) is already in amber.
await pp.getByRole('button', { name: 'Sit here' }).first().click();
await pp.waitForSelector('.seat-card.mine');

// Players join voice at the table; the watcher in the gallery.
await hp.getByRole('button', { name: /Join voice: Table/ }).click();
await pp.getByRole('button', { name: /Join voice: Table/ }).click();
await wp.getByRole('button', { name: /Join voice: Gallery/ }).click();
for (const p of [hp, pp, wp]) await p.waitForSelector('.voice-dock.on', { timeout: 20000 });

// Cameras start off: no video anywhere.
assert.equal(await hp.locator('.seat-card video').count(), 0, 'cameras are off until switched on');
// Players may send video at the table; the watcher may not (rule off).
await hp.waitForSelector(camOn);
assert.equal(await wp.locator(camOn).count(), 0, 'no camera button for a watcher by default');
assert.deepEqual((await grant(room.code, 'gallery', vic.token)).canPublishSources, ['microphone'], 'the watcher’s token allows the microphone only');
assert.deepEqual((await grant(room.code, 'table', pat.token)).canPublishSources, ['microphone', 'camera'], 'a player’s token allows the camera at the table');

// The host turns the camera on: an indicator, their own tile mirrored...
await hp.click(camOn);
await hp.waitForSelector('.voice-dock .cam-live', { timeout: 15000 });
assert.ok(await playing(hp, '.seat-card.mine video.mirror'), 'your own tile shows your camera, mirrored');
// ...and the other player sees it playing on the host's seat card (not mirrored).
assert.ok(await playing(pp, '.seat-card[data-seat="amber"] video:not(.mirror)'), 'the other player sees the host’s camera on the seat card');
assert.equal(await pp.locator('.seat-card[data-seat="teal"] video').count(), 0, 'Pat’s own camera is still off');
// The watcher in the gallery sees the players' cameras too (a video-only view of the table).
assert.ok(await playing(wp, '.seat-card[data-seat="amber"] video'), 'the watcher sees the host’s camera');

// The host allows watcher video: the watcher's camera button appears (LiveKit rights change live).
const ws = (tok) => new Promise((res) => { const s = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?room=${room.code}`); s.on('open', () => { s.send(JSON.stringify({ t: 'hello', token: tok })); setTimeout(() => res(s), 300); }); });
const hs = await ws(a.token);
hs.send(JSON.stringify({ t: 'settings', settings: { watcherVideo: true } }));
await wp.waitForSelector(camOn, { timeout: 15000 });
assert.deepEqual((await grant(room.code, 'gallery', vic.token)).canPublishSources, ['microphone', 'camera']);
await wp.click(camOn);
await wp.waitForSelector('.voice-dock .cam-live', { timeout: 15000 });
// Pat (a player, the gallery isn't hidden between games) sees it in the full gallery strip (Social layout).
await pp.getByRole('button', { name: 'Social', exact: true }).click();
assert.ok(await playing(pp, `.gallery-tile[data-user="${vic.user.id}"] video`), 'a player sees the watcher’s camera in the gallery strip');
assert.ok(await playing(wp, `.gallery-tile[data-user="${vic.user.id}"] video.mirror`), 'the watcher sees their own tile, mirrored');

// The host turns the rule off: the watcher's camera stops for everyone.
hs.send(JSON.stringify({ t: 'settings', settings: { watcherVideo: false } }));
assert.ok(await gone(wp, '.voice-dock .cam-live'), 'the watcher’s camera is turned off');
assert.equal(await wp.locator(camOn).count(), 0, 'and the button is gone');
assert.ok(await gone(pp, `.gallery-tile[data-user="${vic.user.id}"] video`), 'players no longer see it');

// A watcher delay: during play, watchers lose the table's video; players keep it.
hs.send(JSON.stringify({ t: 'settings', settings: { watcherDelay: 15 } }));
await new Promise((r) => setTimeout(r, 400));
hs.send(JSON.stringify({ t: 'start' }));
assert.ok(await gone(wp, '.seat-card video'), 'delayed watchers don’t see the players live');
assert.ok(await playing(pp, '.seat-card[data-seat="amber"] video'), 'players still see each other');

// The host turns the camera off again.
await hp.click(camOff);
assert.ok(await gone(pp, '.seat-card[data-seat="amber"] video'), 'turning the camera off clears the tile');
hs.close();
assert.deepEqual(errors, [], 'no errors in the browser');
await b.close();
await fetch(`${base}/api/rooms/${room.code}`, { method: 'DELETE', headers: { authorization: `Bearer ${a.token}` } });
console.log('PASS: video on seat cards and in the gallery, with the host’s rule and the delay rule');
