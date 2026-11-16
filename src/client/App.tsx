import { useEffect, useState } from 'react';
import { ChangePassword } from './ChangePassword';
import { Settings } from './pages/Settings';
import { loadSession, saveSession, type Session } from './api';
import { SignIn } from './pages/SignIn';
import { Lobby } from './pages/Lobby';
import { RoomPage } from './room/RoomPage';
import { Leaderboard } from './pages/Leaderboard';
import { PlayerStats } from './pages/PlayerStats';
import { Replay } from './pages/Replay';
import { Admin } from './pages/Admin';
import { CameraPage } from './camera/CameraPage';
import { api } from './api';

// Routes live in the #hash: #/ is the lobby, #/r/CODE a room, #/leaderboard,
// #/stats (your own), #/players/ID, #/settings (yours) and #/admin (the
// platform settings, admins only). #/camera/CODE?k=KEY is a camera table's
// board camera, opened from the host's link: no account needed.
function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const hash = useHash();
  const roomCode = /^#\/r\/([A-Za-z0-9]+)/.exec(hash)?.[1]?.toUpperCase() ?? null;

  const signIn = (s: Session) => { saveSession(s); setSession(s); };
  const signOut = () => { saveSession(null); setSession(null); };

  // Refresh who we are once per load (e.g. made an admin since signing in).
  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    api<{ user: Session['user'] }>('/auth/me', { token }).then(({ user }) => {
      setSession((s) => {
        if (!s || s.token !== token || JSON.stringify(s.user) === JSON.stringify(user)) return s;
        const next = { ...s, user };
        saveSession(next);
        return next;
      });
    }).catch(() => {});
  }, [token]);

  const camera = /^#\/camera\/([A-Za-z0-9]+)\?k=([^&]+)/.exec(hash);
  if (camera) {
    let key = '';
    try { key = decodeURIComponent(camera[2]); } catch { /* a broken link: the page says so */ }
    return <CameraPage key={key} code={camera[1].toUpperCase()} keyParam={key} />;
  }
  if (!session) return <SignIn onSignedIn={signIn} roomCode={roomCode} />;
  if (session.user.mustChangePassword) {
    return (
      <main className="settings-page">
        <h1>Choose a new password</h1>
        <section className="settings-card"><ChangePassword session={session} onChanged={signIn} required /></section>
        <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={signOut}>Sign out</button>
      </main>
    );
  }
  if (roomCode) return <RoomPage key={roomCode} code={roomCode} session={session} onSignOut={signOut} />;
  const replayId = /^#\/replay\/(\d+)/.exec(hash)?.[1];
  if (replayId) return <Replay key={replayId} session={session} onSignOut={signOut} id={replayId} />;
  if (hash.startsWith('#/leaderboard')) return <Leaderboard session={session} onSignOut={signOut} />;
  if (hash.startsWith('#/admin')) return <Admin session={session} onSignOut={signOut} />;
  if (hash.startsWith('#/settings')) return <Settings session={session} onSignOut={signOut} />;
  const player = /^#\/players\/([0-9a-f-]{36})/.exec(hash)?.[1];
  if (player || hash.startsWith('#/stats')) {
    const id = player ?? session.user.id;
    return <PlayerStats key={id} session={session} onSignOut={signOut} userId={id} />;
  }
  return <Lobby session={session} onSignOut={signOut} />;
}
