// Platform settings (#/admin): the admin's page for the whole Playhall.
// Everyone's own settings (devices, theme) are on #/settings.
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, type Session } from '../api';
import { AppBar } from '../AppBar';
import {
  AI_SECONDS_CHOICES, MOVE_SECONDS_CHOICES, WATCHER_DELAY_CHOICES,
  type AdminCert, type AdminOverview, type AdminRoom, type AdminUser, type PlatformPatch, type PlatformSettings,
} from '../../shared/platform';
import './admin.css';

const MOVE_LABEL: Record<number, string> = { 0: 'No limit', 15: '15 seconds a move', 30: '30 seconds a move', 60: '1 minute a move', 120: '2 minutes a move', 300: '5 minutes a move' };
const DELAY_LABEL: Record<number, string> = { 0: 'None: watchers see it live', 15: '15 seconds', 30: '30 seconds', 60: '1 minute', 120: '2 minutes' };
const STATUS: Record<AdminRoom['status'], string> = { idle: 'Waiting', playing: 'In play', over: 'Between games' };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Admin({ session, onSignOut }: { session: Session; onSignOut(): void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    api<AdminOverview>('/admin', { token: session.token })
      .then(setOverview)
      .catch((e) => { if (e instanceof ApiError && e.status === 403) setDenied(true); else setProblem((e as Error).message); });
  }, [session.token]);

  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active="admin" />
      <main className="settings-page admin-page">
        <h1>Platform settings</h1>
        {denied ? (
          <section className="settings-card"><p>Only an admin can open this page. Your own settings are on the <a href="#/settings">Settings</a> page.</p></section>
        ) : problem ? (
          <p className="form-error" role="alert">{problem}</p>
        ) : !overview ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p className="muted">These apply to everyone on this Playhall. Your own microphone, camera and theme are on the <a href="#/settings">Settings</a> page.</p>
            <SettingsCards session={session} overview={overview} onSettings={(settings) => setOverview({ ...overview, settings })} />
            <CertCard session={session} cert={overview.tls} onCert={(tls) => setOverview({ ...overview, tls })} />
            <UsersCard session={session} envAdmins={overview.envAdmins} />
            <RoomsCard session={session} />
          </>
        )}
      </main>
    </div>
  );
}

// ---- settings ------------------------------------------------------------

