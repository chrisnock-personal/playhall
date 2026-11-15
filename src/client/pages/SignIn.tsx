import { useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from '../api';
import { Logo } from '../ui';

type Mode = 'guest' | 'signin' | 'register';

export function SignIn({ onSignedIn, roomCode }: { onSignedIn(s: Session): void; roomCode: string | null }) {
  // Someone arriving from an invite link most likely wants in quickly.
  const [mode, setMode] = useState<Mode>(roomCode ? 'guest' : 'signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);

  useEffect(() => {
    api<{ allowSignup: boolean }>('/auth/options').then((o) => setAllowSignup(o.allowSignup)).catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === 'guest' ? '/auth/guest' : mode === 'signin' ? '/auth/login' : '/auth/register';
      const body = mode === 'guest' ? { displayName } : mode === 'signin' ? { username, password } : { username, password, displayName: displayName || username };
      onSignedIn(await api<Session>(path, { body }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tabs: [Mode, string][] = [['signin', 'Sign in'], ...(allowSignup ? [['register', 'Create account'] as [Mode, string]] : []), ['guest', 'Join as a guest']];

  return (
    <div className="signin-page">
      <form className="signin card" onSubmit={submit}>
        <Logo size={40} />
        <p className="muted">{roomCode ? `You’ve been invited to room ${roomCode}.` : 'Game rooms with friends: play, or pull up a chair and watch.'}</p>
        <div className="segmented" role="tablist">
          {tabs.map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setError(null); }}>{label}</button>
          ))}
        </div>
        {mode !== 'guest' && (
          <>
            <label className="field"><span>Username</span>
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} />
            </label>
            <label className="field"><span>Password</span>
              <input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'register' ? 8 : 1} />
            </label>
          </>
        )}
        {mode !== 'signin' && (
          <label className="field"><span>Display name{mode === 'register' ? ' (optional)' : ''}</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required={mode === 'guest'} autoComplete="nickname" />
          </label>
        )}
        {mode === 'guest' && <p className="hint">Guests can watch and play if the room allows it. Hosting a room needs an account.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy}>
          {mode === 'guest' ? 'Continue as guest' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
