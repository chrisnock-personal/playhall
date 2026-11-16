import { useState } from 'react';
import { api, ApiError, type Session } from './api';

/** Change your password. `required` is the default admin's first sign-in:
 *  nothing else opens until it has a password of its own. */
export function ChangePassword({ session, onChanged, required }: { session: Session; onChanged(s: Session): void; required?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setDone(false);
    if (next !== again) { setError('The two new passwords don’t match'); return; }
    setBusy(true);
    try {
      const s = await api<Session>('/auth/password', { method: 'POST', token: session.token, body: { current, next } });
      setCurrent(''); setNext(''); setAgain(''); setDone(true);
      onChanged(s);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Couldn’t change the password'); }
    finally { setBusy(false); }
  };

  return (
    <form className="change-password" onSubmit={submit}>
      {required && <p>This is the default <strong>admin</strong> account. Choose your own password before going any further: until you do, anyone who knows the default could sign in as admin.</p>}
      <label className="field"><span>{required ? 'Current password (the default is admin)' : 'Current password'}</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
      <label className="field"><span>New password (at least 8 characters)</span>
        <input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required /></label>
      <label className="field"><span>New password again</span>
        <input type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {done && !required && <p className="hint" role="status">Password changed.</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}
