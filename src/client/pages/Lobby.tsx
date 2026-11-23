import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from '../api';
import type { RoomSummary, SeatView } from '../../shared/protocol';
import type { PublicPlatform } from '../../shared/platform';
import { GAME_CLIENTS } from '../games';
import { Avatar } from '../ui';
import { AppBar } from '../AppBar';
import { HowToPlay } from '../HowToPlay';
import { useGames, type GameInfo } from '../useGames';
import { useProgression } from '../useProgression';
import { LadderCard } from '../LadderCard';
import type { TournamentSummary } from '../../shared/tournament';
import type { MyProgression } from '../../shared/progression';


const STATUS: Record<RoomSummary['status'], string> = { idle: 'Waiting', playing: 'In play', over: 'Between games' };

export function Lobby({ session, onSignOut }: { session: Session; onSignOut(): void }) {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const games = useGames();
  const prog = useProgression(session);
  const [ready, setReady] = useState<TournamentSummary[]>([]);
  useEffect(() => {
    if (session.user.guest) return;
    const load = () => api<{ tournaments: TournamentSummary[] }>('/tournaments', { token: session.token }).then((r) => setReady(r.tournaments.filter((t) => t.myRoom))).catch(() => {});
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [session.token, session.user.guest]);
  const [filter, setFilter] = useState<'all' | 'free'>('all');
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');

  const refresh = useCallback(() => {
    api<{ rooms: RoomSummary[] }>('/rooms', { token: session.token })
      .then((r) => { setRooms(r.rooms); setError(null); })
      .catch((e) => { if (e.status === 401) onSignOut(); else setError(e.message); });
  }, [session.token, onSignOut]);

  // New rooms show up within a few seconds, and at once when you come back
  // to the tab (playtest feedback: people refreshed to see a room just made).
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3_000);
    const back = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [refresh]);

  const shown = (rooms ?? []).filter((r) => filter === 'all' || (r.status !== 'playing' && r.seats.some((s) => !s.userId)));

  const join = (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code) location.hash = `#/r/${code}`;
  };

  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active="rooms" />
      <main className="lobby">
        <section className="lobby-rooms">
          <div className="lobby-head">
            <div>
              <h1>Rooms</h1>
              <p className="muted">Take a free seat to play, or walk in and watch.</p>
            </div>
            <div className="chips">
              <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`chip${filter === 'free' ? ' on' : ''}`} onClick={() => setFilter('free')}>Free seats</button>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {rooms === null ? <p className="muted">Loading rooms…</p> : shown.length === 0 ? (
            <p className="empty">No rooms {filter === 'free' ? 'with free seats ' : ''}right now.{session.user.guest ? '' : ' Start one on the right.'}</p>
          ) : (
            <div className="room-grid">
              {shown.map((r) => <RoomCard key={r.code} room={r} />)}
            </div>
          )}
        </section>
        <aside className="lobby-side">
          <form className="card" onSubmit={join}>
            <h2>Have a code?</h2>
            <div className="row">
              <label className="sr-only" htmlFor="code">Room code</label>
              <input id="code" placeholder="e.g. K7QM2X" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} maxLength={12} />
              <button className="btn">Go</button>
            </div>
          </form>
          {ready.map((t) => (
            <a key={t.code} className="card tn-go" href={`#/r/${t.myRoom}`}><strong>Your {t.name} game is ready</strong><span>{t.gameName}: go to the game →</span></a>
          ))}
          {prog && <LadderCard prog={prog} games={games} />}
          {session.user.guest
            ? <div className="card"><h2>Host a room</h2><p className="muted">Hosting needs an account. Sign out and create one: it takes a few seconds.</p></div>
            : <NewRoom session={session} games={games} prog={prog} />}
        </aside>
      </main>
    </div>
  );
}

