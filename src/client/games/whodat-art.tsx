// Who Dat?'s cast, drawn: each face built from its features (src/shared/
// games/whodat.ts) in one friendly cartoon style. Our own drawings.

import type { Face } from '../../shared/games/whodat';

const SKIN = ['#f6d2b4', '#e8b48f', '#c98e64', '#9c6644', '#6e4630', '#f1c7a5'];
const TOP = ['#e2574c', '#2f8fa8', '#f0a53c', '#7b5cc4', '#3f9a5a', '#d9658f'];
const HAIR: Record<Face['hair'], string> = { black: '#2b2228', brown: '#7a4b2a', blonde: '#e8c25c', red: '#d2622f', grey: '#b9b6b2', none: '#5a4030' };
const EYES: Record<Face['eyes'], string> = { brown: '#5b3a24', blue: '#3a7fc4', green: '#3f9a5a' };

/** A face, 120 x 130, scaled to fit its box. */
export function FaceArt({ face, title }: { face: Face; title?: string }) {
  const hc = HAIR[face.hair], s = SKIN[face.skin % SKIN.length], has = (x: Face['extras'][number]) => face.extras.includes(x);
  return (
    <svg viewBox="0 0 120 130" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {face.cut === 'long' && <path d="M24 56c0-30 18-44 36-44s36 14 36 44v54H24z" fill={hc} />}
      <rect x="50" y="88" width="20" height="20" fill={s} />
      <path d="M22 130c4-22 20-28 38-28s34 6 38 28z" fill={TOP[face.top % TOP.length]} />
      {has('scarf') && <><path d="M40 96q20 10 40 0l4 10q-24 12-48 0z" fill="#c2453a" /><path d="M66 102l6 22 8-2-6-20z" fill="#c2453a" /></>}
      <ellipse cx="60" cy="62" rx="30" ry="34" fill={s} />
      <ellipse cx="30" cy="64" rx="5" ry="8" fill={s} /><ellipse cx="90" cy="64" rx="5" ry="8" fill={s} />
      {face.cut === 'short' && <path d="M30 52c0-22 14-32 30-32s30 10 30 32c-8-10-20-14-30-14s-22 4-30 14z" fill={hc} />}
      {face.cut === 'long' && <path d="M30 54c0-24 14-34 30-34s30 10 30 34c-6-12-18-18-30-18s-24 6-30 18z" fill={hc} />}
      {has('freckles') && [[44, 70], [49, 72], [71, 72], [76, 70], [47, 67], [73, 67]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" fill="#a0522d" />)}
      <circle cx="48" cy="60" r="5" fill="#fff" /><circle cx="72" cy="60" r="5" fill="#fff" />
      <circle cx="48" cy="61" r="3" fill={EYES[face.eyes]} /><circle cx="72" cy="61" r="3" fill={EYES[face.eyes]} />
      <path d="M41 50q7-4 14 0M65 50q7-4 14 0" stroke={hc} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M60 64q-3 8 0 9" stroke="rgba(0,0,0,.25)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {has('smile')
        ? <><path d="M48 78q12 12 24 0z" fill="#8a2b2b" /><path d="M50 78h20" stroke="#fff" strokeWidth="2" /></>
        : <path d="M50 80q10 4 20 0" stroke="#8a2b2b" strokeWidth="3" fill="none" strokeLinecap="round" />}
      {has('beard') && <><path d="M32 70c4 24 16 32 28 32s24-8 28-32c-6 8-14 10-28 10s-22-2-28-10z" fill={hc} /><path d="M50 80q10 3 20 0" stroke="#8a2b2b" strokeWidth="3" fill="none" /></>}
      {has('glasses') && <g fill="none" stroke="#2a2238" strokeWidth="2.5"><circle cx="48" cy="60" r="9" /><circle cx="72" cy="60" r="9" /><path d="M57 60h6M39 58l-8-2M81 58l8-2" /></g>}
      {has('earrings') && <><circle cx="30" cy="75" r="3.5" fill="#f0c43c" stroke="#a87a0c" /><circle cx="90" cy="75" r="3.5" fill="#f0c43c" stroke="#a87a0c" /></>}
      {has('hat') && <><path d="M22 40q38-12 76 0l-4 6q-34-8-68 0z" fill="#3a3448" /><path d="M36 40c0-16 10-24 24-24s24 8 24 24z" fill="#3a3448" /><path d="M36 36h48v5H36z" fill="#e2574c" /></>}
    </svg>
  );
}

/** A face card on the board: the face and name, or its back when flipped down. */
export function FaceCard({ face, down, onClick, label, highlight }: { face: Face; down?: boolean; onClick?(): void; label?: string; highlight?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`wd-face${down ? ' down' : ''}${highlight ? ' hl' : ''}`} onClick={onClick} aria-label={label ?? `${face.name}${down ? ', flipped down' : ''}`} {...(onClick ? { type: 'button' as const } : {})}>
      <span className="wd-inner">
        <span className="wd-front"><FaceArt face={face} /><span className="wd-name">{face.name}</span></span>
        <span className="wd-back" aria-hidden="true">?</span>
      </span>
    </Tag>
  );
}
