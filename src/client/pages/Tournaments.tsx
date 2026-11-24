// Tournaments (#17): the list, a form to run one, and each tournament's page
// (entries, rounds with a link to every game, the table and the winner).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from '../api';
import { AppBar } from '../AppBar';
import { Avatar, Crown } from '../ui';
import { GAME_CLIENTS } from '../games';
import { useGames } from '../useGames';
import { FORMATS, suggestedSwissRounds, type Format, type TournamentSummary, type TournamentView } from '../../shared/tournament';
import { askToNotify } from '../useTournamentAlerts';
import './tournaments.css';

const STATUS: Record<TournamentView['status'], string> = { signup: 'Taking entries', running: 'Under way', done: 'Finished' };
const FORMAT_HINT: Record<Format, string> = {
  knockout: 'Lose a match and you’re out; a drawn game is played again. The top seeds get byes when the numbers don’t fit.',
  roundrobin: 'Everyone plays everyone once. Best for small groups.',
  swiss: 'A set number of rounds; each round you play someone on the same score you haven’t met. Good for bigger groups.',
};

export function TournamentsPage({ session, onSignOut, code }: { session: Session; onSignOut(): void; code: string | null }) {
  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active="tournaments" />
      <main className="tn-page">{code ? <TournamentDetail session={session} code={code} /> : <TournamentList session={session} />}</main>
    </div>
  );
}

function TournamentList({ session }: { session: Session }) {
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ tournaments: TournamentSummary[] }>('/tournaments', { token: session.token }).then((r) => setList(r.tournaments)).catch((e) => setError((e as Error).message));
  }, [session.token]);
  return (
    <div className="tn-layout">
      <section>
        <h1>Tournaments</h1>
        <p className="muted">Knockout, round robin or Swiss, for the two-player games. Playhall pairs the players, opens a room for every game and keeps the table; the games count on the leaderboards too.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No tournaments yet. Start one!</p> : (
          <div className="tn-cards">
            {list.map((t) => (
              <a key={t.code} href={`#/tournaments/${t.code}`} className={`card tn-card${t.myRoom ? ' ready' : ''}`}>
                <div className="tn-card-head"><strong>{t.name}</strong><span className={`pill ${t.status}`}>{STATUS[t.status]}</span></div>
                <span className="muted">{t.gameName} · {FORMATS[t.format]} · {t.players} {t.players === 1 ? 'player' : 'players'} · run by {t.organiser}{!t.open ? ' · invite only' : ''}</span>
                {t.myRoom ? <span className="tn-ready">Your game is ready</span> : t.entered ? <span className="muted small">You’re in</span> : null}
              </a>
            ))}
          </div>
        )}
      </section>
      {!session.user.guest && <NewTournament session={session} />}
    </div>
  );
}

