// Manor Mystery's pieces, drawn inline: the cards in the kit's 70 × 100 frame
// (suspects: deep red band and a round portrait; objects: blue band and a
// line drawing; rooms: green band and the plan with the room lit), the dark
// wood back, and the sealed envelope. Our own drawings (docs/manor-mystery.md).

import type { ReactNode } from 'react';
import { CARDS, ROOMS, type CardId, type Kind } from '../../shared/games/manormystery';

export const BAND: Record<Kind, string> = { suspect: '#8E2430', object: '#2F5D8A', room: '#3B7A4C' };
const INK = '#2A2219';
const FACE = '#FBF8F1';

/** Head and shoulders in a round frame; each suspect has their own features. */
function Portrait({ id }: { id: CardId }) {
  const skin: Record<string, string> = { hale: '#E8C4A0', okafor: '#7A4A2E', vane: '#F0D2B8', pike: '#E2B896', rowe: '#F2D6BE', ashby: '#D9B08C' };
  const coat: Record<string, string> = { hale: '#1F2E4A', okafor: '#5B5F66', vane: '#6A2C4A', pike: '#1A1A1A', rowe: '#3E6A5A', ashby: '#1A1A1A' };
  const extra: Record<string, ReactNode> = {
    // A peaked naval cap and a white beard.
    hale: <><path d="M26 47h18l-2-7h-14z" fill="#1F2E4A" /><rect x="24" y="46" width="22" height="2.6" rx="1" fill="#111" /><circle cx="35" cy="43" r="1.6" fill="#E3B341" /><path d="M28.5 55q6.5 4 13 0q0 9-6.5 10q-6.5-1-6.5-10z" fill="#FFFFFF" stroke="#9C9488" strokeWidth=".5" /><path d="M24 76l3-6M46 76l-3-6" stroke="#E3B341" strokeWidth="1.4" /></>,
    // Round spectacles and a stethoscope.
    okafor: <><path d="M28 47q7-6 14 0v-2q-7-5-14 0z" fill="#1A1A1A" /><circle cx="31.5" cy="53" r="2.6" fill="none" stroke="#E3B341" strokeWidth=".9" /><circle cx="38.5" cy="53" r="2.6" fill="none" stroke="#E3B341" strokeWidth=".9" /><path d="M34.1 53h1.8" stroke="#E3B341" strokeWidth=".9" /><path d="M30 68q5 10 10 0" fill="none" stroke="#C9CDD5" strokeWidth="1.3" /><circle cx="35" cy="73" r="1.6" fill="#C9CDD5" /></>,
    // A wide hat with a feather, and pearls.
    vane: <><ellipse cx="35" cy="46" rx="14" ry="3" fill="#3A1426" /><path d="M28 46q7-9 14 0z" fill="#3A1426" /><path d="M41 44q8-12 11-5q-5 0-10 6z" fill="#3F8F64" stroke="#1F4A33" strokeWidth=".5" /><path d="M29 66q6 4 12 0" fill="none" stroke="#F4F1EA" strokeWidth="1.6" strokeDasharray="1.4 .9" /></>,
    // Bald with side whiskers and a bow tie.
    pike: <><path d="M28.5 50q-1 6 1.5 8M41.5 50q1 6-1.5 8" stroke="#8A8A8A" strokeWidth="2" fill="none" /><path d="M31 66l4 2-4 2zM39 66l-4 2 4 2z" fill="#F4F1EA" /><path d="M32 66l3 2 3-2v4l-3-2-3 2z" fill="#F4F1EA" /></>,
    // Hair up in a bun, a high lace collar.
    rowe: <><circle cx="35" cy="42.5" r="4" fill="#7A4A22" /><path d="M27.5 53q0-9 7.5-9t7.5 9q-2-6-7.5-6t-7.5 6z" fill="#7A4A22" /><path d="M30 64h10l-1 3h-8z" fill="#F4F1EA" /></>,
    // Grey hair and a clerical collar.
    ashby: <><path d="M27.5 51q0-8 7.5-8t7.5 8q-1-4-3-5q-4 2-9 0q-2 1-3 5z" fill="#B8B8B8" /><rect x="32" y="64" width="6" height="3" rx="1" fill="#F4F1EA" /></>,
  };
  return (
    <g>
      <clipPath id={`mm-p-${id}`}><circle cx="35" cy="57" r="23" /></clipPath>
      <circle cx="35" cy="57" r="23" fill="#EFE3CC" />
      <g clipPath={`url(#mm-p-${id})`}>
        <path d="M14 82q2-18 21-18t21 18z" fill={coat[id]} />
        <rect x="31.5" y="58" width="7" height="8" fill={skin[id]} />
        <ellipse cx="35" cy="52" rx="7.5" ry="8.5" fill={skin[id]} />
        {extra[id]}
      </g>
      <circle cx="35" cy="57" r="23" fill="none" stroke={BAND.suspect} strokeWidth="1.5" />
    </g>
  );
}

