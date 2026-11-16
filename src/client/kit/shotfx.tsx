import { useLayoutEffect, useRef } from 'react';
import { animate } from './motion';
import { TIMING } from './cues';

/** A Sea Battle shot landing (#28): a missile arcs in from the near edge of
 *  the board to `cell`, then a flash and smoke for a hit (bigger when it
 *  sinks a ship) or a splash ring for a miss. Place it in a box the size of
 *  the grid (square 0 bottom left, as the kit's board draws it); it calls
 *  onDone when it has finished. */
export function ShotFx({ cell, size, kind, onDone }: { cell: number; size: number; kind: 'hit' | 'sink' | 'miss'; onDone(): void }) {
  const box = useRef<HTMLDivElement>(null);
  const missile = useRef<SVGSVGElement>(null);
  const col = cell % size, row = size - 1 - Math.floor(cell / size);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    const cellPx = box.current?.getBoundingClientRect().width ?? 0;
    // From the middle of the board's bottom edge, in an arc, to the square.
    const sx = (size / 2 - (col + 0.5)) * cellPx, sy = (size - (row + 0.5)) * cellPx;
    const h = Math.max(cellPx * 1.5, Math.hypot(sx, sy) * 0.35);
    const N = 10;
    const frames: Keyframe[] = Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      const x = sx * (1 - t), y = sy * (1 - t) - h * 4 * t * (1 - t);
      const angle = Math.atan2(-sy - h * 4 * (1 - 2 * t), -sx) * (180 / Math.PI);
      return { transform: `translate(${x}px, ${y}px) rotate(${angle}deg)`, opacity: i === N ? 0 : 1 };
    });
    animate(missile.current, frames, { duration: TIMING.shot, easing: 'linear' });
    const t = setTimeout(() => done.current(), TIMING.shot + 520);
    return () => clearTimeout(t);
  }, [cell, col, row, size]);
  return (
    <div ref={box} className={`shot-fx ${kind}`} aria-hidden="true"
      style={{ left: `${(col * 100) / size}%`, top: `${(row * 100) / size}%`, width: `${100 / size}%`, height: `${100 / size}%`, ['--land' as string]: `${TIMING.shot}ms` }}>
      <svg ref={missile} className="missile" viewBox="0 0 40 40">
        <path d="M4 17h22l9 3-9 3H4z" fill="#D9DDE2" stroke="#4A515C" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6 17l-3-5h5l4 5M6 23l-3 5h5l4-5" fill="#8C96A3" />
        <path d="M2 20h-2" stroke="#F7B23B" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {kind === 'miss' ? (
        <>
          <span className="ring" /><span className="ring r2" />
          <span className="drop-fx d1" /><span className="drop-fx d2" /><span className="drop-fx d3" />
        </>
      ) : (
        <>
          <span className="flash" /><span className="smoke" /><span className="smoke s2" />{kind === 'sink' && <span className="smoke s3" />}
        </>
      )}
    </div>
  );
}
