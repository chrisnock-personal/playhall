import type { Session } from './api';
import { Avatar, Logo } from './ui';
import { useTheme, type Theme } from './theme';

export type Section = 'rooms' | 'tournaments' | 'leaderboard' | 'stats' | 'settings' | 'admin';

const LINKS: [Section, string, string][] = [
  ['rooms', 'Rooms', '#/'],
  ['tournaments', 'Tournaments', '#/tournaments'],
  ['leaderboard', 'Leaderboards', '#/leaderboard'],
  ['stats', 'My stats', '#/stats'],
  ['settings', 'Settings', '#/settings'],
];
// Only admins see this one.
const ADMIN_LINK: [Section, string, string] = ['admin', 'Platform', '#/admin'];

export function AppBar({ session, onSignOut, active }: { session: Session; onSignOut(): void; active: Section | null }) {
  return (
    <header className="appbar">
      <a href="#/" className="logo-link" aria-label="Playhall: rooms"><Logo /></a>
      <nav className="appnav" aria-label="Main">
        {[...LINKS, ...(session.user.admin ? [ADMIN_LINK] : [])].map(([id, label, href]) => (
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
  const [theme, setTheme] = useTheme();
  return (
    <label className="theme-picker">
      <span className="sr-only">Theme</span>
      <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Theme">
        <option value="auto">Theme: system</option>
        <option value="light">Theme: light</option>
        <option value="dark">Theme: dark</option>
      </select>
    </label>
  );
}
