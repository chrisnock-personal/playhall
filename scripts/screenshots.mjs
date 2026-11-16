// Screenshots of real games for the overview page (#31): each scene opens a
// room on a running Playhall, seats the players (people and computer
// players), plays to a telling moment through the real screens, and saves a
// 1280 x 950 picture. Test accounts are made for the run (Sam, Priya, Kai...);
// remove them afterwards (usernames start with "shot_").
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/screenshots.mjs https://host:8450 out-dir [scene ...]
// With no scenes named, every scene runs. Needs Playwright (npm i, then
// npx playwright install chromium).
import { chromium } from 'playwright';

const [base = 'https://localhost:8450', out = 'shots', ...only] = process.argv.slice(2);
const VIEW = { width: 1280, height: 950 };
const tag = Math.random().toString(36).slice(2, 6);
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, token) {
  const r = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path}: ${d.error}`);
  return d;
}
const accounts = {};
async function account(name) {
  accounts[name] ??= await api('/auth/register', { username: `shot_${name.toLowerCase()}${tag}`, password: 'screenshot-run-pw', displayName: name });
  return accounts[name];
}

let browser;
/** A page signed in as `name`, in the room. */
async function open(name, code, viewport = VIEW) {
  const u = await account(name);
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, colorScheme: 'dark' });
  await ctx.addInitScript((s) => localStorage.setItem('playhall.session', JSON.stringify(s)), { token: u.token, user: u.user });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await p.goto(`${base}/#/r/${code}`);
  await p.waitForSelector('.stage');
  await sleep(800);
  return p;
}
/** A room hosted by `host`, who sits in `seat`; returns the host's page. */
async function room(gameId, host = 'Sam', { seat = 'amber', config = {}, name = 'Games night' } = {}) {
  const u = await account(host);
  const { room } = await api('/rooms', { name, gameId, hostSeat: seat, listed: false, gameConfig: config }, u.token);
  const page = await open(host, room.code);
  return { code: room.code, page };
}
async function bots(p, n) {
  for (let i = 0; i < n; i++) { await p.getByRole('button', { name: 'Add a bot' }).first().click(); await sleep(350); }
}
async function start(p) { await p.getByRole('button', { name: 'Start the game' }).click(); await sleep(1500); }
async function shot(p, file) { await sleep(900); await p.screenshot({ path: `${out}/${file}` }); console.log('saved', file); }
/** Click the first visible, enabled match, if any. */
async function tap(locator) {
  if (await locator.count() && await locator.first().isEnabled()) { await locator.first().click(); return true; }
  return false;
}
/** Keep calling `step` until `done`, or the time runs out. */
async function until(p, done, step, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !(await done())) { if (!(await step())) await sleep(500); await sleep(250); }
}

