// Ship2Shore's pieces, drawn inline in a 1940s poster and dispatch style:
// role cards and their back (a SECRET dossier), course orders as stamped
// dispatches and their back, the sea chart of the Bay of Biscay with its
// ports, the ship, the bridge markers (captain, first officer, helmsman),
// rounds of ammunition, and the markers for the sharks, radio silence,
// inspection and off watch. Every piece reads without colour: factions are a
// circle (Navy), a diamond (spies) and a hexagon (Black Market); directions
// are arrows. Our own drawings (docs/ship2shore.md).

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { animate } from '../kit/motion';
import {
  ACTIONS, CHARTS, DIRS, FACTIONS, ORDERS, ROLES, actionAt, orderDir, orderKind,
  type ChartAction, type Dir, type Faction, type Order, type OrderKind, type Pos, type Role,
} from '../../shared/games/ship2shore';

export const INK = '#1E2328';
const PAPER = '#F3EBD8';
const CREAM = '#FBF6EA';
/** Faction colours, for posters and badges (shape tells them apart too). */
export const FACTION_COLOUR: Record<Faction, { fill: string; deep: string; light: string }> = {
  navy: { fill: '#2F5D8A', deep: '#1B3553', light: '#CFE0F0' },
  spy: { fill: '#8E2F33', deep: '#4E171B', light: '#F1D3D3' },
  bm: { fill: '#B98A1E', deep: '#5E4410', light: '#F4E5BE' },
};
export const DIR_COLOUR: Record<Dir, string> = { ne: '#2F5D8A', sw: '#8E2F33', s: '#9A6F12' };
const DIR_FACTION: Record<Dir, Faction> = { ne: 'navy', sw: 'spy', s: 'bm' };
const SANS = 'Inter, system-ui, sans-serif';
const TYPE = '"Courier New", Courier, monospace';
const POSTER = '"Space Grotesk", Inter, system-ui, sans-serif';

// ---- Emblems (drawn in a 40 × 40 box) ----

function Anchor({ c }: { c: string }) {
  const p = { fill: 'none', stroke: c, strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <g>
      <circle cx="20" cy="9" r="3" {...p} />
      <path d="M20 12v21M14 16h12M9.5 25q0 9 10.5 9t10.5-9" {...p} />
      <path d="M7 28l2.5-4 3.5 2.5M33 28l-2.5-4-3.5 2.5" {...p} />
    </g>
  );
}
function Periscope({ c }: { c: string }) {
  const p = { fill: 'none', stroke: c, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <g>
      <path d="M18 28V10h9" {...p} />
      <rect x="25" y="7" width="5" height="6" rx="1" fill={c} />
      <path d="M22 10v18" {...p} strokeWidth="1.6" />
      <path d="M6 30q3.5-3 7 0t7 0 7 0 7 0M9 35q3-2.5 6 0t6 0 6 0 6 0" {...p} strokeWidth="1.8" />
    </g>
  );
}
function Pound({ c }: { c: string }) {
  return <text x="20" y="21.5" textAnchor="middle" dominantBaseline="central" fill={c} fontSize="25" fontWeight="800" fontFamily="Georgia, 'Times New Roman', serif">£</text>;
}
function Fedora({ c, band }: { c: string; band: string }) {
  return (
    <g>
      <path d="M4 27q16 7 32 0q-4-3-8-3l-1.5-11q-6.5-4-13 0L12 24q-4 0-8 3z" fill={c} />
      <path d="M12.4 21.5h15.2l.4 3h-16z" fill={band} />
      <path d="M17 12.5q3 3 6 0" fill="none" stroke={band} strokeWidth="1" />
    </g>
  );
}
function Crate({ c, line }: { c: string; line: string }) {
  return (
    <g>
      <rect x="8" y="12" width="24" height="20" rx="1.5" fill={c} stroke={line} strokeWidth="1.6" />
      <path d="M8 12l24 20M32 12L8 32" stroke={line} strokeWidth="1.3" />
      <path d="M8 18.5h24M8 25.5h24" stroke={line} strokeWidth="1" opacity=".6" />
    </g>
  );
}

/** A faction's badge: Navy a circle with an anchor, the spies a diamond with
 *  a periscope, the Black Market a hexagon with a pound sign. */
