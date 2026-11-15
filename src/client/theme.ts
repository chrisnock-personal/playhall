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
}
