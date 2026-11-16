import type { ReactNode } from 'react';
import type { Outcome, Period } from '../shared/protocol';

// Avatar colours: picked from the user id so a person keeps their colour.
const COLOURS = ['#3A4F7A', '#6B3F5E', '#4B6B3F', '#7A3A3A', '#3F5E6B', '#7A5A3A', '#5A3F7A', '#3A5A4F'];

export function colourFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

export function Avatar({ name, id, size = 32, ring, dim }: { name: string; id: string; size?: number; ring?: boolean; dim?: boolean }) {
  return (
    <span
      className={`avatar${ring ? ' ring' : ''}${dim ? ' dim' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: colourFor(id) }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  micOff: <><path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.5 2.6M12 18v3M3 3l18 18" /></>,
  headphones: <><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><rect x="3" y="15" width="4" height="6" rx="1.5" /><rect x="17" y="15" width="4" height="6" rx="1.5" /></>,
  camera: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3z" /></>,
  cameraOff: <><path d="M10.5 6H14a2 2 0 0 1 2 2v3.5M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M16 10l6-3v10l-4.5-2.2M3 3l18 18" /></>,
  volume: <><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>,
  up: <path d="M18 15l-6-6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  left: <path d="M15 18l-6-6 6-6" />,
  right: <path d="M9 18l6-6-6-6" />,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  people: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  game: <><rect x="2" y="7" width="20" height="11" rx="5" /><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 14h.01" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  hand: <><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" /></>,
  send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  star: <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// The Playhall mark: a pawn walking into the hall (brand/mark.svg).
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#1B1E24" />
      <path d="M15 55V30a17 17 0 0 1 34 0v25" fill="none" stroke="#F0A53C" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="27.5" r="5.5" fill="#F6C27A" />
      <rect x="26.5" y="34" width="11" height="3" rx="1.5" fill="#F6C27A" />
      <path d="M29.3 37h5.4l2.6 9.5h-10.6z" fill="#F6C27A" />
      <rect x="23.5" y="46" width="17" height="4.5" rx="2" fill="#F6C27A" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <Mark size={size} />
      <span>Playhall</span>
    </span>
  );
}

const OUTCOME: Record<Outcome, [string, string]> = { win: ['W', 'Win'], draw: ['D', 'Draw'], loss: ['L', 'Loss'] };

/** W / D / L in a coloured square; the letter carries the meaning, not just the colour. */
export function OutcomeChip({ outcome, big }: { outcome: Outcome; big?: boolean }) {
  return <span className={`outcome ${outcome}${big ? ' big' : ''}`} title={OUTCOME[outcome][1]}>{OUTCOME[outcome][0]}</span>;
}

const PERIODS: [Period, string][] = [['week', 'This week'], ['month', 'This month'], ['all', 'All time']];

export function PeriodPicker({ value, onChange }: { value: Period; onChange(p: Period): void }) {
  return (
    <div className="segmented" role="group" aria-label="Period">
      {PERIODS.map(([id, label]) => (
        <button key={id} className={value === id ? 'on' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

export const perGame = (points: number, played: number) => (played ? (points / played).toFixed(2) : '-');
export const winPct = (w: number, played: number) => (played ? `${Math.round((100 * w) / played)}%` : '-');
