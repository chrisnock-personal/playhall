import { useEffect, useState } from 'react';

// Light, dark, or whatever the system prefers (the default). Remembered on
// this device only.
export type Theme = 'auto' | 'light' | 'dark';

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem('playhall.theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(t: Theme): void {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('playhall.theme', t); } catch { /* this session only */ }
  window.dispatchEvent(new CustomEvent('playhall-theme', { detail: t }));
}

/** The current theme, kept in step across every picker on the page. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const on = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener('playhall-theme', on);
    return () => window.removeEventListener('playhall-theme', on);
  }, []);
  return [theme, applyTheme];
}