export function FactionBadge({ faction, size = 32, title }: { faction: Faction; size?: number; title?: string }) {
  const col = FACTION_COLOUR[faction];
  const shape = faction === 'navy' ? <circle cx="20" cy="20" r="18" fill={col.fill} stroke={col.deep} strokeWidth="2" />
    : faction === 'spy' ? <path d="M20 1.5L38.5 20 20 38.5 1.5 20z" fill={col.fill} stroke={col.deep} strokeWidth="2" strokeLinejoin="round" />
      : <path d="M20 2l16 9v18l-16 9-16-9V11z" fill={col.fill} stroke={col.deep} strokeWidth="2" strokeLinejoin="round" />;
  const inner = faction === 'navy' ? <Anchor c="#FBF6EA" /> : faction === 'spy' ? <g transform="translate(5 5) scale(.75)"><Periscope c="#FBF6EA" /></g> : <Pound c="#FBF6EA" />;
  return (
    <svg className="s2s-badge" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title ?? FACTIONS[faction].short}>
      {shape}{inner}
    </svg>
  );
}

// ---- Role cards ----

const ROLE_ART: Record<Role, (col: { fill: string; deep: string; light: string }) => ReactNode> = {
  navy: () => <g transform="translate(13 26) scale(1.1)"><Anchor c={CREAM} /></g>,
  spy: () => <g transform="translate(13 26) scale(1.1)"><Periscope c={CREAM} /></g>,
  fixer: (col) => <g transform="translate(13 24) scale(1.1)"><Fedora c={INK} band={col.fill} /><g transform="translate(20 27) scale(.42) translate(-20 -20)"><Pound c={CREAM} /></g></g>,
  smuggler: (col) => <g transform="translate(13 26) scale(1.1)"><Crate c={col.light} line={col.deep} /></g>,
};

/** A role card, 70 × 100. `role` null shows the back. `bribed` adds the
 *  Black Market's stamp across it. */
export function RoleCard({ role, width = 70, bribed, className }: { role: Role | null; width?: number; bribed?: boolean; className?: string }) {
  if (!role) {
    return (
      <svg className={`playing-card s2s-card${className ? ` ${className}` : ''}`} width={width} height={(width * 100) / 70} viewBox="0 0 70 100" role="img" aria-label="A face-down role card">
        <rect x="1" y="1" width="68" height="98" rx="7" fill="#D8C39A" stroke="#8C7444" strokeWidth="1.5" />
        <path d="M1 18h20l4-6h44" fill="none" stroke="#B49B68" strokeWidth="1.2" />
        <g transform="translate(15 34)"><Ship size={40} colour="#5C4A28" /></g>
        <g transform="rotate(-14 35 72)">
          <rect x="11" y="63" width="48" height="16" rx="2" fill="none" stroke="#A3262E" strokeWidth="2" />
          <text x="35" y="71.5" textAnchor="middle" dominantBaseline="central" fill="#A3262E" fontSize="10" fontWeight="800" letterSpacing="2" fontFamily={TYPE}>SECRET</text>
        </g>
        <text x="35" y="92" textAnchor="middle" fill="#5C4A28" fontSize="4.4" fontWeight="700" letterSpacing=".4" fontFamily={SANS}>SS MARIGOLD · 1943</text>
      </svg>
    );
  }
  const r = ROLES[role];
  const col = FACTION_COLOUR[r.faction];
  const port = FACTIONS[r.faction].port.replace('the U-boat ', '').toUpperCase();
  const shape = r.faction === 'navy' ? <circle cx="35" cy="48" r="23" fill={col.deep} stroke={CREAM} strokeWidth="1.2" />
    : r.faction === 'spy' ? <path d="M35 23l25 25-25 25-25-25z" fill={col.deep} stroke={CREAM} strokeWidth="1.2" strokeLinejoin="round" />
      : <path d="M35 24l21 12v24l-21 12-21-12V36z" fill={col.deep} stroke={CREAM} strokeWidth="1.2" strokeLinejoin="round" />;
  return (
    <svg className={`playing-card s2s-card${className ? ` ${className}` : ''}`} width={width} height={(width * 100) / 70} viewBox="0 0 70 100" role="img"
      aria-label={`${r.title}${bribed ? ', bribed: now Black Market' : ''}`}>
      <rect x="1" y="1" width="68" height="98" rx="7" fill={col.fill} stroke={col.deep} strokeWidth="1.5" />
      {/* Poster rays behind the emblem. */}
      {/* Same geometry on every card, so a repeated id is harmless. */}
      <clipPath id="s2s-card-inner"><rect x="2" y="2" width="66" height="96" rx="6" /></clipPath>
      <g clipPath="url(#s2s-card-inner)">
        {[...Array(12)].map((_, i) => <path key={i} d="M35 48L31 0h8z" fill={CREAM} opacity=".07" transform={`rotate(${i * 30} 35 48)`} />)}
      </g>
      <rect x="5" y="5" width="60" height="90" rx="4" fill="none" stroke={CREAM} strokeWidth=".8" opacity=".7" />
      <text x="35" y="14" textAnchor="middle" fill={CREAM} fontSize="4.4" fontWeight="700" letterSpacing=".4" fontFamily={SANS}>SS MARIGOLD · 1943</text>
      {shape}
      {ROLE_ART[role](col)}
      <rect x="7" y="74" width="56" height="12" fill={CREAM} />
      <text x="35" y="80.5" textAnchor="middle" dominantBaseline="central" fill={col.deep} fontSize={r.title.length > 10 ? 7 : 8} fontWeight="800" letterSpacing=".6" fontFamily={POSTER}>{r.title.toUpperCase()}</text>
      <text x="35" y="92" textAnchor="middle" fill={CREAM} fontSize="5.2" fontWeight="700" letterSpacing=".8" fontFamily={SANS}>{DIRS[FACTIONS[r.faction].dir].arrow} {port}</text>
      {bribed && (
        <g transform="rotate(-22 35 50)">
          <rect x="6" y="41" width="58" height="17" rx="2" fill={FACTION_COLOUR.bm.light} fillOpacity=".92" stroke={FACTION_COLOUR.bm.deep} strokeWidth="1.6" />
          <text x="35" y="50" textAnchor="middle" dominantBaseline="central" fill={FACTION_COLOUR.bm.deep} fontSize="9" fontWeight="800" letterSpacing="1.5" fontFamily={TYPE}>£ BOUGHT</text>
        </g>
      )}
    </svg>
  );
}

