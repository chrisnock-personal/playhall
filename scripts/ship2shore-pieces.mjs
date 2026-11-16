// Draws docs/mockups/ship2shore-pieces.html from the game's own drawing code
// (src/client/games/ship2shore-art.tsx), so the preview of every Ship2Shore
// piece matches what the game shows.
//   node scripts/ship2shore-pieces.mjs
import { build } from 'esbuild';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = `
import { createElement as h, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DECK, ORDERS, ROLES, FACTIONS, CHARTS, HEADINGS, ACTIONS, orderHeading, orderKind } from './src/shared/games/ship2shore';
import { RoleCard, FactionBadge, OrderCard, EffectIcon, SeaChart, RankMarker, RANK_NAME, RoundToken, Marker, MARKER_NAME } from './src/client/games/ship2shore-art';

const piece = (big, title, sub) => h('figure', { className: 'piece' }, h('div', { className: 'big' }, big), h('figcaption', null, h('strong', null, title), sub ? h('span', null, sub) : null));
const page = h(Fragment, null,
  h('h2', null, 'Role cards'),
  h('div', { className: 'grid' },
    ...Object.entries(ROLES).map(([id, r]) => piece(h(RoleCard, { role: id, width: 96 }), r.title, r.line)),
    piece(h(RoleCard, { role: 'navy', width: 96, bribed: true }), 'Bribed', 'Stamped when the Fixer buys a player: they win with the Black Market now'),
    piece(h(RoleCard, { role: null, width: 96 }), 'The back', 'Hidden roles, dealt face down')),
  h('h2', null, 'Faction badges'),
  h('div', { className: 'grid' }, ...Object.entries(FACTIONS).map(([f, x]) => piece(h(FactionBadge, { faction: f, size: 64 }), x.short, \`Wants \${x.port}\`))),
  h('h2', null, 'Course orders (the deck of 28)'),
  h('div', { className: 'grid' },
    ...DECK.map(([o, n]) => piece(h(OrderCard, { order: o, width: 96 }), \`\${ORDERS[orderKind(o)].title} × \${n}\`, \`\${HEADINGS[orderHeading(o)]}: \${ORDERS[orderKind(o)].effect}\`)),
    piece(h(OrderCard, { order: null, width: 96 }), 'The back', 'Ship’s orders, face down')),
  h('h3', null, 'Order effects'),
  h('div', { className: 'effects' }, ...Object.entries(ORDERS).map(([k, x]) => h('span', { className: 'eff' }, h('svg', { width: 40, height: 40, viewBox: '0 0 20 20' }, h(EffectIcon, { kind: k })), x.title))),
  h('h2', null, 'The charts'),
  h('div', { className: 'charts' }, ...Object.values(CHARTS).map((c) => h('figure', null, h(SeaChart, { chartId: c.id, ship: { q: 0, r: 0 }, next: true }), h('figcaption', null, \`\${c.name}: \${c.id === 'short' ? '5-7 players' : '8-11 players, with a resupply line'}. Each area marks where each heading takes the ship from there.\`)))),
  h('h2', null, 'The bridge markers'),
  h('div', { className: 'grid' }, ...Object.entries(RANK_NAME).map(([r, name]) => piece(h(RankMarker, { rank: r, size: 56 }), name))),
  h('h2', null, 'Tokens'),
  h('div', { className: 'grid' }, piece(h(RoundToken, { size: 56 }), 'A round of ammunition', 'Three each at the start; secret'), piece(h(RoundToken, { size: 56, spent: true }), 'A spent round')),
  h('h2', null, 'Chart actions and player markers'),
  h('div', { className: 'grid' },
    ...Object.entries(ACTIONS).map(([k, x]) => piece(h(Marker, { kind: k, size: 48 }), x.title, x.text)),
    ...Object.entries(MARKER_NAME).map(([k, name]) => piece(h(Marker, { kind: k, size: 48 }), name))),
);
export default renderToStaticMarkup(page);
`;

// Bundled next to node_modules (packages stay outside the bundle), then removed.
const out = path.join(root, `.pieces-${process.pid}.mjs`);
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'tsx' },
  bundle: true, platform: 'node', format: 'esm', outfile: out, jsx: 'automatic', packages: 'external',
  loader: { '.css': 'empty' }, logLevel: 'error',
});
const origError = console.error;
console.error = (m, ...rest) => { if (!String(m).includes('useLayoutEffect')) origError(m, ...rest); };
const body = (await import(pathToFileURL(out).href)).default;
console.error = origError;
rmSync(out, { force: true });

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ship2Shore pieces</title>
<style>
:root { --bg: #F6F4EF; --surface: #FFFFFF; --text: #1F2228; --muted: #646A75; --line: #D6D0C4; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #121418; --surface: #1b1e24; --text: #e8eaee; --muted: #9aa1ae; --line: #2f3440; } }
:root[data-theme="dark"] { --bg: #121418; --surface: #1b1e24; --text: #e8eaee; --muted: #9aa1ae; --line: #2f3440; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--text); font: 15px/1.45 Inter, system-ui, sans-serif; }
main { max-width: 1180px; margin: 0 auto; }
h1 { font: 700 28px "Space Grotesk", Inter, system-ui, sans-serif; margin: 8px 0 4px; }
h2 { font: 700 19px "Space Grotesk", Inter, system-ui, sans-serif; margin: 28px 0 10px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font: 600 16px "Space Grotesk", Inter, system-ui, sans-serif; margin: 18px 0 8px; }
p.lead { color: var(--muted); max-width: 760px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.piece { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.piece .big { display: flex; justify-content: center; min-height: 100px; align-items: center; }
.piece figcaption { font-size: 13px; } .piece figcaption span { display: block; color: var(--muted); }
.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.charts figure { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px; }
.charts svg { width: 100%; height: auto; display: block; }
.charts figcaption { font-size: 13px; color: var(--muted); margin-top: 6px; }
.effects { display: flex; flex-wrap: wrap; gap: 12px; background: #F3EBD8; color: #1E2328; border-radius: 12px; padding: 12px; }
.eff { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; width: 96px; text-align: center; font-size: 13px; }
.toggle { float: right; }
svg { max-width: 100%; }
</style></head>
<body><main>
<button class="toggle" onclick="var r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">Light / dark</button>
<h1>Ship2Shore: the pieces</h1>
<p class="lead">Every piece for Ship2Shore (docs/ship2shore.md), drawn by the game's own code (src/client/games/ship2shore-art.tsx). Made by <code>node scripts/ship2shore-pieces.mjs</code>; run it again after changing the pieces.</p>
${body}
</main></body></html>
`;
writeFileSync(path.join(root, 'docs/mockups/ship2shore-pieces.html'), html);
console.log(`wrote docs/mockups/ship2shore-pieces.html (${Math.round(html.length / 1024)} KB)`);
