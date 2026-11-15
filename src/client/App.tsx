import { useEffect, useState } from 'react';
import { loadSession, saveSession, type Session } from './api';
import { SignIn } from './pages/SignIn';
import { Lobby } from './pages/Lobby';
import { RoomPage } from './room/RoomPage';

// Routes live in the #hash: #/ is the lobby, #/r/CODE a room.
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
  return <Lobby session={session} onSignOut={signOut} />;
}