// ---- Course orders ----

/** An arrow pointing the order's way, in a stamp: ↗ ↙ ↓. */
function DirStamp({ dir, x, y, r = 14 }: { dir: Dir; x: number; y: number; r?: number }) {
  const turn = dir === 'ne' ? 45 : dir === 'sw' ? 225 : 180;
  const c = DIR_COLOUR[dir];
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="none" stroke={c} strokeWidth="1.8" />
      <circle r={r - 3} fill="none" stroke={c} strokeWidth=".6" strokeDasharray="1.5 1.2" />
      <g transform={`rotate(${turn}) scale(${r / 14})`}>
        <path d="M0-9.5L6.5-1.5H2.6V9H-2.6V-1.5H-6.5z" fill={c} />
      </g>
    </g>
  );
}

/** The order's effect as a small picture (drawn in a 20 × 20 box). */
export function EffectIcon({ kind, c = INK }: { kind: OrderKind; c?: string }) {
  const p = { fill: 'none', stroke: c, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'steady': return <g><circle cx="10" cy="10" r="5.5" {...p} />{[0, 45, 90, 135].map((a) => <path key={a} d="M10 2v16" {...p} transform={`rotate(${a} 10 10)`} />)}<circle cx="10" cy="10" r="1.6" fill={c} /></g>;
    case 'shoreleave': return <g><path d="M3 9q7-7 14 0v2.5H3z" fill={c} /><path d="M3 11.5q7 4 14 0" {...p} /><path d="M6 16l9 0" {...p} strokeDasharray="1.5 1.5" /></g>;
    case 'armslocker': return <g><Cartridge x={4} y={3} c={c} /><path d="M14 7v6M11 10h6" {...p} strokeWidth="1.8" /></g>;
    case 'confiscated': return <g><Cartridge x={4} y={3} c={c} /><path d="M11.5 7.5l5 5M16.5 7.5l-5 5" {...p} strokeWidth="1.8" /></g>;
    case 'intercept': return <g><path d="M10 18V8" {...p} /><path d="M7 18h6" {...p} /><circle cx="10" cy="6.5" r="1.6" fill={c} /><path d="M6 3.5a5 5 0 0 0 0 6M14 3.5a5 5 0 0 1 0 6M3.5 1.5a8.5 8.5 0 0 0 0 10M16.5 1.5a8.5 8.5 0 0 1 0 10" {...p} strokeWidth="1.1" /></g>;
    case 'spotter': return <Binoculars c={c} />;
    case 'contraband': return <g transform="scale(.5)"><Crate c="none" line={c} /><g transform="translate(10 6) scale(.5)"><Pound c={c} /></g></g>;
  }
}
function Cartridge({ x, y, c }: { x: number; y: number; c: string }) {
  return <g transform={`translate(${x} ${y})`}><path d="M1 14V5q0-4 2.5-5Q6 1 6 5v9z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" /><path d="M0 14h7" stroke={c} strokeWidth="1.5" /></g>;
}
function Binoculars({ c }: { c: string }) {
  return <g fill="none" stroke={c} strokeWidth="1.4"><circle cx="5.5" cy="13" r="3.8" /><circle cx="14.5" cy="13" r="3.8" /><path d="M3 9.5l1.5-5h3l1 5M17 9.5l-1.5-5h-3l-1 5M9.3 11.5h1.4" /></g>;
}

