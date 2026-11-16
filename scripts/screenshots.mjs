// Screenshots of real games for the overview page (#31): each scene opens a
// room on a running Playhall, seats the players (people and computer
// players), plays to a telling moment through the real screens, and saves a
// 1280 x 950 picture. Test accounts are made for the run (Sam, Priya, Kai...);
// remove them afterwards (usernames start with "shot_").
//   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/screenshots.mjs https://host:8450 out-dir [scene ...]
// With no scenes named, every scene runs. Needs Playwright (npm i, then
// npx playwright install chromium).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

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

  // The room itself: chess between two people, three watching (Kai asking for
  // a seat), with the players panel and the chat opened out; Priya's view from
  // the gallery; the Focus layout; and the room on a phone.
  async room() {
    const { code, page: sam } = await room('chess', 'Sam', { seat: 'white', name: 'Thursday chess', config: { initialSeconds: 0, incrementSeconds: 0 } });
    const alex = await open('Alex', code);
    await alex.getByRole('button', { name: 'Sit here' }).first().click(); await sleep(500);
    const priya = await open('Priya', code), kai = await open('Kai', code), lee = await open('Lee', code);
    await start(sam);
    const move = async (p, from, to, flipped) => {
      const b = await p.locator('.board cg-board').boundingBox();
      const sq = b.width / 8;
      const at = (x) => { let f = x.charCodeAt(0) - 97, r = Number(x[1]) - 1; if (flipped) { f = 7 - f; r = 7 - r; } return { x: b.x + sq * f + sq / 2, y: b.y + b.height - sq * r - sq / 2 }; };
      const a = at(from), c = at(to);
      await p.mouse.click(a.x, a.y); await p.mouse.click(c.x, c.y); await sleep(900);
    };
    for (const [p, f, t, fl] of [[sam, 'e2', 'e4'], [alex, 'e7', 'e5', true], [sam, 'g1', 'f3'], [alex, 'b8', 'c6', true], [sam, 'f1', 'b5'], [alex, 'a7', 'a6', true]]) await move(p, f, t, fl);
    const say = async (p, text, channel = 'table') => {
      const label = channel === 'table' ? 'Table' : 'Gallery';
      if (!(await p.locator(`#msg-${channel}`).count())) await tap(p.locator(`.rail-btn[title="${label}"]`));
      if (!(await p.locator(`#msg-${channel}`).count())) await tap(p.locator('.tabs [role=tab]', { hasText: label }));
      await p.locator(`#msg-${channel}`).fill(text); await p.locator(`#msg-${channel}`).press('Enter'); await sleep(400);
    };
    await say(alex, 'Ruy Lopez? Bold.');
    await say(sam, 'Only opening I know properly');
    await kai.getByRole('button', { name: 'Ask for a seat' }).click(); await sleep(400);
    await priya.locator('.rail-btn[title="Gallery"]').click().catch(() => {});
    await say(priya, 'He always plays this', 'gallery');
    await say(lee, 'Alex will take the bishop, watch', 'gallery');
    // Sam's view, panels open: the players in full and the table chat.
    await sam.getByRole('button', { name: 'Show the players panel in full' }).click().catch(() => {});
    await sam.locator('.rail-btn[title="Table"]').click().catch(() => {});
    await shot(sam, '01-hero.png');
    // Priya, watching, in the Social layout with the gallery chat.
    await priya.locator('.segmented.small button', { hasText: 'Social' }).click(); await sleep(400);
    await priya.locator('.tabs [role=tab]', { hasText: 'Gallery' }).click().catch(() => {});
    await shot(priya, '03-watching.png');
    // Alex in the Focus layout.
    await alex.locator('.segmented.small button', { hasText: 'Focus' }).click(); await sleep(400);
    await shot(alex, '06-focus.png');
    // Kai on a phone.
    const phone = await open('Kai', code, { width: 390, height: 844 });
    await sleep(800); await phone.screenshot({ path: `${out}/07-phone.png`, fullPage: true }); console.log('saved 07-phone.png');
  },

  // Realm Duel: Sam against a bot, a couple of rounds in, choosing again.
  async realmduel() {
    const { page: p } = await room('realmduel', 'Sam', { name: 'Realm Duel' });
    await bots(p, 1); await start(p);
    for (let k = 0; k < 3; k++) {
      await until(p, async () => (await p.locator('button.rd-pick:not([disabled])').count()) > 0, async () => false, 20000);
      if (k === 2) {
        await p.locator('button.rd-pick:not([disabled])').first().click();
        await p.getByRole('button', { name: /^Magic/ }).click().catch(() => {});
        break;
      }
      await p.locator('button.rd-pick:not([disabled])').first().click();
      await p.getByRole('button', { name: /^Melee/ }).click();
      await p.getByRole('button', { name: 'Lock in' }).click(); await sleep(3500);
    }
    await shot(p, '25-realm-duel.png');
  },
  // Manor Mystery: three people (it has no bots yet); Priya's view at the start.
  async manormystery() {
    const { code, page: sam } = await room('manormystery', 'Sam', { name: 'Murder at Blackthorn Hall' });
    const priya = await open('Priya', code), kai = await open('Kai', code);
    await priya.getByRole('button', { name: 'Sit here' }).first().click(); await sleep(400);
    await kai.getByRole('button', { name: 'Sit here' }).first().click(); await sleep(400);
    await start(sam); await sleep(1500);
    await shot(priya, '26-manor-mystery.png');
  },

  // Letterworks: Sam and Priya; Sam lays the longest word in his rack across
  // the centre (found in the game's own word list), Priya passes.
  async letterworks() {
    const { code, page: sam } = await room('letterworks', 'Sam', { name: 'Word night' });
    const priya = await open('Priya', code);
    await priya.getByRole('button', { name: 'Sit here' }).first().click(); await sleep(400);
    await start(sam); await sleep(800);
    const words = readFileSync(new URL('../data/enable1.txt', import.meta.url), 'utf8').split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter((w) => w.length >= 2 && w.length <= 7);
    const turnOf = async () => ((await sam.locator('.lw-rack button').count()) && (await sam.getByRole('button', { name: 'Pass' }).count()) ? sam : priya);
    const lay = async (p) => {
      const labels = await p.locator('.lw-rack button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? ''));
      const rack = labels.map((l) => (l.startsWith('Blank') ? '?' : l[0]));
      const fits = (w) => { const left = [...rack]; for (const ch of w) { const i = left.indexOf(ch); if (i < 0) return false; left.splice(i, 1); } return true; };
      const word = words.filter(fits).sort((x, y) => y.length - x.length)[0];
      if (!word) return false;
      const start = 8 - Math.floor(word.length / 2);
      for (let k = 0; k < word.length; k++) {
        // Laid tiles leave the rack, so look the letter up in the rack as it is now.
        await p.locator('.lw-rack button', { has: p.locator(':scope') }).filter({ hasText: new RegExp(`^${word[k]}`) }).first().click()
          .catch(() => p.locator(`.lw-rack button[aria-label^="${word[k]},"]`).first().click());
        await p.getByRole('button', { name: new RegExp(`^Row 8, column ${start + k}(:|$)`) }).click(); await sleep(150);
      }
      await p.getByRole('button', { name: /^Play/ }).click(); await sleep(1500);
      return word;
    };
    const first = await turnOf();
    const word = await lay(first);
    console.log('laid', word);
    const other = first === sam ? priya : sam;
    await other.getByRole('button', { name: 'Pass' }).click(); await sleep(1500);
    await shot(first, '23-letterworks.png');
  },

  // The pages around the games: the lobby (dark and light), a finished game's
  // result card and its replay, the rules tab, the Room rules dialog, a
  // private room's prompt, a player's stats, and Settings.
  async pages() {
    // The lobby, as Sam sees it (the demo rooms, if loaded, fill it).
    const lobby = async (scheme, file) => {
      const u = await account('Sam');
      const ctx = await browser.newContext({ viewport: VIEW, ignoreHTTPSErrors: true, colorScheme: scheme });
      await ctx.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), { token: u.token, user: u.user });
      const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(`lobby: ${e}`));
      await p.goto(`${base}/#/`); await sleep(1500);
      await shot(p, file);
      return p;
    };
    await lobby('dark', '02-lobby.png');
    await lobby('light', '22-light-lobby.png');

    // Priya mates Lee in four (with Kai watching), then the result and the replay.
    const { code, page: priya } = await room('chess', 'Priya', { seat: 'white', name: 'Quick chess', config: { initialSeconds: 300, incrementSeconds: 3 } });
    const lee = await open('Lee', code);
    await lee.getByRole('button', { name: 'Sit here' }).first().click(); await sleep(500);
    const kai = await open('Kai', code);
    await start(priya);
    const move = async (p, from, to, flipped) => {
      const b = await p.locator('.board cg-board').boundingBox();
      const sq = b.width / 8;
      const at = (x) => { let f = x.charCodeAt(0) - 97, r = Number(x[1]) - 1; if (flipped) { f = 7 - f; r = 7 - r; } return { x: b.x + sq * f + sq / 2, y: b.y + b.height - sq * r - sq / 2 }; };
      const a = at(from), c = at(to);
      await p.mouse.click(a.x, a.y); await p.mouse.click(c.x, c.y); await sleep(900);
    };
    for (const [p, f, t, fl] of [[priya, 'e2', 'e4'], [lee, 'e7', 'e5', true], [priya, 'f1', 'c4'], [lee, 'b8', 'c6', true]]) await move(p, f, t, fl);
    // Kai, watching, reads the rules.
    await tap(kai.locator('.rail-btn[title="Rules"]'));
    await tap(kai.locator('.tabs [role=tab]', { hasText: 'Rules' }));
    await shot(kai, '12-rules.png');
    for (const [p, f, t, fl] of [[priya, 'd1', 'h5'], [lee, 'g8', 'f6', true], [priya, 'h5', 'f7']]) await move(p, f, t, fl);
    await sleep(2500);
    await shot(priya, '04-result.png');
    // The Room rules dialog (Priya hosts).
    await priya.getByRole('button', { name: 'Room rules' }).click(); await sleep(600);
    await shot(priya, '08-room-rules.png');
    await priya.keyboard.press('Escape');
    // The replay, from the result card.
    await priya.getByText('Review the game', { exact: true }).click(); await priya.waitForSelector('.replay-controls'); await sleep(1200);
    for (let i = 0; i < 5; i++) { await tap(priya.getByRole('button', { name: 'Next', exact: true })); await sleep(200); }
    await shot(priya, '21-replay.png');

    // A private room: someone else gets the password prompt.
    const host = await account('Morgan');
    const { room: locked } = await api('/rooms', { name: 'Family only', gameId: 'chess', hostSeat: 'white', listed: true, password: 'kittens', gameConfig: { initialSeconds: 600, incrementSeconds: 0 } }, host.token);
    const u = await account('Jordan');
    const pctx = await browser.newContext({ viewport: { width: 640, height: 520 }, ignoreHTTPSErrors: true, colorScheme: 'dark' });
    await pctx.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), { token: u.token, user: u.user });
    const gate = await pctx.newPage();
    await gate.goto(`${base}/#/r/${locked.code}`); await sleep(1200);
    await shot(gate, '09-private.png');

    // The demo players' Sam's stats, if the demo data is loaded (else the run's Sam).
    const r = await fetch(`${base}/api/leaderboard?game=chess&period=all`, { headers: { Authorization: `Bearer ${(await account('Sam')).token}` } });
    const board = await r.json();
    const demoSam = board.ranked?.find((x) => x.name === 'Sam' && x.played > 5);
    const stats = await open('Sam', code);
    await stats.goto(`${base}/#/players/${demoSam?.userId ?? (await account('Sam')).user.id}`); await sleep(1500);
    await shot(stats, '11-stats.png');

    // Settings, with a stand-in microphone and camera.
    const media = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const sctx = await media.newContext({ viewport: VIEW, ignoreHTTPSErrors: true, colorScheme: 'dark' });
    const sam = await account('Sam');
    await sctx.addInitScript((x) => localStorage.setItem('playhall.session', JSON.stringify(x)), { token: sam.token, user: sam.user });
    const set = await sctx.newPage();
    await set.goto(`${base}/#/settings`); await sleep(1500);
    await tap(set.getByRole('button', { name: /Check|Test|Start/ }));
    await sleep(2500);
    await shot(set, '24-settings.png');
    await media.close();
  },
};

browser = await chromium.launch();
for (const [name, scene] of Object.entries(SCENES)) {
  if (only.length && !only.includes(name)) continue;
  try { await scene(); } catch (e) { errors.push(`${name}: ${e.message}`); }
}
await browser.close();
console.log(errors.length ? `errors:\n  ${errors.join('\n  ')}` : 'no errors');