/** A line drawing of each object. */
function Drawing({ id }: { id: CardId }) {
  const p = { fill: 'none', stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const art: Record<string, ReactNode> = {
    hatpin: <><path d="M22 76L47 38" {...p} /><circle cx="48.5" cy="35.5" r="4" fill="#E8E2D2" stroke={INK} strokeWidth="1.4" /><path d="M46 36.5l2 1" {...p} strokeWidth=".8" /></>,
    decanter: <><path d="M31 36h8M32 36q0 4 1 6l-9 12q-3 6 0 13q3 7 11 7t11-7q3-7 0-13l-9-12q1-2 1-6" {...p} /><path d="M33 31h4v5h-4z" {...p} /><circle cx="35" cy="29" r="2.4" {...p} /><path d="M25 60h20" {...p} strokeWidth=".9" /></>,
    fireiron: <><path d="M30 34q-6 0-6 5t6 5q4 0 5-3" {...p} /><path d="M35 41L42 76" {...p} strokeWidth="2.2" /><path d="M42 76l-4 2M41 72l4-1" {...p} /></>,
    mallet: <><path d="M44 33L30 70" {...p} strokeWidth="2.2" /><rect x="19" y="68" width="22" height="9" rx="2" transform="rotate(-20 30 72.5)" {...p} /><path d="M24 67l2 7M34 63l2 8" {...p} strokeWidth=".9" transform="rotate(-20 30 72.5)" /></>,
    rope: <><ellipse cx="35" cy="62" rx="14" ry="8" {...p} /><ellipse cx="35" cy="59" rx="10" ry="5.5" {...p} /><ellipse cx="35" cy="56.5" rx="6" ry="3.2" {...p} /><path d="M49 62q4 6-2 12q-4 4-1 8" {...p} /></>,
    telescope: <><path d="M20 62l9-4 3 7-9 4z" {...p} /><path d="M29 58l11-5 3 8-11 5z" {...p} /><path d="M40 53l10-5 4 10-10 5z" {...p} /><path d="M37 63l-6 14M37 63l3 15M37 63l9 12" {...p} strokeWidth="1.1" /></>,
  };
  return <g>{art[id]}</g>;
}

/** The hall's 3 × 3 plan with one room lit. */
export function Plan({ lit, x = 17, y = 39, size = 36, fill = BAND.room }: { lit: CardId | null; x?: number; y?: number; size?: number; fill?: string }) {
  const cell = size / 3;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill="#EFE3CC" stroke={INK} strokeWidth="1.4" />
      {ROOMS.map((r, i) => (
        <rect key={r} x={x + (i % 3) * cell + 1} y={y + Math.floor(i / 3) * cell + 1} width={cell - 2} height={cell - 2}
          fill={r === lit ? fill : 'none'} stroke={INK} strokeWidth=".6" />
      ))}
    </g>
  );
}