const TITLE_LINES: Record<OrderKind, string[]> = {
  steady: ['STEADY AS', 'SHE GOES'], shoreleave: ['SHORE', 'LEAVE'], armslocker: ['ARMS', 'LOCKER'], confiscated: ['CONFIS-', 'CATED'],
  intercept: ['RADIO', 'INTERCEPT'], spotter: ['SPOTTER'], contraband: ['CONTRA-', 'BAND'],
};

/** A course order, 70 × 100: a typed dispatch with the heading stamped on.
 *  `order` null shows the back. */
export function OrderCard({ order, width = 70, raised, dim, className }: { order: Order | null; width?: number; raised?: boolean; dim?: boolean; className?: string }) {
  const cls = `playing-card s2s-card${raised ? ' raised' : ''}${dim ? ' dim' : ''}${className ? ` ${className}` : ''}`;
  if (!order) {
    return (
      <svg className={cls} width={width} height={(width * 100) / 70} viewBox="0 0 70 100" role="img" aria-label="A face-down course order">
        <rect x="1" y="1" width="68" height="98" rx="7" fill="#2E3B36" stroke="#C9B48E" strokeWidth="1.5" />
        <rect x="6" y="6" width="58" height="88" rx="4" fill="none" stroke="#C9B48E" strokeWidth=".8" />
        <Compass x={35} y={46} r={18} c="#C9B48E" />
        <text x="35" y="80" textAnchor="middle" fill="#E9DDC0" fontSize="6.5" fontWeight="800" letterSpacing="1.5" fontFamily={TYPE}>SHIP’S</text>
        <text x="35" y="88" textAnchor="middle" fill="#E9DDC0" fontSize="6.5" fontWeight="800" letterSpacing="1.5" fontFamily={TYPE}>ORDERS</text>
      </svg>
    );
  }
  const dir = orderDir(order), kind = orderKind(order);
  const c = DIR_COLOUR[dir];
  const lines = TITLE_LINES[kind];
  return (
    <svg className={cls} width={width} height={(width * 100) / 70} viewBox="0 0 70 100" role="img"
      aria-label={`${ORDERS[kind].title}, ${DIRS[dir].name}`}>
      <rect x="1" y="1" width="68" height="98" rx="7" fill={PAPER} stroke="#BFAE88" strokeWidth="1.5" />
      <path d="M1.75 8a6.25 6.25 0 0 1 6.25-6.25h54a6.25 6.25 0 0 1 6.25 6.25v4h-66.5z" fill={c} />
      <text x="6" y="20" fill={INK} fontSize="5" fontWeight="700" letterSpacing=".6" fontFamily={TYPE}>COURSE ORDER</text>
      <path d="M6 23h58" stroke={INK} strokeWidth=".4" strokeDasharray="1 1" />
      <DirStamp dir={dir} x={35} y={40} />
      {lines.map((l, i) => (
        <text key={l} x="35" y={lines.length === 1 ? 67 : 64 + i * 8} textAnchor="middle" fill={INK} fontSize={l.length > 8 ? 6.8 : 7.6} fontWeight="800" letterSpacing=".3" fontFamily={TYPE}>{l}</text>
      ))}
      <g transform="translate(6 77)"><EffectIcon kind={kind} /></g>
      <text x="64" y="85" textAnchor="end" fill={c} fontSize="5.4" fontWeight="800" letterSpacing=".5" fontFamily={SANS}>{DIRS[dir].name.toUpperCase()}</text>
      <text x="64" y="92" textAnchor="end" fill={INK} fontSize="4.4" fontFamily={SANS} opacity=".75">to {DIRS[dir].toward}</text>
    </svg>
  );
}