function SettingsCards({ session, overview, onSettings }: { session: Session; overview: AdminOverview; onSettings(s: PlatformSettings): void }) {
  const s = overview.settings;
  // Which card the last save was on, so "Saved" shows next to it.
  const [status, setStatus] = useState<{ card: string; text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (card: string, patch: PlatformPatch) => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await api<{ settings: PlatformSettings }>('/admin/settings', { method: 'PUT', token: session.token, body: patch });
      onSettings(r.settings);
      setStatus({ card, text: 'Saved' });
    } catch (e) {
      setStatus({ card, text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const check = (card: string, key: 'signupsAllowed' | 'guestsAllowed' | 'voiceVideoAllowed' | 'transcriptsAllowed', label: string, hint: string) => (
    <label className="check admin-check">
      <input type="checkbox" checked={s[key]} disabled={busy} onChange={(e) => save(card, { [key]: e.target.checked })} />
      <span><span>{label}</span><span className="hint">{hint}</span></span>
    </label>
  );

  const saved = (card: string) => status?.card === card && <p className={status.error ? 'form-error' : 'admin-saved'} role="status">{status.text}</p>;

  return (
    <>
      <section className="settings-card" aria-labelledby="adm-access">
        <h2 id="adm-access">Who can come in</h2>
        {check('access', 'signupsAllowed', 'People can create accounts', 'Off: only people who already have an account can sign in.')}
        {check('access', 'guestsAllowed', 'People can join as guests', 'Guests come in with just a name. They can watch and, where the room allows, play, but can’t host.')}
        {saved('access')}
      </section>

      <section className="settings-card" aria-labelledby="adm-voice">
        <h2 id="adm-voice">Voice and video</h2>
        <p className={overview.media.configured ? 'admin-ok' : 'muted'}>
          {overview.media.configured
            ? <>The voice server (LiveKit) is set up at <code>{overview.media.url}</code>.</>
            : <>The voice server (LiveKit) isn’t set up, so voice and video can’t work whatever this says. Set <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> and <code>LIVEKIT_API_SECRET</code> (see the README).</>}
        </p>
        {check('voice', 'voiceVideoAllowed', 'Voice and video in rooms', 'Off: nobody can start talking or show their camera, and the voice controls are hidden for anyone who opens a room from now on. People already in a call stay in it until they leave.')}
        {check('voice', 'transcriptsAllowed', 'Rooms can keep transcripts', 'Written records of what’s said in voice, where a room turns them on.')}
        {saved('voice')}
      </section>

      <section className="settings-card" aria-labelledby="adm-rooms">
        <h2 id="adm-rooms">New rooms</h2>
        <p className="muted">What a new room starts with. The host can still change these in the room; rooms that already exist keep theirs.</p>
        <div className="admin-grid">
          <label className="field"><span>Move timer</span>
            <select value={s.roomDefaults.moveSeconds} disabled={busy} onChange={(e) => save('rooms', { roomDefaults: { moveSeconds: Number(e.target.value) } })}>
              {MOVE_SECONDS_CHOICES.map((v) => <option key={v} value={v}>{MOVE_LABEL[v]}</option>)}
            </select>
          </label>
          <label className="field"><span>Delay for watchers</span>
            <select value={s.roomDefaults.watcherDelay} disabled={busy} onChange={(e) => save('rooms', { roomDefaults: { watcherDelay: Number(e.target.value) } })}>
              {WATCHER_DELAY_CHOICES.map((v) => <option key={v} value={v}>{DELAY_LABEL[v]}</option>)}
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.roomDefaults.ranked} disabled={busy} onChange={(e) => save('rooms', { roomDefaults: { ranked: e.target.checked } })} />
          Games count for the leaderboards (off: new rooms start casual)
        </label>
        {saved('rooms')}
      </section>

      <section className="settings-card" aria-labelledby="adm-games">
        <h2 id="adm-games">Games</h2>
        <fieldset className="field">
          <legend>Letterworks word list</legend>
          <label className="check"><input type="radio" name="wordlist" checked={s.letterworksWordList === 'full'} readOnly /> Full: every word in the dictionary</label>
          <label className="check admin-coming"><input type="radio" name="wordlist" disabled /> Family: no rude words (coming)</label>
        </fieldset>
      </section>

      <AiCard session={session} ai={s.aiPlayers} busy={busy} save={(patch) => save('ai', { aiPlayers: patch })} saved={saved('ai')} />
    </>
  );
}

// ---- AI players (#32) ----------------------------------------------------

function AiCard({ session, ai, busy, save, saved }: {
  session: Session; ai: PlatformSettings['aiPlayers']; busy: boolean; save(patch: Partial<PlatformSettings['aiPlayers']>): Promise<void>; saved: ReactNode;
}) {
  const [url, setUrl] = useState(ai.url);
  const [model, setModel] = useState(ai.model);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { setUrl(ai.url); setModel(ai.model); }, [ai.url, ai.model]);
  const dirty = url.trim() !== ai.url || model.trim() !== ai.model;
  const test = async () => {
    setChecking(true); setCheck(null);
    try { setCheck(await api<{ ok: boolean; message: string }>('/admin/ai/check', { method: 'POST', token: session.token, body: {} })); }
    catch (e) { setCheck({ ok: false, message: (e as Error).message }); }
    finally { setChecking(false); }
  };
  return (
    <section className="settings-card" aria-labelledby="adm-ai">
      <h2 id="adm-ai">AI players</h2>
      <p className="muted">A language model on a server you run plays a seat, talks at the table and bluffs (Ship2Shore so far). Playhall only ever asks the server named here; nothing is sent anywhere else. If the model is slow or answers something it can’t play, the computer player’s own rules make the move.</p>
      <label className="check admin-check">
        <input type="checkbox" checked={ai.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />
        <span><span>Hosts can add AI players</span><span className="hint">Off: only the ordinary computer players are offered.</span></span>
      </label>
      <form className="admin-grid" onSubmit={(e) => { e.preventDefault(); save({ url: url.trim(), model: model.trim() }); }}>
        <label className="field"><span>Model server (Ollama)</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://host.containers.internal:11434" spellCheck={false} />
        </label>
        <label className="field"><span>Model</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="llama3.1:8b" spellCheck={false} />
        </label>
        <label className="field"><span>Time for a move</span>
          <select value={ai.seconds} disabled={busy} onChange={(e) => save({ seconds: Number(e.target.value) })}>
            {AI_SECONDS_CHOICES.map((v) => <option key={v} value={v}>{v} seconds</option>)}
          </select>
        </label>
        <div className="row">
          <button className="btn small primary" disabled={busy || !dirty}>Save the server and model</button>
          <button type="button" className="btn small" disabled={checking || dirty || !ai.url} onClick={test}>{checking ? 'Checking\u2026' : 'Check the server'}</button>
        </div>
      </form>
      {check && <p className={check.ok ? 'admin-ok' : 'form-error'} role="status">{check.message}</p>}
      {saved}
    </section>
  );
}

// ---- TLS certificate -----------------------------------------------------

function CertCard({ session, cert, onCert }: { session: Session; cert: AdminCert | null; onCert(c: AdminCert): void }) {
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const load = (set: (v: string) => void) => async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) set(await f.text());
  };

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const r = await api<{ tls: AdminCert }>('/admin/tls', { method: 'PUT', token: session.token, body: { cert: certPem, key: keyPem } });
      onCert(r.tls);
      setCertPem(''); setKeyPem('');
      setStatus({ text: 'The new certificate is in use now. Reload the page to see it in the browser.' });
    } catch (err) {
      setStatus({ text: (err as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="adm-tls">
      <h2 id="adm-tls">HTTPS certificate</h2>
      {!cert ? (
        <p className="muted">This server runs plain HTTP (<code>TLS=off</code>), so there’s no certificate here. If a proxy in front of it does HTTPS, its certificate is set up there.</p>
      ) : (
        <>
          <dl className="admin-cert">
            <dt>For</dt><dd>{cert.subject.replace(/\n/g, ', ')}</dd>
            <dt>Issued by</dt><dd>{cert.selfSigned ? 'Itself (self-signed: each browser has to be told to trust it once)' : cert.issuer.replace(/\n/g, ', ')}</dd>
            <dt>Valid</dt><dd>{day(cert.validFrom)} to {day(cert.validTo)}{cert.expired && <span className="pill warn admin-pill">Expired</span>}</dd>
            <dt>SHA-256 fingerprint</dt><dd className="admin-mono">{cert.fingerprint256}</dd>
          </dl>
          <form className="admin-upload" onSubmit={upload}>
            <h3>Use a different certificate</h3>
            <p className="muted">For example one for your domain from Let’s Encrypt. You need two files: the certificate with any intermediate certificates after it (often called <code>fullchain.pem</code>), and its private key (<code>privkey.pem</code>). It takes effect straight away, with no restart. The key is kept on the server and never shown again.</p>
            <label className="field"><span>Certificate (PEM)</span>
              <input type="file" accept=".pem,.crt,.cer,.txt" onChange={load(setCertPem)} />
              <textarea value={certPem} onChange={(e) => setCertPem(e.target.value)} rows={4} spellCheck={false} placeholder="-----BEGIN CERTIFICATE-----" aria-label="Certificate text" />
            </label>
            <label className="field"><span>Private key (PEM)</span>
              <input type="file" accept=".pem,.key,.txt" onChange={load(setKeyPem)} />
              <textarea value={keyPem} onChange={(e) => setKeyPem(e.target.value)} rows={4} spellCheck={false} placeholder="-----BEGIN PRIVATE KEY-----" aria-label="Private key text" autoComplete="off" />
            </label>
            {status && <p className={status.error ? 'form-error' : 'admin-saved'} role={status.error ? 'alert' : 'status'}>{status.text}</p>}
            <div className="row"><button className="btn primary" disabled={busy || !certPem.trim() || !keyPem.trim()}>Check and use it</button></div>
          </form>
        </>
      )}
    </section>
  );
}

// ---- accounts ------------------------------------------------------------

function UsersCard({ session, envAdmins }: { session: Session; envAdmins: string[] }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [filter, setFilter] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api<{ users: AdminUser[] }>('/admin/users', { token: session.token }).then((r) => setUsers(r.users)).catch((e) => setError((e as Error).message));
  }, [session.token]);
  useEffect(refresh, [refresh]);

  const setAdmin = async (u: AdminUser, admin: boolean) => {
    setError(null);
    setConfirm(null);
    try {
      await api(`/admin/users/${u.id}/admin`, { method: 'PUT', token: session.token, body: { admin } });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => !q || u.username.includes(q) || u.name.toLowerCase().includes(q));

  return (
    <section className="settings-card" aria-labelledby="adm-users">
      <h2 id="adm-users">Accounts</h2>
      <p className="muted">Admins can open this page. Guests can’t be admins.{envAdmins.length > 0 && <> Admins named in the server’s <code>ADMIN_USERNAMES</code> ({envAdmins.join(', ')}) can only be removed there.</>}</p>
      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find by name or username" aria-label="Find an account" />
      {error && <p className="form-error" role="alert">{error}</p>}
      {!users ? <p className="muted">Loading…</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Username</th><th>Joined</th><th className="num">Games</th><th>Admin</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td><a href={`#/players/${u.id}`}>{u.name}</a>{u.id === session.user.id && <span className="muted"> (you)</span>}</td>
                  <td className="admin-mono">{u.username}</td>
                  <td>{day(u.createdAt)}</td>
                  <td className="num">{u.played}</td>
                  <td>
                    {u.envAdmin ? <span className="pill">Admin (server setting)</span>
                      : !u.admin ? <button className="btn tiny" onClick={() => setAdmin(u, true)}>Make admin</button>
                      : confirm === u.id ? (
                        <span className="admin-confirm">
                          <span>{u.id === session.user.id ? 'Stop being an admin?' : `Remove ${u.name} as admin?`}</span>
                          <button className="btn tiny danger" onClick={() => setAdmin(u, false)}>Yes, remove</button>
                          <button className="btn tiny" onClick={() => setConfirm(null)}>Keep</button>
                        </span>
                      ) : <span className="admin-confirm"><span className="pill role-player">Admin</span><button className="btn tiny" onClick={() => setConfirm(u.id)}>Remove</button></span>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="muted">No accounts match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- rooms ---------------------------------------------------------------

function RoomsCard({ session }: { session: Session }) {
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api<{ rooms: AdminRoom[] }>('/admin/rooms', { token: session.token }).then((r) => setRooms(r.rooms)).catch((e) => setError((e as Error).message));
  }, [session.token]);
  useEffect(refresh, [refresh]);

  const close = async (code: string) => {
    setError(null);
    setConfirm(null);
    try {
      await api(`/admin/rooms/${code}`, { method: 'DELETE', token: session.token });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="adm-roomlist">
      <div className="admin-head"><h2 id="adm-roomlist">Rooms</h2><button className="btn tiny" onClick={refresh}>Refresh</button></div>
      <p className="muted">Every open room, including ones only reachable by invite link. Closing a room sends everyone in it back to the lobby; finished games stay in the results.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!rooms ? <p className="muted">Loading…</p> : rooms.length === 0 ? <p className="muted">No rooms are open.</p> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Room</th><th>Game</th><th>Host</th><th className="num">In it now</th><th>Last active</th><th /></tr></thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.code}>
                  <td>
                    <a href={`#/r/${r.code}`}>{r.name}</a>
                    <span className="admin-tags">
                      <span className="pill">{STATUS[r.status]}</span>
                      {!r.listed && <span className="pill">Invite only</span>}
                      {r.locked && <span className="pill">Password</span>}
                    </span>
                  </td>
                  <td>{r.gameName}</td>
                  <td>{r.hostName}</td>
                  <td className="num" title={`${r.seated} of ${r.seats} seats taken`}>{r.present}</td>
                  <td>{when(r.updatedAt)}</td>
                  <td>
                    {confirm === r.code ? (
                      <span className="admin-confirm">
                        <span>Close {r.name}{r.present ? ` with ${r.present} ${r.present === 1 ? 'person' : 'people'} in it` : ''}?</span>
                        <button className="btn tiny danger" onClick={() => close(r.code)}>Yes, close it</button>
                        <button className="btn tiny" onClick={() => setConfirm(null)}>Keep it open</button>
                      </span>
                    ) : <button className="btn tiny" onClick={() => setConfirm(r.code)}>Close room</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
