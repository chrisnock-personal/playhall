import type { Session } from './api';
import { Avatar, Logo } from './ui';

export type Section = 'rooms' | 'leaderboard' | 'stats';

const LINKS: [Section, string, string][] = [
  ['rooms', 'Rooms', '#/'],
  ['leaderboard', 'Leaderboards', '#/leaderboard'],
  ['stats', 'My stats', '#/stats'],
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
        <span className="muted hide-narrow">{session.user.name}{session.user.guest ? ' (guest)' : ''}</span>
        <Avatar name={session.user.name} id={session.user.id} size={34} />
        <button className="btn small" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}