function Compass({ x, y, r, c }: { x: number; y: number; r: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="none" stroke={c} strokeWidth="1" />
      <circle r={r * 0.72} fill="none" stroke={c} strokeWidth=".5" strokeDasharray="1 1" />
      {[0, 90, 180, 270].map((a) => <path key={a} d={`M0 ${-r}L${r * 0.16} 0L0 ${r * 0.16}L${-r * 0.16} 0z`} fill={c} transform={`rotate(${a})`} />)}
      {[45, 135, 225, 315].map((a) => <path key={a} d={`M0 ${-r * 0.62}L${r * 0.1} 0L${-r * 0.1} 0z`} fill={c} opacity=".7" transform={`rotate(${a})`} />)}
      <text y={-r - 2.5} textAnchor="middle" fill={c} fontSize={r * 0.36} fontWeight="800" fontFamily={SANS}>N</text>
    </g>
  );
}

// ---- Tokens and markers ----

/** The SS Marigold, side on. */
export function Ship({ size = 40, colour = 'currentColor', title }: { size?: number; colour?: string; title?: string }) {
  const svg = (
    <g>
      <path d="M2 25h36l-5 8H7z" fill={colour} />
      <rect x="15" y="17" width="12" height="8" fill={colour} />
      <rect x="18" y="12" width="4" height="5" fill={colour} />
      <path d="M8 25V9M32 25V11M8 11l24 1" stroke={colour} strokeWidth="1.2" fill="none" />
      <path d="M3 37q3-2 6 0t6 0 6 0 6 0 6 0 6 0" stroke={colour} strokeWidth="1.2" fill="none" />
    </g>
  );
  return title !== undefined
    ? <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={title}>{svg}</svg>
    : <svg x="0" y="0" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">{svg}</svg>;
}

export type Rank = 'captain' | 'officer' | 'helm';
export const RANK_NAME: Record<Rank, string> = { captain: 'Captain', officer: 'First officer', helm: 'Helmsman' };
/** The bridge markers: the captain's cap, the first officer's binoculars and
 *  the helmsman's wheel, on a navy roundel with a brass rim. */
export function RankMarker({ rank, size = 26 }: { rank: Rank; size?: number }) {
  const brass = '#E3B341', navy = '#1B3553';
  let art: ReactNode;
  if (rank === 'captain') {
    art = <g><path d="M8 21q12-12 24 0v3.5H8z" fill={CREAM} /><rect x="8" y="23.5" width="24" height="3" fill={INK} /><path d="M10 26.5q10 6 20 0z" fill={INK} /><circle cx="20" cy="18.5" r="2.6" fill={brass} /><path d="M12 23.5q8-2 16 0" stroke={brass} strokeWidth="1" fill="none" /></g>;
  } else if (rank === 'officer') {
    art = <g transform="translate(5 5) scale(1.5)"><Binoculars c={CREAM} /></g>;
  } else {
    art = (
      <g stroke={CREAM} strokeWidth="2" strokeLinecap="round" fill="none">
        <circle cx="20" cy="20" r="8" />
        {[0, 45, 90, 135].map((a) => <path key={a} d="M20 8.5v23" transform={`rotate(${a} 20 20)`} />)}
        <circle cx="20" cy="20" r="2" fill={CREAM} />
      </g>
    );
  }
  return (
    <svg className="s2s-rank" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={RANK_NAME[rank]}>
      <circle cx="20" cy="20" r="18.5" fill={navy} stroke={brass} strokeWidth="2.5" />
      {art}
    </svg>
  );
}

/** One round of ammunition: a brass cartridge. */
export function RoundToken({ size = 22, spent }: { size?: number; spent?: boolean }) {
  return (
    <svg className="s2s-round" width={size * 0.5} height={size} viewBox="0 0 12 24" role="img" aria-label={spent ? 'A spent round' : 'A round of ammunition'}>
      <path d="M2 22V9q0-7 4-9 4 2 4 9v13z" fill={spent ? 'none' : '#C9962E'} stroke="#6E5214" strokeWidth="1.2" strokeLinejoin="round" strokeDasharray={spent ? '2 1.5' : undefined} />
      {!spent && <path d="M2 9h8" stroke="#6E5214" strokeWidth="1" />}
      <rect x="1" y="21" width="10" height="2.6" rx=".6" fill={spent ? 'none' : '#8A6A1E'} stroke="#6E5214" strokeWidth=".8" />
    </svg>
  );
}

export type MarkerKind = 'sharks' | 'silence' | 'inspect' | 'interrogate' | 'offwatch' | 'resigned';
export const MARKER_NAME: Record<MarkerKind, string> = {
  sharks: 'Overboard', silence: 'Radio silence', inspect: 'Inspected', interrogate: 'Interrogated', offwatch: 'Off watch', resigned: 'Resigned',
};

