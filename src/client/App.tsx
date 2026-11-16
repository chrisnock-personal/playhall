import { useEffect, useState } from 'react';
import { Settings } from './pages/Settings';
import { loadSession, saveSession, type Session } from './api';
import { SignIn } from './pages/SignIn';
import { Lobby } from './pages/Lobby';
import { RoomPage } from './room/RoomPage';
import { Leaderboard } from './pages/Leaderboard';
import { PlayerStats } from './pages/PlayerStats';
import { Replay } from './pages/Replay';

// Routes live in the #hash: #/ is the lobby, #/r/CODE a room, #/leaderboard,
// #/stats (your own), #/players/ID and #/settings.
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

  if (!session) return <SignIn onSignedIn={signIn} roomCode={roomCode} />;
  if (roomCode) return <RoomPage key={roomCode} code={roomCode} session={session} onSignOut={signOut} />;
  const replayId = /^#\/replay\/(\d+)/.exec(hash)?.[1];
  if (replayId) return <Replay key={replayId} session={session} onSignOut={signOut} id={replayId} />;
  if (hash.startsWith('#/leaderboard')) return <Leaderboard session={session} onSignOut={signOut} />;
  if (hash.startsWith('#/settings')) return <Settings session={session} onSignOut={signOut} />;
  const player = /^#\/players\/([0-9a-f-]{36})/.exec(hash)?.[1];
  if (player || hash.startsWith('#/stats')) {
    const id = player ?? session.user.id;
    return <PlayerStats key={id} session={session} onSignOut={signOut} userId={id} />;
  }
  return <Lobby session={session} onSignOut={signOut} />;
}