function RoomCard({ room }: { room: RoomSummary }) {
  const free = room.seats.filter((s) => !s.userId).length;
  return (
    <article className="room-card card">
      <div className="room-card-head">
        <div>
          <h3>{room.name}</h3>
          <p className="muted">{room.gameName} · {room.configLabel} · hosted by {room.hostName}</p>
        </div>
        <span className={`pill ${room.status}`}>{STATUS[room.status]}</span>
      </div>
      <div className="seat-dots">
        {room.seats.map((s: SeatView) => s.userId
          ? <span key={s.id} title={`${s.label}: ${s.name}`}><Avatar name={s.name ?? '?'} id={s.userId} size={30} /></span>
          : <span key={s.id} className="free-dot" title={`${s.label}: free`}>+</span>)}
      </div>
      <p className="room-card-stats">
        <span>Players <strong>{room.seats.length - free} / {room.seats.length}</strong></span>
        <span>Watching <strong>{room.watching}</strong></span>
        {!room.listed && <span className="muted">Invite only</span>}
        {!room.ranked && <span className="muted">Casual</span>}
        {room.locked && <span className="muted">Password</span>}
      </p>
      <a className={`btn ${free && room.status !== 'playing' ? 'primary' : ''}`} href={`#/r/${room.code}`}>
        {free && room.status !== 'playing' ? 'Go in and sit down' : 'Go in and watch'}
      </a>
    </article>
  );
}

function NewRoom({ session, games, prog }: { session: Session; games: GameInfo[]; prog: MyProgression | null }) {
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('chess');
  // On the ladder: only open games can be hosted (#50).
  const open = prog?.on && prog.progress ? new Set(prog.progress.allowed) : null;
  const tierOf = (id: string) => (prog?.ladder.tiers.findIndex((t) => t.games.includes(id)) ?? -1) + 1;
  useEffect(() => {
    if (open && !open.has(gameId) && prog?.progress?.allowed[0]) setGameId(prog.progress.allowed[0]);
  }, [prog]); // eslint-disable-line react-hooks/exhaustive-deps
  const [config, setConfig] = useState<unknown>(null);
  const [listed, setListed] = useState(true);
  const [play, setPlay] = useState(true);
  const [ranked, setRanked] = useState(true);
  // The admin's default for new rooms (platform settings).
  useEffect(() => {
    api<PublicPlatform>('/platform').then((p) => setRanked(p.roomDefaults.ranked)).catch(() => {});
  }, []);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const game = games.find((g) => g.id === gameId);
  const Picker = GAME_CLIENTS[gameId]?.ConfigPicker;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ room: RoomSummary }>('/rooms', {
        token: session.token,
        body: { name: name || `${session.user.name}’s ${game?.name ?? 'game'}`, gameId, listed, ranked, password: password || null, gameConfig: config ?? game?.defaultConfig, hostSeat: play ? game?.seats[0]?.id : null },
      });
      location.hash = `#/r/${r.room.code}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="card new-room" onSubmit={create}>
      <h2>New room</h2>
      <label className="field"><span>Room name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={`${session.user.name}’s ${game?.name ?? 'game'}`} />
      </label>
      <fieldset className="field">
        <legend>Game</legend>
        {games.map((g) => (
          <div key={g.id}>
            <label className={`game-pick${g.id === gameId ? ' on' : ''}${open && !open.has(g.id) ? ' locked' : ''}`}>
              <input type="radio" name="game" value={g.id} checked={g.id === gameId} disabled={!!open && !open.has(g.id)} onChange={() => { setGameId(g.id); setConfig(null); }} />
              <span className="game-pick-head"><strong>{open && !open.has(g.id) ? '🔒 ' : ''}{g.name}</strong>{open && !open.has(g.id) && <span className="muted">{tierOf(g.id) ? `tier ${tierOf(g.id)}` : 'not on your ladder'}</span>}<span className="muted">{g.minPlayers === g.seats.length ? g.seats.length : `${g.minPlayers}-${g.seats.length}`} players</span></span>
              <span className="muted">{g.description}</span>
            </label>
            {g.id === gameId && g.howToPlay && (
              <details className="rules-peek">
                <summary>How to play {g.name}</summary>
                <HowToPlay rules={g.howToPlay} />
              </details>
            )}
          </div>
        ))}
        <p className="hint">Shared games from your PC and web-game plug-ins come in later phases.</p>
      </fieldset>
      {Picker && game && <Picker value={config ?? game.defaultConfig} onChange={setConfig} />}
      <label className="check"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} /> Show it in the lobby (off: invite link only)</label>
      <label className="field"><span>Password (optional: makes the room private)</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} maxLength={100} placeholder="Anyone with the link can come in" />
      </label>
      <label className="check"><input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} /> Games count for the leaderboard (off: a casual room)</label>
      <label className="check"><input type="checkbox" checked={play} onChange={(e) => setPlay(e.target.checked)} /> I’ll play too ({game?.seats[0]?.label ?? 'first seat'})</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy || !game}>Create room</button>
    </form>
  );
}
