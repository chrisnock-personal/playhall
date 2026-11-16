import type { Session } from './api';
import { useState } from 'react';
import { Avatar, Logo } from './ui';
import { applyTheme, readTheme, type Theme } from './theme';

export type Section = 'rooms' | 'leaderboard' | 'stats' | 'settings';

const LINKS: [Section, string, string][] = [
  ['rooms', 'Rooms', '#/'],
  ['leaderboard', 'Leaderboards', '#/leaderboard'],
  ['stats', 'My stats', '#/stats'],
  ['settings', 'Settings', '#/settings'],
];

export function AppBar({ session, onSignOut, active }: { session: Session; onSignOut(): void; active: Section | null }) {
  return (
    <header className="appbar">
      <a href="#/" className="logo-link" aria-label="Playhall: rooms"><Logo /></a>
      <nav className="appnav" aria-label="Main">
        {LINKS.map(([id, label, href]) => (
          <a key={id} href={href} className={active === id ? 'on' : ''} aria-current={active === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      <div className="appbar-right">
        <ThemePicker />
        <span className="muted hide-narrow">{session.user.name}{session.user.guest ? ' (guest)' : ''}</span>
        <Avatar name={session.user.name} id={session.user.id} size={34} />
        <button className="btn small" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  return (
    <label className="theme-picker">
      <span className="sr-only">Theme</span>
      <select value={theme} onChange={(e) => { const t = e.target.value as Theme; setTheme(t); applyTheme(t); }} aria-label="Theme">
        <option value="auto">Theme: system</option>
        <option value="light">Theme: light</option>
        <option value="dark">Theme: dark</option>
      </select>
    </label>
  );
}
