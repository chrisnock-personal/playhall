// Short table animations (#28), shared by every game: tokens walking a
// path, pieces hopping, cards and chips flying from the deck or the pot,
// and things that show for a moment (a shuffle, a splash). All of them are
// driven by a change in the game's view, so everyone sees the same thing
// when the change reaches them (watchers on a delay see it later). Nothing
// moves on arrival, only for changes seen while the page is open. With the
// system's "reduce motion" setting everything is instant, as before.
//
// CSS and the Web Animations API only; the timings come from cues.ts so the
// sounds land with them.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { pathTime, TIMING } from './cues';
import './motion.css';

const QUERY = '(prefers-reduced-motion: reduce)';
const mql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);

/** The system asks for less motion. */
export function reducedMotion(): boolean {
  return !!mql()?.matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = mql();
      if (!m) return () => {};
      m.addEventListener?.('change', fn);
      return () => m.removeEventListener?.('change', fn);
    },
    reducedMotion,
    () => false,
  );
}

/** The value from the previous render (undefined on the first). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<{ cur: T | undefined; prev: T | undefined }>({ cur: undefined, prev: undefined });
  if (ref.current.cur !== value) ref.current = { prev: ref.current.cur, cur: value };
  return ref.current.prev;
}

/** False while a stage first renders (the state it arrived to), true
 *  afterwards: pieces that appear later are new and may animate in. Call it
 *  in the stage (which stays mounted) and pass it down as `live`. */
export function useLive(): boolean {
  const live = useRef(false);
  useEffect(() => { live.current = true; }, []);
  return live.current;
}

/** Runs a Web Animation unless motion is reduced or the browser lacks it. */
export function animate(el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || reducedMotion() || typeof (el as HTMLElement).animate !== 'function') return null;
  try { return (el as HTMLElement).animate(frames, opts); } catch { return null; }
}

/** True for `ms` after `play` changes (never for the first render). */
export function useTransient(play: unknown, ms: number): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (play === undefined || play === null || reducedMotion()) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => { clearTimeout(t); setOn(false); };
  }, [play, ms]);
  return on;
}

// ---- tokens on a board ----

export type Point = [number, number];

/** A token placed by left/top (in % of its board) that walks `path` (the
 *  same units, start to end) each time `play` changes. `hop` lifts it at
 *  each step, for a token stepping square by square (a number: only the
 *  first that many steps, so it can glide up a ladder after its walk). */
