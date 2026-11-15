import { useCallback, useState } from 'react';
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
  preset: PresetId | 'custom';
}

export type PresetId = 'default' | 'focus' | 'social';

export const PRESETS: Record<PresetId, { label: string; layout: Omit<Layout, 'preset'> }> = {
  default: { label: 'Default', layout: { top: 'full', seats: 'full', gallery: 'compact', side: 'full' } },
  focus: { label: 'Focus', layout: { top: 'compact', seats: 'compact', gallery: 'hidden', side: 'rail' } },
  social: { label: 'Social', layout: { top: 'full', seats: 'full', gallery: 'full', side: 'full' } },
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
  const [layout, setLayout] = useState<Layout>(() => readPref<Layout>(key, { ...PRESETS.default.layout, preset: 'default' }));

  const update = useCallback((next: Layout) => { setLayout(next); writePref(key, next); }, [key]);

  const set = useCallback(<K extends keyof Omit<Layout, 'preset'>>(k: K, v: Layout[K]) => {
    setLayout((cur) => { const next = { ...cur, [k]: v, preset: 'custom' as const }; writePref(key, next); return next; });
  }, [key]);

  const preset = useCallback((id: PresetId) => update({ ...PRESETS[id].layout, preset: id }), [update]);

  return { layout, set, preset };
}