function NewTournament({ session }: { session: Session }) {
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('chess');
  const [format, setFormat] = useState<Format>('knockout');
  const [rounds, setRounds] = useState(3);
  const [moveSeconds, setMoveSeconds] = useState(60);
  const [graceMinutes, setGrace] = useState(10);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ games: { id: string; name: string }[] }>('/tournaments/games', { token: session.token }).then((r) => setGames(r.games)).catch(() => {}); }, [session.token]);
  const Picker = GAME_CLIENTS[gameId]?.ConfigPicker;
  const [config, setConfig] = useState<unknown>(null);
  const defaults = useGames().find((g) => g.id === gameId)?.defaultConfig;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ tournament: TournamentView }>('/tournaments', { token: session.token, body: { name, gameId, format, rounds, moveSeconds, graceMinutes, open, gameConfig: config ?? undefined } });
      location.hash = `#/tournaments/${r.tournament.code}`;
    } catch (err) {
      setError((err as Error).message); setBusy(false);
    }
  };

  return (
    <form className="card new-room" onSubmit={create}>
      <h2>Run a tournament</h2>
      <label className="field"><span>Name</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Sunday club night" required /></label>
      <label className="field"><span>Game</span>
        <select value={gameId} onChange={(e) => { setGameId(e.target.value); setConfig(null); }}>{games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      </label>
      {Picker && <Picker value={config ?? defaults} onChange={setConfig} />}
      <fieldset className="field"><legend>Format</legend>
        <div className="segmented" role="group">
          {(Object.keys(FORMATS) as Format[]).map((f) => <button key={f} type="button" className={format === f ? 'on' : ''} aria-pressed={format === f} onClick={() => setFormat(f)}>{FORMATS[f]}</button>)}
        </div>
        <span className="hint">{FORMAT_HINT[format]}</span>
      </fieldset>
      {format === 'swiss' && (
        <label className="field"><span>Rounds</span>
          <input type="number" min={1} max={15} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />
          <span className="hint">{suggestedSwissRounds(8)} rounds suit 8 players, {suggestedSwissRounds(16)} suit 16.</span>
        </label>
      )}
      <label className="field"><span>Move timer for every game</span>
        <select value={moveSeconds} onChange={(e) => setMoveSeconds(Number(e.target.value))}>
          {[[0, 'No limit'], [15, '15 seconds a move'], [30, '30 seconds a move'], [60, '1 minute a move'], [120, '2 minutes a move'], [300, '5 minutes a move']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="field"><span>Time to turn up for a game</span>
        <select value={graceMinutes} onChange={(e) => setGrace(Number(e.target.value))}>{[5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
        <span className="hint">If one player is in the game’s room by then and the other isn’t, the one who’s there wins.</span>
      </label>
      <label className="check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Listed for everyone to enter (off: only people with the link)</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || !name.trim()}>{busy ? 'Setting it up…' : 'Set it up'}</button>
    </form>
  );
}

function TournamentDetail({ session, code }: { session: Session; code: string }) {
  const [t, setT] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const load = useCallback(() => {
    api<{ tournament: TournamentView }>(`/tournaments/${code}`, { token: session.token }).then((r) => setT(r.tournament)).catch((e) => setError((e as Error).message));
  }, [code, session.token]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const post = async (path: string, body: unknown = {}) => {
    setError(null);
    try { const r = await api<{ tournament: TournamentView }>(`/tournaments/${code}/${path}`, { token: session.token, body }); setT(r.tournament); } catch (e) { setError((e as Error).message); }
  };
  if (!t) return error ? <p className="form-error" role="alert">{error}</p> : <p className="muted">Loading…</p>;

  const me = session.user.id;
  const organiser = t.organiser.id === me;
  const entered = t.players.some((p) => p.id === me);
  const name = (id: string | null) => (id ? t.players.find((p) => p.id === id)?.name ?? '?' : '');
  const current = t.rounds.length - 1;
  const myMatch = t.status === 'running' ? t.rounds[current]?.find((m) => !m.result && m.b && (m.a === me || m.b === me)) : undefined;
  const share = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { /* shown in the address bar anyway */ } };

  return (
    <div className="tn-detail">
      <div className="tn-head">
        <div>
          <a href="#/tournaments" className="muted small">← All tournaments</a>
          <h1>{t.name}</h1>
          <p className="muted">{t.gameName} · {FORMATS[t.config.format]}{t.config.format === 'swiss' ? `, ${t.config.rounds} rounds` : ''} · run by {t.organiser.name} · <span className={`pill ${t.status}`}>{STATUS[t.status]}</span></p>
        </div>
        <span className="row">
          {entered && t.status !== 'done' && perm === 'default' && <button className="btn small" onClick={async () => setPerm(await askToNotify())}>Tell me when my game is ready</button>}
          {entered && t.status !== 'done' && perm === 'granted' && <span className="muted small">You’ll get a notification when your game is ready.</span>}
          <button className="btn small" onClick={share}>{copied ? 'Link copied' : 'Copy the link'}</button>
        </span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      {t.winner && <div className="card tn-winner"><Crown place={1} size={34} /> <strong>{t.winner.name}</strong> won the tournament!</div>}
      {myMatch && (
        <a className="card tn-go" href={`#/r/${myMatch.room}`}>
          <strong>Your round {current + 1} game is ready: {name(myMatch.a)} v {name(myMatch.b)}</strong>
          <span>Go to the game{myMatch.deadline ? `, by ${new Date(myMatch.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} or it’s a forfeit` : ''} →</span>
        </a>
      )}

      {t.status === 'running' && t.config.format === 'swiss' && t.rounds.length === 1 && !entered && !session.user.guest && (
        <section className="card"><p>Late entries are open until round 2: you’d start on no points.</p><button className="btn small primary" onClick={() => post('entry', { entered: true })}>Enter late</button></section>
      )}
      {organiser && t.status === 'running' && (
        <section className="card tn-org">
          <strong>Organiser</strong>
          <button className="btn small" onClick={() => post('more-time')}>Everyone gets 10 more minutes to turn up</button>
          <span className="muted small">Withdraw a player from the table below; they lose their remaining games.</span>
        </section>
      )}
      {t.status === 'signup' && (
        <section className="card">
          <h2>Entries ({t.players.length})</h2>
          <div className="tn-players">{t.players.map((p) => <span key={p.id} className="tn-player"><Avatar name={p.name} id={p.id} size={24} /> {p.name}</span>)}{!t.players.length && <span className="muted">Nobody yet.</span>}</div>
          <div className="row">
            {!session.user.guest && (entered
              ? <button className="btn small" onClick={() => post('entry', { entered: false })}>Withdraw</button>
              : <button className="btn small primary" onClick={() => post('entry', { entered: true })}>Enter</button>)}
            {organiser && <button className="btn small primary" disabled={t.players.length < 2} onClick={() => post('start')}>Close entries and start</button>}
          </div>
          {session.user.guest && <p className="hint">Entering needs an account, so the results are kept.</p>}
          {organiser && <p className="hint">Players are seeded at random when you start. Share the link so people can enter.</p>}
        </section>
      )}

      {t.rounds.length > 0 && t.config.format === 'knockout' && <Bracket t={t} me={me} />}

      {t.rounds.length > 0 && (
        <section className="tn-rounds">
          {t.rounds.map((r, i) => (
            <div key={i} className="card tn-round">
              <h2>{t.config.format === 'knockout' ? knockoutName(i, t.players.length) : `Round ${i + 1}`}</h2>
              <ul>
                {r.map((m, k) => (
                  <li key={k} className={m.a === me || m.b === me ? 'mine' : ''}>
                    {!m.b ? <span><strong>{name(m.a)}</strong> <span className="muted">has a bye</span></span> : (
                      <>
                        <span className={m.result === 'a' ? 'won' : ''}>{name(m.a)}</span>
                        <span className="muted tn-score">{m.result === 'a' ? '1 – 0' : m.result === 'b' ? '0 – 1' : m.result === 'draw' ? '½ – ½' : m.result === 'none' ? '0 – 0' : 'v'}</span>
                        <span className={m.result === 'b' ? 'won' : ''}>{name(m.b)}</span>
                        {m.how === 'forfeit' && <span className="muted small"> ({m.result === 'none' ? 'neither came' : 'forfeit'})</span>}
                        {m.how === 'organiser' && <span className="muted small"> (settled by the organiser)</span>}
                        {m.room && <a className="btn tiny" href={`#/r/${m.room}`}>{m.result ? 'Room' : 'Watch'}</a>}
                        {organiser && !m.result && i === current && (
                          <span className="tn-award">
                            <button className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'a' })}>{name(m.a)} wins</button>
                            {t.config.format !== 'knockout' && <button className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'draw' })}>Draw</button>}
                            <button className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'b' })}>{name(m.b)} wins</button>
                          </span>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {t.rounds.length > 0 && (
        <section className="card">
          <h2>{t.config.format === 'knockout' ? 'Who’s still in' : 'The table'}</h2>
          <table className="board-table tn-table">
            <thead><tr><th>#</th><th className="l">Player</th><th>Played</th><th>Points</th>{t.config.format !== 'knockout' && <th title={t.config.format === 'swiss' ? 'Buchholz: your opponents’ points' : 'Sonneborn-Berger: the points of the players you beat'}>Tie-break</th>}</tr></thead>
            <tbody>
              {t.standings.map((s, i) => (
                <tr key={s.id} className={s.out ? 'out' : ''}>
                  <td>{i + 1}</td><td className="l"><Avatar name={s.name} id={s.id} size={20} /> {s.name}{s.out ? <span className="muted small"> (out)</span> : ''}{t.withdrawn.includes(s.id) ? <span className="muted small"> (withdrawn)</span> : organiser && t.status === 'running' && !s.out ? <button className="btn tiny tn-withdraw" onClick={() => post('withdraw', { playerId: s.id })}>Withdraw</button> : null}</td>
                  <td>{s.played}</td><td className="pts">{s.points}</td>{t.config.format !== 'knockout' && <td>{s.tiebreak}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function knockoutName(i: number, players: number): string {
  const all = Math.ceil(Math.log2(Math.max(2, players)));
  const left = all - i;
  return left === 1 ? 'The final' : left === 2 ? 'Semi-finals' : left === 3 ? 'Quarter-finals' : `Round ${i + 1}`;
}

/** A knockout drawn as a bracket (#61): rounds in columns, pairs joined to the match they feed, later rounds shown before they're played. */
function Bracket({ t, me }: { t: TournamentView; me: string }) {
  const total = Math.ceil(Math.log2(Math.max(2, t.players.length)));
  const name = (id: string | null) => (id ? t.players.find((p) => p.id === id)?.name ?? '?' : '');
  const cols = Array.from({ length: total }, (_, i) => {
    const size = 2 ** (total - i - 1);
    return Array.from({ length: size }, (_, k) => t.rounds[i]?.[k] ?? null);
  });
  const line = (m: TournamentView['rounds'][number][number] | null, side: 'a' | 'b', i: number, k: number) => {
    if (!m) return <span className="muted">{i === 0 ? '' : `Winner of match ${2 * k + (side === 'a' ? 1 : 2)}`}</span>;
    const id = side === 'a' ? m.a : m.b;
    if (!id) return <span className="muted">bye</span>;
    const won = m.result === side;
    return <span className={`${won ? 'won' : ''}${id === me ? ' me' : ''}`}>{name(id)}{won ? ' ✓' : ''}</span>;
  };
  return (
    <section className="card tn-bracket-card" aria-label="The bracket">
      <h2>The bracket</h2>
      <div className="tn-bracket">
        {cols.map((col, i) => (
          <div key={i} className="tn-col">
            <div className="tn-col-head">{knockoutName(i, t.players.length)}</div>
            <div className="tn-col-body">
              {Array.from({ length: Math.ceil(col.length / 2) }, (_, p) => (
                <div key={p} className={`tn-pair${i < cols.length - 1 && col.length > 1 ? ' joined' : ''}`}>
                  {col.slice(p * 2, p * 2 + 2).map((m, j) => (
                    <div key={j} className={`tn-slot${m?.room && !m.result ? ' live' : ''}`}>
                      {line(m, 'a', i, p * 2 + j)}
                      {line(m, 'b', i, p * 2 + j)}
                      {m?.room && <a className="tn-slot-link" href={`#/r/${m.room}`} aria-label="Open the game">{m.result ? 'Room' : 'Watch'}</a>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
        {t.winner && <div className="tn-col tn-champion"><div className="tn-col-head">Winner</div><div className="tn-col-body"><div className="tn-slot"><span className="won">🏆 {t.winner.name}</span></div></div></div>}
      </div>
    </section>
  );
}
