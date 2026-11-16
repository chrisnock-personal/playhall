import { chromium } from 'playwright';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Transcripts end to end: a player with a fake microphone (Chromium plays
// tests/fixtures/said.wav as the mic, on a loop) talks at the table of a room
// with transcripts on; their words appear as a said line in the table chat
// for them and for a watcher. Then: nothing is sent while muted, or once the
// host turns transcripts off.
// Needs a server with LiveKit (--profile media) and WHISPER_URL set:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node tests/transcripts.mjs https://host:8450
// The fixture is espeak-ng saying "Your move. I think the knight should go to
// the corner." (1 s of silence before, 2.5 s after; 16 kHz mono).
const base = (process.argv[2] ?? 'https://localhost:8450').replace(/\/$/, '');
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'said.wav');
const api = async (p, body, token) => { const r = await fetch(`${base}/api${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(p + ' ' + d.error); return d; };

const health = await (await fetch(`${base}/api/health`)).json();
if (!health.media) throw new Error('This server has no voice (LiveKit isn’t set up)');
if (!health.transcripts) throw new Error('This server doesn’t allow transcripts (set WHISPER_URL, and TRANSCRIPTS not off)');

const id = Math.random().toString(36).slice(2, 7);
const a = await api('/auth/register', { username: `ttest_a${id}`, password: 'transcript-test-password', displayName: 'Sam' });
const w = await api('/auth/guest', { displayName: 'Vic' });
const { room } = await api('/rooms', { name: 'Transcript test', gameId: 'fourinarow', hostSeat: 'amber', listed: false, gameConfig: {} }, a.token);

// The host turns transcripts on over the room socket.
const hostWs = await new Promise((res, rej) => {
  const s = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?room=${room.code}`, { rejectUnauthorized: false });
  s.on('open', () => { s.send(JSON.stringify({ t: 'hello', token: a.token })); setTimeout(() => res(s), 300); });
  s.on('error', rej);
});
const lastSnap = { v: null };
hostWs.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'snapshot') lastSnap.v = m.snapshot; if (m.t === 'error') console.error('server:', m.message); });
const setRule = async (on) => {
  hostWs.send(JSON.stringify({ t: 'settings', settings: { transcripts: on } }));
  const until = Date.now() + 5000;
  while (lastSnap.v?.room.settings.transcripts !== on) { if (Date.now() > until) throw new Error('the rule didn’t change'); await new Promise((r) => setTimeout(r, 100)); }
};
await setRule(true);

const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fixture}`, '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const posts = [];
const open = async (s, who) => {
  const c = await b.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
  await c.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), s);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', (r) => { if (r.method() === 'POST' && /\/said\//.test(r.url())) posts.push({ who, at: Date.now() }); });
  await p.goto(`${base}/#/r/${room.code}`);
  await p.waitForSelector('.voice-dock');
  return p;
};
const hp = await open({ token: a.token, user: a.user }, 'host');
const wp = await open({ token: w.token, user: w.user }, 'watcher');

// Everyone is told before joining voice, and again once in it.
await hp.waitForSelector('.transcript-notice:has-text("Transcripts are on")');
await hp.getByRole('button', { name: /Join voice: Table/ }).click();
await hp.waitForSelector('.voice-dock.on', { timeout: 20000 });
await hp.waitForSelector('.transcript-notice:has-text("Transcribing: what you say appears in the chat")');
// Joined muted: nothing is sent yet.
await hp.waitForTimeout(3000);
assert.equal(posts.length, 0, 'nothing sent while muted');

await hp.click('.voice-dock.on button[aria-label="Unmute your microphone"]');
const said = (p) => p.waitForSelector('ol.chat li.msg.said', { timeout: 45000 }).then((el) => el.textContent());
const text = await said(hp);
console.log('said line:', text);
assert.match(text, /knight|move|corner/i, 'the words came through');
assert.match(text, /said/);
await wp.getByRole('tab', { name: 'Table' }).click();
assert.match(await said(wp), /knight|move|corner/i, 'the watcher reads it at the table');

// Muted again: no more audio leaves the browser (one utterance may be in flight).
await hp.click('.voice-dock.on button[aria-label="Mute your microphone"]');
await hp.waitForTimeout(1500);
const atMute = posts.length;
await hp.waitForTimeout(9000);
assert.equal(posts.length, atMute, 'nothing sent while muted');

// The host turns transcripts off: the notice goes, and nothing is sent even unmuted.
await setRule(false);
await hp.waitForSelector('.transcript-notice', { state: 'detached' });
await hp.click('.voice-dock.on button[aria-label="Unmute your microphone"]');
const atOff = posts.length;
await hp.waitForTimeout(9000);
assert.equal(posts.length, atOff, 'nothing sent with transcripts off');

hostWs.close();
assert.deepEqual(errors.filter((e) => !/said\/table.*(403|503)/.test(e)), [], 'no errors in the browser');
await b.close();
await fetch(`${base}/api/rooms/${room.code}`, { method: 'DELETE', headers: { authorization: `Bearer ${a.token}` } });
console.log(`PASS: transcripts (${posts.length} utterance${posts.length === 1 ? '' : 's'} sent)`);