const SCENES = {
  // Blackjack: Sam and two bots, Sam deciding on his cards in hand 2.
  async blackjack() {
    const { page: p } = await room('blackjack', 'Sam', { name: 'Blackjack club' });
    await bots(p, 2); await start(p);
    let hand2 = false;
    await until(p, async () => hand2 && (await p.getByRole('button', { name: 'Hit', exact: true }).count()) > 0, async () => {
      hand2 = hand2 || (await p.locator('.felt-top').innerText()).includes('Hand 2');
      if (await tap(p.getByRole('button', { name: 'Add 25' }))) return tap(p.getByRole('button', { name: /^Bet \d+/ }));
      if (await tap(p.getByRole('button', { name: /^Bet \d+/ }))) return true;
      if (!hand2) return tap(p.getByRole('button', { name: 'Stand', exact: true }));
      return false;
    });
    await shot(p, '18-blackjack.png');
  },
  // Texas Hold'em: Sam and five bots, after the flop.
  async holdem() {
    const { page: p } = await room('poker', 'Sam', { name: 'Poker night' });
    await bots(p, 5); await start(p);
    await until(p, async () => (await p.locator('.felt .playing-card[aria-label$="spades"], .felt .playing-card[aria-label$="hearts"], .felt .playing-card[aria-label$="clubs"], .felt .playing-card[aria-label$="diamonds"]').count()) >= 5
      && (await p.getByRole('button', { name: 'Fold', exact: true }).count()) > 0,
    async () => (await tap(p.getByRole('button', { name: 'Check', exact: true }))) || tap(p.getByRole('button', { name: /^Call \d+/ })));
    await shot(p, '20-holdem.png');
  },
  // Colour Clash: Sam and three bots, a few plays in, Sam to play.
  async colourclash() {
    const { page: p } = await room('colourclash', 'Sam', { name: 'Colour Clash' });
    await bots(p, 3); await start(p);
    let plays = 0;
    await until(p, async () => plays >= 3 && (await p.locator('.my-hand.to-move').count()) > 0, async () => {
      if (await tap(p.locator('.colour-pick .btn').first())) return true;
      const card = p.locator('.my-hand button.hand-card:not([disabled])');
      if (plays < 3 && await tap(card)) { plays++; return true; }
      if (plays < 3 && await tap(p.getByRole('button', { name: 'Draw a card' }))) { plays++; return true; }
      if (await tap(p.getByRole('button', { name: 'Keep it' }))) return true;
      return false;
    });
    await shot(p, '19-colour-clash.png');
  },

  // Four in a Row: Sam against a bot, a few discs in, Sam's next disc shown where it would land.
  async fourinarow() {
    const { page: p } = await room('fourinarow', 'Sam', { name: 'Four in a Row' });
    await bots(p, 1); await start(p);
    for (const col of [3, 2, 4, 3]) {
      await until(p, async () => (await p.locator('.four-column.playable').count()) > 0, async () => false, 15000);
      await p.locator('.four-column').nth(col).click(); await sleep(2600);
    }
    await until(p, async () => (await p.locator('.four-column.playable').count()) > 0, async () => false, 15000);
    await p.locator('.four-column').nth(5).hover();
    await shot(p, '05-four-in-a-row.png');
  },
  // Checkers: Sam (Black) against a bot, a few moves in, a piece picked up with its moves marked.
  async checkers() {
    const { page: p } = await room('checkers', 'Sam', { seat: 'black', name: 'Checkers' });
    await bots(p, 1); await start(p);
    for (let k = 0; k < 5; k++) {
      await until(p, async () => (await p.locator('.square-board .movable').count()) > 0, async () => false, 20000);
      await p.locator('.square-board .movable').last().click(); await sleep(300);
      await p.locator('.square-board .target').first().click(); await sleep(2600);
    }
    await until(p, async () => (await p.locator('.square-board .movable').count()) > 0, async () => false, 20000);
    await p.locator('.square-board .movable').last().click();
    await shot(p, '13-checkers.png');
  },
  // Snakes and Ladders: Sam and two bots, a few rolls in.
  async snakes() {
    const { page: p } = await room('snakes', 'Sam', { name: 'Snakes and Ladders' });
    await bots(p, 2); await start(p);
    for (let k = 0; k < 5; k++) {
      await until(p, async () => (await p.getByRole('button', { name: 'Roll', exact: true }).count()) > 0, async () => false, 20000);
      if (k < 4) { await p.getByRole('button', { name: 'Roll', exact: true }).click(); await sleep(2500); }
    }
    await shot(p, '14-snakes.png');
  },
  // Ludo: Sam and three bots, tokens out on the track.
  async ludo() {
    const { page: p } = await room('ludo', 'Sam', { name: 'Ludo' });
    await bots(p, 3); await start(p);
    let turns = 0;
    await until(p, async () => turns >= 10 && (await p.getByRole('button', { name: 'Roll', exact: true }).count()) > 0, async () => {
      if (await tap(p.locator('.ludo-token-btn'))) return true;
      if (await tap(p.getByRole('button', { name: 'Roll', exact: true }))) { turns++; return true; }
      return false;
    }, 240000);
    await shot(p, '15-ludo.png');
  },
  // Sea Battle: placing the fleet (a ship picked up, its shadow clashing), then firing.
  async seabattle() {
    const { page: p } = await room('seabattle', 'Sam', { name: 'Sea Battle' });
    await bots(p, 1); await start(p);
    await p.getByRole('button', { name: /^Battleship/ }).click(); await sleep(300);
    const squares = p.locator('.waters-board.placing .square-board button');
    // Hover a few squares until the shadow clashes with another ship.
    for (let i = 0; i < 100; i += 7) { await squares.nth(i).hover(); await sleep(60); if (await p.locator('.square-board .clash').count()) break; }
    await shot(p, '17-sea-battle-placing.png');
    await p.getByRole('button', { name: /^Battleship/ }).click();
    await p.getByRole('button', { name: 'Ready', exact: true }).click(); await sleep(1500);
    const enemy = p.locator('.waters').last().locator('.square-board button');
    for (let k = 0; k < 14; k++) {
      await until(p, async () => (await p.locator('.sea-layout').innerText()).includes('Your turn') || (await enemy.count()) > 0, async () => false, 8000);
      const n = await enemy.count(); if (!n) break;
      await enemy.nth(Math.floor(Math.random() * n)).click().catch(() => {}); await sleep(2200);
    }
    await shot(p, '16-sea-battle.png');
  },
};

browser = await chromium.launch();
for (const [name, scene] of Object.entries(SCENES)) {
  if (only.length && !only.includes(name)) continue;
  try { await scene(); } catch (e) { errors.push(`${name}: ${e.message}`); }
}
await browser.close();
console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no errors');