export function Mover({ x, y, path, play, delay = 0, duration = TIMING.path, hop, base = 'translate(-50%, -62%)', className, children }: {
  x: number; y: number; path?: Point[] | null; play?: unknown; delay?: number; duration?: number; hop?: boolean | number;
  base?: string; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  const pathRef = useRef(path);
  pathRef.current = path;
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const p = pathRef.current;
    if (!p || p.length < 2) return;
    animate(ref.current, pathFrames(p, base, hop), { duration: pathTime(p.length - 1, duration), delay, easing: 'linear', fill: 'backwards' });
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={`mover ${className ?? ''}`} style={{ left: `${x}%`, top: `${y}%` }}>{children}</span>;
}

/** Keyframes for a path: a frame per point (and a lifted one between, for hops). */
export function pathFrames(p: Point[], base: string, hop?: boolean | number): Keyframe[] {
  const hops = hop === true ? p.length : hop || 0;
  const n = p.length - 1;
  const frames: Keyframe[] = [];
  p.forEach(([px, py], i) => {
    frames.push({ left: `${px}%`, top: `${py}%`, transform: base, offset: i / n, easing: 'ease-in-out' });
    if (i < Math.min(n, hops)) {
      const [qx, qy] = p[i + 1];
      frames.push({ left: `${(px + qx) / 2}%`, top: `${(py + qy) / 2}%`, transform: `${base} translateY(-30%) scale(1.12)`, offset: (i + 0.5) / n });
    }
  });
  return frames;
}

/** A piece that hops into its square from earlier squares (checkers), when
 *  it appears there while `live` (the stage's useLive()) or `play` changes.
 *  `hops` are the squares it came through, in square units from here
 *  ([columns right, rows down]), first to last. Fills its square. */
export function Hop({ hops, play, live, step = TIMING.hop, children }: { hops: Point[]; play: unknown; live: boolean; step?: number; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const hopsRef = useRef(hops);
  hopsRef.current = hops;
  useLayoutEffect(() => {
    if (!live) return;
    const h = hopsRef.current;
    if (h.length < 1) return;
    const pts: Point[] = [...h, [0, 0]];
    const frames: Keyframe[] = [];
    const n = pts.length - 1;
    pts.forEach(([dx, dy], i) => {
      frames.push({ transform: `translate(${dx * 100}%, ${dy * 100}%)`, offset: i / n });
      if (i < n) {
        const [ex, ey] = pts[i + 1];
        frames.push({ transform: `translate(${((dx + ex) / 2) * 100}%, ${((dy + ey) / 2) * 100}%) scale(1.22)`, offset: (i + 0.5) / n });
      }
    });
    animate(ref.current, frames, { duration: step * n, easing: 'ease-in-out' });
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className="hop">{children}</span>;
}

// ---- cards and chips ----

/** The element marked data-fly="name" (the deck, the pot, a seat). */
function flySpot(name: string): Element | null {
  try { return document.querySelector(`[data-fly="${CSS.escape(name)}"]`); } catch { return null; }
}

function centre(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** How far `el` is from the data-fly spot `name`, in px (spot minus el). */
function offsetTo(el: Element, name: string | undefined): { x: number; y: number } | null {
  const spot = name ? flySpot(name) : null;
  if (!spot) return null;
  const a = centre(el), b = centre(spot);
  return { x: b.x - a.x, y: b.y - a.y };
}

/** Something that flies in from the data-fly spot `from` (a card from the
 *  deck, a chip from a stack): when it appears while `live` (the stage's
 *  useLive(), so not what was there on arrival), and each time `play` changes. `flip` turns it face up as
 *  it lands. */
export function FlyIn({ from, play, live, delay = 0, flip, className, style, children }: {
  from: string; play?: unknown; live: boolean; delay?: number; flip?: boolean; className?: string; style?: CSSProperties; children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (isFirst ? !live : play === undefined) return;
    const el = ref.current;
    if (!el) return;
    const d = offsetTo(el, from) ?? { x: 0, y: -40 };
    const start = `translate(${d.x}px, ${d.y}px) scale(.7)`;
    const frames: Keyframe[] = flip
      ? [{ transform: `${start} scaleX(.2)`, opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: 'translate(0, 0) scale(1) scaleX(.05)', offset: 0.7 }, { transform: 'none', opacity: 1 }]
      : [{ transform: start, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: 'none', opacity: 1 }];
    animate(el, frames, { duration: TIMING.fly + (flip ? 80 : 0), delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className={`fly ${className ?? ''}`} style={style}>{children}</span>;
}

/** A copy of something that shows only while it flies, each time `play`
 *  changes: from the spot `from` to here, or from here to the spot `to`
 *  (chips to the pot, the pot to the winner). Takes no room in the layout. */
export function Ghost({ play, from, to, delay = 0, children }: { play: unknown; from?: string; to?: string; delay?: number; children: ReactNode }) {
  const duration = TIMING.fly + 120;
  const on = useTransient(play, duration + delay + 60);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!on) return;
    const el = ref.current;
    if (!el) return;
    const d = offsetTo(el, from ?? to);
    if (!d) { el.style.display = 'none'; return; }
    const away = `translate(calc(-50% + ${d.x}px), calc(-50% + ${d.y}px)) scale(.85)`, here = 'translate(-50%, -50%)';
    const frames: Keyframe[] = from
      ? [{ transform: away, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: here, opacity: 1, offset: 0.85 }, { transform: here, opacity: 0 }]
      : [{ transform: here, opacity: 1 }, { opacity: 1, offset: 0.8 }, { transform: away, opacity: 0 }];
    animate(el, frames, { duration, delay, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'both' });
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!on) return null;
  return <span className="ghost-anchor" aria-hidden="true"><span ref={ref} className="ghost-fly">{children}</span></span>;
}

/** A piece that fades away where it stood (a captured checker): shows for a
 *  moment when it appears while `live`. */
export function FadeOut({ live, delay = 0, children }: { live: boolean; delay?: number; children: ReactNode }) {
  const [on, setOn] = useState(() => live && !reducedMotion());
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setOn(false), delay + 280);
    return () => clearTimeout(t);
  }, [on, delay]);
  if (!on) return null;
  return <span className="fade-out" aria-hidden="true" style={{ animationDelay: `${delay}ms` }}>{children}</span>;
}
