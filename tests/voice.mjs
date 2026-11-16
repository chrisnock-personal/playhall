import { chromium } from 'playwright';
import WebSocket from 'ws';
// Two browsers with fake microphones join a room's voice at the table and
// check each hears the other (needs a server with LiveKit, --profile media).
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/voice.mjs https://host:8450
import assert from 'node:assert/strict';
const base = (process.argv[2] ?? 'https://localhost:8450').replace(/\/$/, '');
const api = async (path, body, token) => { const r = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(path + ' ' + d.error); return d; };
const id = Math.random().toString(36).slice(2, 7);
const a = await api('/auth/register', { username: `vtest_a${id}`, password: 'voice-test-password', displayName: 'Sam' });
const w = await api('/auth/guest', { displayName: 'Vic' });
const { room } = await api('/rooms', { name: 'Voice test', gameId: 'fourinarow', hostSeat: 'amber', listed: false, gameConfig: {} }, a.token);
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const open = async (s) => { const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true }); await c.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), s); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); await p.goto(`${base}/#/r/${room.code}`); await p.waitForSelector('.voice-dock'); return p; };
const hp = await open({ token: a.token, user: a.user });
const wp = await open({ token: w.token, user: w.user });
await hp.getByRole('button', { name: /Join voice: Table/ }).click();
await wp.getByRole('button', { name: 'Table', exact: true }).click();
for (const p of [hp, wp]) await p.waitForSelector('.voice-dock.on', { timeout: 20000 });
// Everyone joins muted; unmute to talk.
for (const p of [hp, wp]) { await p.waitForSelector('.voice-dock.on button[aria-label="Unmute your microphone"]'); await p.click('.voice-dock.on button[aria-label="Unmute your microphone"]'); }
for (const p of [hp, wp]) await p.waitForSelector('.voice-dock.on button[aria-label="Mute your microphone"]');
await hp.waitForFunction(() => document.querySelectorAll('.voice-av').length === 2, null, { timeout: 15000 });
// Each hears the other: a remote audio element, and the other's beep shows as talking.
const hears = async (p) => p.waitForFunction(async () => {
  const el = document.querySelector('audio[data-voice]');
  if (!el?.srcObject) return false;
  return !!document.querySelector('.voice-av.speaking:not(:has(*[data-you]))');
}, null, { timeout: 20000 }).then(() => true, () => false);
assert.ok(await hears(hp), 'the host hears the watcher');
assert.ok(await hears(wp), 'the watcher hears the host');
// Push to talk: hold Space to talk, let go to stop.
await hp.selectOption('.voice-mode', 'ptt');
const ptt = hp.locator('.voice-dock.on button.ptt');
await ptt.waitFor();
await hp.keyboard.down('Space');
await hp.waitForFunction(() => document.querySelector('.voice-dock.on button.ptt')?.getAttribute('aria-pressed') === 'true');
await hp.keyboard.up('Space');
await hp.waitForFunction(() => document.querySelector('.voice-dock.on button.ptt')?.getAttribute('aria-pressed') === 'false');
await hp.selectOption('.voice-mode', 'open');
// Volume for one person, only for you: the watcher silences the host.
await wp.locator('.voice-av:not([disabled])').first().click();
await wp.getByRole('button', { name: 'Silence for me' }).click();
await wp.waitForSelector('.voice-av.silenced');
assert.equal(await wp.evaluate(() => [...document.querySelectorAll('audio[data-voice]')].every((a) => a.volume === 0)), true, 'the host is silent for the watcher');
await wp.getByRole('button', { name: 'Hear them again' }).click();

// The game starts: the watcher at the table can now only listen (the server
// changes their LiveKit rights live), and the players can still talk.
assert.ok(await wp.locator('.voice-dock.on button[aria-label*="microphone"]').count(), 'before the game the watcher can talk at the table');
const pat = await api('/auth/guest', { displayName: 'Pat' });
const ws = (tok) => new Promise((res) => { const s = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?room=${room.code}`); s.on('open', () => { s.send(JSON.stringify({ t: 'hello', token: tok })); setTimeout(() => res(s), 300); }); });
const ps = await ws(pat.token); ps.send(JSON.stringify({ t: 'sit', seat: 'teal' }));
const hs = await ws(a.token); await new Promise((r) => setTimeout(r, 400)); hs.send(JSON.stringify({ t: 'start' }));
await wp.waitForSelector('.voice-dock.on .voice-listen', { timeout: 10000 });
assert.ok(await hp.locator('.voice-dock.on button[aria-label*="microphone"]').count(), 'the player can still talk');
ps.close(); hs.close();
assert.deepEqual(errors, [], 'no errors in the browser');
await b.close();
await fetch(`${base}/api/rooms/${room.code}`, { method: 'DELETE', headers: { authorization: `Bearer ${a.token}` } });
console.log('PASS: voice at the table, both ways');
