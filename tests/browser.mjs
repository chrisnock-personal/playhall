// Browser test against a running server:
//   node tests/browser.mjs http://localhost:8450
// (CHROMIUM=/path/to/chrome to use a browser other than Playwright's own.)
//
// A host (account) and a guest (from the invite link) play a few moves on
// the real board, chat at the table, a watcher opens the room on a phone,
// the layout presets and room rules work, and the leaderboard and stats
// pages render. Fails on any page error.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = (process.argv[2] ?? 'http://localhost:8450').replace(/\/$/, '');
const out = process.env.SHOTS_DIR;

async function api(path, body, token) {
  const res = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}

const id = Math.random().toString(36).slice(2, 7);
const host = await api('/auth/register', { username: `br_${id}`, password: 'browser-test-pw', displayName: 'Sam' });
const { room } = await api('/rooms', { name: 'Browser test', gameId: 'chess', hostSeat: 'white', listed: false, gameConfig: { initialSeconds: 300, incrementSeconds: 3 } }, host.token);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errors = [];
async function open(session, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  if (session) await ctx.addInitScript((s) => localStorage.setItem('playhall.session', JSON.stringify(s)), session);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}
const shot = (page, name) => (out ? page.screenshot({ path: `${out}/${name}.png` }) : null);

// Click-to-move on chessground: squares from the board's bounding box.
async function move(page, from, to, flipped) {
  const b = await page.locator('.board cg-board').boundingBox();
  const s = b.width / 8;
  const at = (sq) => {
    let f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
    if (flipped) { f = 7 - f; r = 7 - r; }
    return { x: b.x + s * f + s / 2, y: b.y + b.height - s * r - s / 2 };
  };
  const a = at(from), c = at(to);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(c.x, c.y);
}

try {
  const hp = await open({ token: host.token, user: host.user });
  await hp.goto(`${base}/#/r/${room.code}`);
  await hp.waitForSelector('.board cg-board');

  // A guest arrives from the invite link.
  const gp = await open(null);
  await gp.goto(`${base}/#/r/${room.code}`);
  await gp.waitForSelector('.signin');
  await gp.fill('input[autocomplete="nickname"]', 'Alex');
  await gp.click('button.btn.primary.wide');
  await gp.waitForSelector('.board cg-board');
  await gp.click('.player-strip button:has-text("Sit here")');

  await hp.click('button:has-text("Start the game")');
  await gp.waitForSelector('.pill.playing');

  await move(hp, 'e2', 'e4', false);
  await gp.waitForSelector('.board square.last-move');
  await move(gp, 'e7', 'e5', true);
  await hp.waitForFunction(() => document.querySelectorAll('.clock.running').length > 0);
  await move(hp, 'g1', 'f3', false);

  await gp.fill('#msg-table', 'Knight already?');
  await gp.press('#msg-table', 'Enter');
  await hp.waitForSelector('.chat .msg-text:has-text("Knight already?")');

  await gp.click('.tabs [role=tab]:has-text("Moves")');
  await gp.waitForFunction(() => document.querySelectorAll('.moves li').length === 2);
  await shot(hp, 'room-host');

  // Layouts and room rules.
  await hp.click('.segmented.small button:has-text("Focus")');
  await hp.waitForSelector('.room-top-compact');
  await hp.waitForSelector('.side-panel.rail');
  await hp.click('[aria-label="Show the top bar"]');
  await hp.click('.segmented.small button:has-text("Default")');
  await hp.click('button:has-text("Room rules")');
  await hp.waitForSelector('dialog[open]');
  await hp.keyboard.press('Escape');

  // A watcher on a phone sees the board but can't move.
  const wp = await open(null, { width: 390, height: 844 });
  await wp.goto(`${base}/#/r/${room.code}`);
  await wp.fill('input[autocomplete="nickname"]', 'Priya');
  await wp.click('button.btn.primary.wide');
  await wp.waitForSelector('.board cg-board');
  assert.equal(await wp.locator('.pill.role-watch').count(), 1);
  await shot(wp, 'phone-watcher');

  // Resigning ends the game; guests' games don't count, and the card says so.
  await gp.click('button:has-text("Resign")');
  await gp.click('button:has-text("Yes, resign")');
  await hp.waitForSelector('.result-card:has-text("guest")');

  // A private room asks for its password, then lets you in.
  const priv = (await api('/rooms', { name: 'Private test', gameId: 'chess', listed: false, password: 'open sesame' }, host.token)).room;
  const xp = await open(null);
  await xp.goto(`${base}/#/r/${priv.code}`);
  await xp.fill('input[autocomplete="nickname"]', 'Kai');
  await xp.click('button.btn.primary.wide');
  await xp.waitForSelector('h1:has-text("This room is private")');
  await xp.fill('input[type=password]', 'wrong');
  await xp.click('button:has-text("Go in")');
  await xp.waitForSelector('.form-error');
  errors.splice(0, errors.length, ...errors.filter((e) => !/403/.test(e)));   // the browser logs the refused request
  await xp.fill('input[type=password]', 'open sesame');
  await xp.click('button:has-text("Go in")');
  await xp.waitForSelector('.board cg-board');

  // Leaderboard and stats pages.
  await hp.goto(`${base}/#/leaderboard`);
  await hp.waitForSelector('.board-page h1');
  await hp.goto(`${base}/#/stats`);
  await hp.waitForSelector('.stats-page h1');

  assert.deepEqual(errors, [], 'no errors in the browser');
  console.log('PASS: a game on the real board, chat, layouts, room rules, a phone watcher, the result card, a private room, leaderboards and stats');
} finally {
  await browser.close();
}