/** A chart action (or player marker) as a picture in a 20 × 20 box. */
export function ActionGlyph({ kind, c = INK }: { kind: ChartAction | MarkerKind; c?: string }) {
  const p = { fill: 'none', stroke: c, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'sharks':
      return <g><path d="M3 14.5Q8 13.5 9 7Q10 2.5 15 1.5Q12.5 5 13 9Q13.6 12.6 17 14.5Z" fill={c} /><path d="M1.5 16.5q2.2-1.8 4.3 0t4.2 0 4.2 0 4.3 0" {...p} strokeWidth="1.3" /></g>;
    case 'inspect':
      return <g><path d="M3 8q0-3 3-3h5q3 0 3 3v8H3z" {...p} strokeWidth="1.3" /><path d="M6 5q0-3 2.5-3T11 5" {...p} strokeWidth="1.1" /><circle cx="13" cy="12" r="3.6" fill="#FBF6EA" stroke={c} strokeWidth="1.5" /><path d="M15.6 14.6L19 18" {...p} strokeWidth="2" /></g>;
    case 'interrogate':
      return <g><path d="M10 1v3" {...p} /><path d="M5 9l2-5h6l2 5z" fill={c} /><path d="M4 12l-2 2M16 12l2 2M10 12v3" {...p} strokeWidth="1.1" strokeDasharray="1.2 1" /><text x="10" y="17.5" textAnchor="middle" dominantBaseline="central" fill={c} fontSize="6" fontWeight="800" fontFamily={SANS}>?</text></g>;
    case 'silence':
      return <g><rect x="7" y="2" width="6" height="10" rx="3" {...p} /><path d="M4.5 9q0 5 5.5 5t5.5-5M10 14v4M7 18h6" {...p} strokeWidth="1.2" /><path d="M3 3l14 14" {...p} strokeWidth="2" /></g>;
    case 'offwatch':
      return <g><path d="M15 4a6.5 6.5 0 1 0 2 9 5.2 5.2 0 0 1-2-9z" fill={c} /><text x="5" y="7" textAnchor="middle" fill={c} fontSize="5.5" fontWeight="800" fontFamily={SANS}>z</text></g>;
    case 'resigned':
      return <g><path d="M5 18V3" {...p} /><path d="M5 3h10l-2.5 3.5L15 10H5" {...p} strokeWidth="1.3" /></g>;
  }
}

/** A player marker: a small roundel with a glyph (overboard, silenced...). */
export function Marker({ kind, size = 20 }: { kind: MarkerKind | ChartAction; size?: number }) {
  const bg = kind === 'sharks' ? '#24394A' : kind === 'silence' ? '#5E2C2C' : kind === 'offwatch' ? '#3B3F55' : kind === 'resigned' ? '#4A4A4A' : '#4A5A3A';
  const name = kind in MARKER_NAME ? MARKER_NAME[kind as MarkerKind] : ACTIONS[kind as ChartAction].title;
  return (
    <svg className="s2s-marker" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={name}>
      <title>{name}</title>
      <rect x="1" y="1" width="22" height="22" rx="6" fill={bg} stroke="#FBF6EA" strokeWidth="1" strokeOpacity=".6" />
      <g transform="translate(2 2)"><ActionGlyph kind={kind} c="#FBF6EA" /></g>
    </svg>
  );
}

// ---- The chart ----

const DX = 34, DY = 32;
/** Where a sea area sits on the chart: north-east is up and right, south-west
 *  down and left, south straight down. */
export const chartXY = (p: Pos) => ({ x: p.a * DX, y: p.b * DY - (p.a * DY) / 2 });