/** The back: dark wood, the logo's arch and a magnifying glass. */
function Back() {
  return (
    <>
      <rect x="1" y="1" width="68" height="98" rx="7" fill="#3E2716" stroke="#A97F57" strokeWidth="2" />
      {[14, 27, 41, 56, 70, 84].map((yy, i) => <path key={yy} d={`M4 ${yy}q16 ${i % 2 ? 3 : -3} 31 0t31 0`} fill="none" stroke="#5A3A22" strokeWidth="1.2" />)}
      <rect x="6" y="6" width="58" height="88" rx="4" fill="none" stroke="#8A6440" strokeWidth="1" />
      <path d="M22 70V48a13 13 0 0 1 26 0v22" fill="none" stroke="#E6D5B3" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="33" cy="55" r="7" fill="none" stroke="#F0A53C" strokeWidth="2.4" />
      <path d="M38 60l6 6" stroke="#F0A53C" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

/** One card, 70 × 100 like the kit's; `id` null shows the back. */
export function ManorCard({ id, width = 70, raised, dim, className }: { id: CardId | null; width?: number; raised?: boolean; dim?: boolean; className?: string }) {
  const c = id ? CARDS[id] : null;
  return (
    <svg className={`playing-card mm-card${raised ? ' raised' : ''}${dim ? ' dim' : ''}${className ? ` ${className}` : ''}`} width={width} height={(width * 100) / 70}
      viewBox="0 0 70 100" role="img" aria-label={c ? `${c.title} (${c.kind})` : 'A face-down card'}>
      {c && id ? (
        <>
          <rect x="1" y="1" width="68" height="98" rx="7" fill={FACE} stroke="#C9C1B2" strokeWidth="1.5" />
          <path d="M1.75 8a6.25 6.25 0 0 1 6.25-6.25h54a6.25 6.25 0 0 1 6.25 6.25v17h-66.5z" fill={BAND[c.kind]} />
          <text x="35" y="15" textAnchor="middle" dominantBaseline="central" fill="#FBF8F1" fontSize={c.title.length > 11 ? 6.4 : 7.6} fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif">{c.title}</text>
          {c.kind === 'suspect' ? <Portrait id={id} /> : c.kind === 'object' ? <Drawing id={id} /> : <Plan lit={id} />}
          <text x="35" y="92" textAnchor="middle" fill={BAND[c.kind]} fontSize="5.5" fontWeight="700" letterSpacing=".8"
            fontFamily="Inter, system-ui, sans-serif">{c.kind.toUpperCase()}</text>
        </>
      ) : <Back />}
    </svg>
  );
}

/** The case file: sealed with a red "B", or open at the end. */
export function Envelope({ open, width = 64 }: { open?: boolean; width?: number }) {
  return (
    <svg className="mm-envelope" width={width} height={(width * 44) / 64} viewBox="0 0 64 44" role="img" aria-label={open ? 'The opened envelope' : 'The sealed envelope'}>
      <rect x="1" y="5" width="62" height="38" rx="3" fill="#E6D5B3" stroke="#8A6440" strokeWidth="1.2" />
      <path d="M1.6 40L26 22M62.4 40L38 22" stroke="#C9B48E" strokeWidth="1" fill="none" />
      {open
        ? <path d="M1.6 6.5L32 -10L62.4 6.5" fill="#D9C49C" stroke="#8A6440" strokeWidth="1.2" />
        : <><path d="M1.6 6.5L32 27L62.4 6.5" fill="#D9C49C" stroke="#8A6440" strokeWidth="1.2" />
          <circle cx="32" cy="26" r="7" fill="#A3262E" stroke="#6E141A" strokeWidth="1" />
          <text x="32" y="26.5" textAnchor="middle" dominantBaseline="central" fill="#F4E4D0" fontSize="9" fontWeight="800" fontFamily="Georgia, serif">B</text></>}
    </svg>
  );
}
