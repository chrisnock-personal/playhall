import { useCallback, useEffect, useState } from 'react';
import { readPref, writePref } from '../api';

// Every panel around the stage can be expanded, compact or hidden; the game
// itself always gets the space left over. The layout is remembered per game
// type, on this device.

export type Panel3 = 'full' | 'compact' | 'hidden';
export type SidePanelState = 'full' | 'rail' | 'hidden';

export interface Layout {
  top: 'full' | 'compact';
  seats: Panel3;
  gallery: Panel3;
  side: SidePanelState;
  /** How much room video gets: normal seat tiles, or bigger ones (Social).
   *  Focus shrinks the seats to small round tiles instead. */
  video: VideoSize;
  preset: PresetId | 'custom';
}

export type VideoSize = 'normal' | 'big';

export type PresetId = 'default' | 'focus' | 'social';

export const PRESETS: Record<PresetId, { label: string; layout: Omit<Layout, 'preset'> }> = {
  default: { label: 'Default', layout: { top: 'full', seats: 'full', gallery: 'compact', side: 'full', video: 'normal' } },
  focus: { label: 'Focus', layout: { top: 'compact', seats: 'compact', gallery: 'hidden', side: 'rail', video: 'normal' } },
  social: { label: 'Social', layout: { top: 'full', seats: 'full', gallery: 'full', side: 'full', video: 'big' } },
};

export const NEXT: {
  seats: Record<Panel3, Panel3>;
  gallery: Record<Panel3, Panel3>;
  side: Record<SidePanelState, SidePanelState>;
  top: Record<Layout['top'], Layout['top']>;
} = {
  seats: { full: 'compact', compact: 'hidden', hidden: 'full' },
  gallery: { full: 'compact', compact: 'hidden', hidden: 'compact' },
  side: { full: 'rail', rail: 'hidden', hidden: 'full' },
  top: { full: 'compact', compact: 'full' },
};

export function useLayout(gameId: string) {
  const key = `layout.${gameId}`;
  // Layouts saved before video existed have no `video`: fill it in.
  const [layout, setLayout] = useState<Layout>(() => ({ ...PRESETS.default.layout, preset: 'default', ...readPref<Partial<Layout>>(key, {}) }));

  const update = useCallback((next: Layout) => { setLayout(next); writePref(key, next); }, [key]);

  const set = useCallback(<K extends keyof Omit<Layout, 'preset'>>(k: K, v: Layout[K]) => {
    setLayout((cur) => { const next = { ...cur, [k]: v, preset: 'custom' as const }; writePref(key, next); return next; });
  }, [key]);

  const preset = useCallback((id: PresetId) => update({ ...PRESETS[id].layout, preset: id }), [update]);

  return { layout, set, preset };
}

/** Whether a media query matches, following window resizes. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(query);
    const change = () => setOn(m.matches);
    change();
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, [query]);
  return on;
}

/** Windows narrower than this (but wider than a phone, where the panels
 *  stack) show an expanded chat panel as a rail until it's opened. */
export const SMALL_WINDOW = '(min-width: 901px) and (max-width: 1599px)';