function Port({ faction, x, y }: { faction: Faction; x: number; y: number }) {
  const col = FACTION_COLOUR[faction];
  const icon = faction === 'navy'
    // A lighthouse.
    ? <g><path d="M-3 8l1-13h4l1 13z" fill={CREAM} stroke={INK} strokeWidth="1" /><path d="M-2.4 0h4.8" stroke="#A3262E" strokeWidth="2.4" /><rect x="-3" y="-9" width="6" height="4" fill="#F2C84B" stroke={INK} strokeWidth="1" /><path d="M-6-7h-5M6-7h5" stroke="#F2C84B" strokeWidth="1.4" /></g>
    : faction === 'bm'
      // A tower on the quay.
      ? <g><rect x="-5" y="-6" width="10" height="14" fill={CREAM} stroke={INK} strokeWidth="1" /><path d="M-5-6v-3h2v2h2v-2h2v2h2v-2h2v3" fill={CREAM} stroke={INK} strokeWidth="1" /><path d="M-1.5 8v-5a1.5 1.5 0 0 1 3 0v5" fill={INK} /></g>
      // A U-boat's conning tower.
      : <g><path d="M-12 4h24q-2 4-6 4h-14q-4 0-4-4z" fill="#0E1A22" stroke="#9FB5C2" strokeWidth=".8" /><path d="M-4 4v-6h6l2 6z" fill="#0E1A22" stroke="#9FB5C2" strokeWidth=".8" /><path d="M0-2v-5h3" stroke="#9FB5C2" strokeWidth="1" fill="none" /></g>;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g transform="translate(0 -9)">{icon}</g>
      <rect x="-22" y="4" width="44" height="11" rx="3" fill={col.deep} stroke={CREAM} strokeWidth=".8" />
      <text y="9.8" textAnchor="middle" dominantBaseline="central" fill={CREAM} fontSize="6.3" fontWeight="800" letterSpacing=".3" fontFamily={POSTER}>
        {faction === 'navy' ? 'PLYMOUTH' : faction === 'bm' ? 'LISBON' : 'U-BOATS'}
      </text>
    </g>
  );
}

/** The chart of the Bay of Biscay: sea areas joined the three ways the ship
 *  can sail, chart actions on some of them, the three ports along the edges
 *  and the ship. `next` shows where each heading would take her. */
