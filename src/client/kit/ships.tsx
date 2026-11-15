import type { ReactElement } from 'react';

// Top-down ships for Sea Battle, drawn for Playhall in the kit's muted
// palette. Each is drawn bow-right in a box `size` squares long and one
// square wide (100 units a square); vertical ships are the same drawing
// turned a quarter, bow down.

const HULL = '#8C96A3', DECK = '#A9B2BD', DARK = '#5E6672', LINE = '#4A515C';

function hull(len: number, beam = 38, bow = 70) {
  const t = 50 - beam, b = 50 + beam;
  return `M10 ${t + 8} Q10 ${t} 22 ${t} L${len - bow} ${t} Q${len - 22} ${t + 4} ${len - 8} 50 Q${len - 22} ${b - 4} ${len - bow} ${b} L22 ${b} Q10 ${b} 10 ${b - 8} Z`;
}

const Turret = ({ x, aim = 1 }: { x: number; aim?: 1 | -1 }) => (
  <g>
    <rect x={aim > 0 ? x : x - 46} y="46" width="46" height="8" rx="3" fill={DARK} />
    <circle cx={x} cy="50" r="17" fill={DARK} stroke={LINE} strokeWidth="3" />
  </g>
);

function Carrier() {
  return (
    <>
      <path d={hull(500, 42, 60)} fill={HULL} />
      <rect x="24" y="16" width="440" height="68" rx="6" fill={DECK} />
      <path d="M40 50 H440" stroke="#F4EFE4" strokeWidth="3" strokeDasharray="22 14" />
      <path d="M60 30 L420 30" stroke={LINE} strokeWidth="2" strokeDasharray="8 10" opacity=".5" />
      <rect x="300" y="6" width="80" height="22" rx="4" fill={DARK} />
      <rect x="330" y="0" width="16" height="12" rx="3" fill={LINE} />
    </>
  );
}

function Battleship() {
  return (
    <>
      <path d={hull(400)} fill={HULL} />
      <path d="M40 34 H300 Q330 34 340 50 Q330 66 300 66 H40 Z" fill={DECK} />
      <Turret x={300} />
      <Turret x={240} />
      <rect x="150" y="34" width="60" height="32" rx="6" fill={DARK} />
      <circle cx="180" cy="50" r="9" fill={LINE} />
      <Turret x={90} aim={-1} />
    </>
  );
}

function Cruiser() {
  return (
    <>
      <path d={hull(300, 34, 60)} fill={HULL} />
      <path d="M36 36 H210 Q235 36 245 50 Q235 64 210 64 H36 Z" fill={DECK} />
      <Turret x={210} />
      <rect x="120" y="36" width="44" height="28" rx="6" fill={DARK} />
      <ellipse cx="100" cy="50" rx="12" ry="9" fill={LINE} />
      <Turret x={64} aim={-1} />
    </>
  );
}

function Submarine() {
  return (
    <>
      <path d="M14 50 Q14 26 70 24 H230 Q284 26 292 50 Q284 74 230 76 H70 Q14 74 14 50 Z" fill={HULL} />
      <path d="M40 50 H270" stroke={DECK} strokeWidth="6" strokeLinecap="round" />
      <rect x="125" y="32" width="56" height="36" rx="18" fill={DARK} />
      <rect x="143" y="40" width="20" height="20" rx="6" fill={LINE} />
      <path d="M14 50 L4 36 M14 50 L4 64" stroke={DARK} strokeWidth="6" strokeLinecap="round" />
    </>
  );
}

function Destroyer() {
  return (
    <>
      <path d={hull(200, 30, 55)} fill={HULL} />
      <path d="M30 38 H130 Q150 38 158 50 Q150 62 130 62 H30 Z" fill={DECK} />
      <Turret x={135} />
      <rect x="62" y="40" width="34" height="20" rx="5" fill={DARK} />
      <ellipse cx="48" cy="50" rx="9" ry="7" fill={LINE} />
    </>
  );
}

const ART: Record<string, () => ReactElement> = { Carrier, Battleship, Cruiser, Submarine, Destroyer };

/** A ship drawn over a grid. `size` is its length in squares. */
export function ShipArt({ name, size, vertical, sunk, ghost, bad }: {
  name: string; size: number; vertical?: boolean; sunk?: boolean; ghost?: boolean; bad?: boolean;
}) {
  const Art = ART[name] ?? Destroyer;
  const len = size * 100;
  return (
    <svg
      className={`ship-art${sunk ? ' sunk' : ''}${ghost ? ' ghost' : ''}${bad ? ' bad' : ''}`}
      viewBox={vertical ? `0 0 100 ${len}` : `0 0 ${len} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g transform={vertical ? `translate(100 0) rotate(90)` : undefined}><Art /></g>
    </svg>
  );
}