export function SeaChart({ chartId, ship, next, className }: { chartId: 'short' | 'long'; ship: Pos | null; next?: boolean; className?: string }) {
  const chart = CHARTS[chartId];
  const { reach: R, depth: D } = chart;
  const cells: Pos[] = [];
  for (let b = 0; b < D; b++) for (let a = -R + 1; a < R; a++) cells.push({ a, b });
  const minX = -R * DX - 40, maxX = R * DX + 40;
  const minY = -(R * DY) / 2 - 34, maxY = D * DY + (R * DY) / 2 + 34;
  const w = maxX - minX, h = maxY - minY;
  const line = (p: Pos, q: Pos, key: string) => { const u = chartXY(p), v = chartXY(q); return <path key={key} d={`M${u.x} ${u.y}L${v.x} ${v.y}`} />; };
  const edges: ReactNode[] = [];
  for (const p of cells) {
    edges.push(line(p, { a: p.a + 1, b: p.b }, `${p.a},${p.b}e`));
    edges.push(line(p, { a: p.a, b: p.b + 1 }, `${p.a},${p.b}s`));
    if (p.a === -R + 1) edges.push(line(p, { a: p.a - 1, b: p.b }, `${p.a},${p.b}w`));
  }
  const coast = (pts: Pos[]) => pts.map((p, i) => { const { x, y } = chartXY(p); return `${i ? 'L' : 'M'}${x} ${y}`; }).join('');
  const plymouth = Array.from({ length: D }, (_, b) => ({ a: R, b }));
  const uboats = Array.from({ length: D }, (_, b) => ({ a: -R, b }));
  const lisbon = Array.from({ length: 2 * R - 1 }, (_, i) => ({ a: i - R + 1, b: D }));
  const resupply = chart.resupplyRow;
  const shipAt = ship ? chartXY(ship) : null;
  const heads: [Dir, Pos][] = ship && next ? (['ne', 'sw', 's'] as Dir[]).map((d) => [d, { a: ship.a + (d === 'ne' ? 1 : d === 'sw' ? -1 : 0), b: ship.b + (d === 's' ? 1 : 0) }]) : [];
  return (
    <svg className={`s2s-chart${className ? ` ${className}` : ''}`} viewBox={`${minX} ${minY} ${w} ${h}`} role="img"
      aria-label={`${chart.name} of the Bay of Biscay${ship ? `; the ship is ${ship.a >= 0 ? ship.a : -ship.a} step${Math.abs(ship.a) === 1 ? '' : 's'} ${ship.a >= 0 ? 'north-east' : 'south-west'} and ${ship.b} south of the start` : ''}`}>
      <rect x={minX} y={minY} width={w} height={h} rx="10" fill="#C9DCE0" />
      <rect x={minX + 4} y={minY + 4} width={w - 8} height={h - 8} rx="7" fill="none" stroke="#7E9CA6" strokeWidth="1" />
      {/* The ports: a strip of coast (or dark water, for the U-boats) along each edge. */}
      {([['navy', plymouth], ['spy', uboats], ['bm', lisbon]] as [Faction, Pos[]][]).map(([f, pts]) => (
        <g key={f} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={coast(pts)} stroke={f === 'spy' ? '#3F5560' : '#8C7444'} strokeWidth="30" />
          <path d={coast(pts)} stroke={f === 'spy' ? '#5C7680' : '#E3D3A8'} strokeWidth="27" />
        </g>
      ))}
      <g stroke="#7E9CA6" strokeWidth="1.2" strokeDasharray="2 2.5">{edges}</g>
      {resupply !== null && (() => {
        const a1 = chartXY({ a: -R + 0.5, b: resupply - 0.5 }), a2 = chartXY({ a: R - 0.5, b: resupply - 0.5 });
        return (
          <g>
            <path d={`M${a1.x} ${a1.y}L${a2.x} ${a2.y}`} stroke="#3F7A4E" strokeWidth="2.5" strokeDasharray="7 4" />
            <g transform={`translate(${maxX - 10} ${minY + 28})`}>
              <path d="M-86 0h18" stroke="#3F7A4E" strokeWidth="2.5" strokeDasharray="7 4" />
              <text x="0" y="0" textAnchor="end" dominantBaseline="central" fill="#3F7A4E" fontSize="7" fontWeight="800" fontFamily={SANS}>RESUPPLY LINE</text>
            </g>
          </g>
        );
      })()}
      {cells.map((p) => {
        const { x, y } = chartXY(p);
        const act = actionAt(chart, p);
        const start = p.a === 0 && p.b === 0;
        return (
          <g key={`${p.a},${p.b}`} transform={`translate(${x} ${y})`}>
            <circle r="12" fill={act ? '#FBF6EA' : '#E7EFEF'} stroke={act ? INK : '#7E9CA6'} strokeWidth={act ? 1.4 : 1} />
            {act && <g transform="translate(-8.5 -8.5) scale(.85)"><ActionGlyph kind={act} /></g>}
            {start && !act && <text textAnchor="middle" dominantBaseline="central" fill="#5C7680" fontSize="6" fontWeight="800" fontFamily={SANS}>START</text>}
            {act && <title>{ACTIONS[act].title}</title>}
          </g>
        );
      })}
      {heads.map(([d, q]) => {
        const u = chartXY(ship!), v = chartXY(q);
        const mx = u.x + (v.x - u.x) * 0.62, my = u.y + (v.y - u.y) * 0.62;
        return <g key={d} transform={`translate(${mx} ${my}) rotate(${d === 'ne' ? 45 + 18 : d === 'sw' ? 225 + 18 : 180}) scale(.55)`}><path d="M0-9.5L6.5-1.5H2.6V9H-2.6V-1.5H-6.5z" fill={DIR_COLOUR[d]} stroke={CREAM} strokeWidth="1" /></g>;
      })}
      <Port faction="navy" {...chartXY({ a: R, b: Math.floor(D / 2) })} />
      <Port faction="spy" {...chartXY({ a: -R, b: Math.floor(D / 2) })} />
      <Port faction="bm" {...chartXY({ a: 0, b: D })} />
      <g transform={`translate(${minX + 24} ${minY + 26})`}><Compass x={0} y={0} r={13} c="#4E6A74" /></g>
      <text x={maxX - 10} y={minY + 16} textAnchor="end" fill="#4E6A74" fontSize="8" fontWeight="800" letterSpacing="1" fontFamily={POSTER}>BAY OF BISCAY · 1943</text>
      {shipAt && (
        <g className="s2s-ship" transform={`translate(${shipAt.x} ${shipAt.y})`}>
          <ShipGlide at={shipAt}>
            <circle r="15" fill="#F2C84B" stroke={INK} strokeWidth="1.6" />
            <g transform="translate(-12 -13) scale(.6)"><Ship size={40} colour={INK} /></g>
          </ShipGlide>
        </g>
      )}
    </svg>
  );
}

/** The ship sails from its last spot to the new one (#28), not on arrival. */
function ShipGlide({ at, children }: { at: { x: number; y: number }; children: ReactNode }) {
  const ref = useRef<SVGGElement>(null);
  const was = useRef(at);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = at;
    const dx = from.x - at.x, dy = from.y - at.y;
    if (!dx && !dy) return;
    animate(ref.current, [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: `translate(${dx / 2}px, ${dy / 2}px) rotate(${dx > 0 ? -6 : 6}deg)`, offset: 0.5 },
      { transform: 'none' },
    ], { duration: 520, easing: 'ease-in-out' });
  }, [at.x, at.y]); // eslint-disable-line react-hooks/exhaustive-deps
  return <g ref={ref}>{children}</g>;
}

export { DIR_FACTION };
