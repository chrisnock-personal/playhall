// Tournaments (#17, #59): the list, a form to run one, and each tournament's
// page (entries, rounds with a link to every game, the table and the winner).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from '../api';
import { AppBar } from '../AppBar';
import { Avatar, Crown } from '../ui';
import { GAME_CLIENTS } from '../games';
import { useGames } from '../useGames';
import {
  FORMATS, PLACE_POINT_OPTIONS, entryName, entrantsOf, inEntry, suggestedSwissRounds,
  type Format, type TournamentSummary, type TournamentView,
} from '../../shared/tournament';
import { askToNotify } from '../useTournamentAlerts';
import './tournaments.css';

const STATUS: Record<TournamentView['status'], string> = { signup: 'Taking entries', running: 'Under way', done: 'Finished' };
const FORMAT_HINT: Record<Format, string> = {
  knockout: 'Lose a match and you’re out; a drawn game is played again. The top seeds get byes when the numbers don’t fit. Pair matches only.',
  roundrobin: 'Everyone plays everyone once. Best for small groups; pair matches only.',
  swiss: 'A set number of rounds; each round you meet people on the same score you haven’t already played. Tables of 3-6 get points by finishing place.',
};

type TournamentGame = { id: string; name: string; minPlayers: number; seats: number; teams: boolean };
type Partner = { id: string; name: string };

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
        <p className="muted">Knockout, round robin or Swiss, for games with two to six players at a table. Playhall pairs the entries, opens a room for every game and keeps the table; the games count on the leaderboards too.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No tournaments yet. Start one!</p> : (
          <div className="tn-cards">
            {list.map((t) => (
              <a key={t.code} href={`#/tournaments/${t.code}`} className={`card tn-card${t.myRoom ? ' ready' : ''}`}>
                <div className="tn-card-head"><strong>{t.name}</strong><span className={`pill ${t.status}`}>{STATUS[t.status]}</span></div>
                <span className="muted">{t.gameName} · {FORMATS[t.format]} · {t.players} {t.players === 1 ? 'entry' : 'entries'} · run by {t.organiser}{!t.open ? ' · invite only' : ''}</span>
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
  const [games, setGames] = useState<TournamentGame[]>([]);
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('chess');
  const [format, setFormat] = useState<Format>('knockout');
  const [rounds, setRounds] = useState(3);
  const [moveSeconds, setMoveSeconds] = useState(60);
  const [graceMinutes, setGrace] = useState(10);
  const [open, setOpen] = useState(true);
  const [tableSize, setTableSize] = useState(2);
  const [pointChoice, setPointChoice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ games: TournamentGame[] }>('/tournaments/games', { token: session.token }).then((r) => setGames(r.games)).catch(() => {}); }, [session.token]);
  const Picker = GAME_CLIENTS[gameId]?.ConfigPicker;
  const [config, setConfig] = useState<unknown>(null);
  const defaults = useGames().find((g) => g.id === gameId)?.defaultConfig;
  const game = games.find((g) => g.id === gameId);
  const teams = !!game?.teams;
  const minTable = Math.max(2, game?.minPlayers ?? 2);
  const maxTable = Math.min(6, game?.seats ?? 2);

  const chooseGame = (id: string) => {
    const g = games.find((x) => x.id === id);
    const size = g?.teams ? 4 : Math.max(Math.max(2, g?.minPlayers ?? 2), Math.min(4, g?.seats ?? 2));
    setGameId(id); setConfig(null); setPointChoice(0);
    setTableSize(size);
    if (size > 2) setFormat('swiss'); // tables of 3+ are Swiss only
  };
  const chooseSize = (n: number) => { setTableSize(n); if (n > 2) setFormat('swiss'); };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ tournament: TournamentView }>('/tournaments', {
        token: session.token,
        body: {
          name, gameId, format, rounds, moveSeconds, graceMinutes, open,
          gameConfig: config ?? undefined, tableSize, teamSize: teams ? 2 : 1,
          placePoints: tableSize > 2 ? PLACE_POINT_OPTIONS[pointChoice].points : undefined,
        },
      });
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
        <select value={gameId} onChange={(e) => chooseGame(e.target.value)}>{games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      </label>
      {Picker && <Picker value={config ?? defaults} onChange={setConfig} />}
      {maxTable > 2 && <label className="field"><span>Players at each table</span>
        <select value={tableSize} disabled={teams} onChange={(e) => chooseSize(Number(e.target.value))}>
          {Array.from({ length: maxTable - minTable + 1 }, (_, i) => i + minTable).map((n) => <option key={n} value={n}>{n} players</option>)}
        </select>
        <span className="hint">{teams ? 'Spades is played by two pairs, four players at a table.' : 'More than two players at a table means Swiss rounds and points by finishing place.'}</span>
      </label>}
      {tableSize > 2 && <label className="field"><span>Points by place</span>
        <select value={pointChoice} onChange={(e) => setPointChoice(Number(e.target.value))}>
          {PLACE_POINT_OPTIONS.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
        </select>
        <span className="hint">Points go to the entries in each finishing group; tied entries share the group’s points.</span>
      </label>}
      <fieldset className="field"><legend>Format</legend>
        <div className="segmented" role="group">
          {(Object.keys(FORMATS) as Format[]).map((f) => <button key={f} type="button" className={format === f ? 'on' : ''} aria-pressed={format === f}
            disabled={tableSize > 2 && f !== 'swiss'} title={tableSize > 2 && f !== 'swiss' ? 'Tables of three or more need Swiss' : undefined}
            onClick={() => setFormat(f)}>{FORMATS[f]}</button>)}
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
        <span className="hint">If the rest of a table is in the room by then and an entry isn’t, that entry loses its place.</span>
      </label>
      <label className="check"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Listed for everyone to enter (off: only people with the link)</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || !name.trim()}>{busy ? 'Setting it up…' : 'Set it up'}</button>
    </form>
  );
}

/** Spades entries are pairs: find an account by name before entering. */
function TeamEntry({ token, onEnter }: { token: string; onEnter(p: Partner): void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Partner[]>([]);
  const [chosen, setChosen] = useState<Partner | null>(null);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      api<{ players: Partner[] }>(`/tournaments/partners?q=${encodeURIComponent(query)}`, { token })
        .then((r) => setResults(r.players)).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query, token]);
  return (
    <div className="tn-partner">
      <input value={query} maxLength={40} onChange={(e) => { setQuery(e.target.value); setChosen(null); }} placeholder="Find your partner by name" aria-label="Find your partner by name" />
      <div className="tn-partner-list">
        {results.map((p) => <button key={p.id} type="button" className={`btn tiny${chosen?.id === p.id ? ' primary' : ''}`} onClick={() => setChosen(p)}>{p.name}</button>)}
        {query.trim().length >= 2 && !results.length && <span className="muted small">No accounts found.</span>}
      </div>
      <button className="btn small primary" disabled={!chosen} onClick={() => chosen && onEnter(chosen)}>Enter as a pair</button>
    </div>
  );
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${suffix}`;
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
  const entryOf = (id: string | null) => id ? t.players.find((p) => p.id === id || inEntry(p, id)) ?? null : null;
  const name = (id: string | null) => { const p = entryOf(id); return p ? entryName(p) : '?'; };
  const mine = (id: string) => { const p = entryOf(id); return !!p && inEntry(p, me); };
  const entered = t.players.some((p) => inEntry(p, me));
  const teamSize = t.config.teamSize ?? 1;
  const teams = teamSize === 2;
  const isTable = (m: TournamentView['rounds'][number][number]) => (m.table?.length ?? 0) > 2;
  const current = t.rounds.length - 1;
  const myMatch = t.status === 'running' ? t.rounds[current]?.find((m) => !m.result && entrantsOf(m).some(mine)) : undefined;
  const share = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); } catch { /* shown in the address bar anyway */ } };

  return (
    <div className="tn-detail">
      <div className="tn-head">
        <div>
          <a href="#/tournaments" className="muted small">← All tournaments</a>
          <h1>{t.name}</h1>
          <p className="muted">{t.gameName} · {FORMATS[t.config.format]}{t.config.format === 'swiss' ? `, ${t.config.rounds} rounds` : ''}{(t.config.tableSize ?? 2) > 2 ? `, ${t.config.tableSize} per table` : ''} · run by {t.organiser.name} · <span className={`pill ${t.status}`}>{STATUS[t.status]}</span></p>
        </div>
        <span className="row">
          {entered && t.status !== 'done' && perm === 'default' && <button className="btn small" onClick={async () => setPerm(await askToNotify())}>Tell me when my game is ready</button>}
          {entered && t.status !== 'done' && perm === 'granted' && <span className="muted small">You’ll get a notification when your game is ready.</span>}
          <button className="btn small" onClick={share}>{copied ? 'Link copied' : 'Copy the link'}</button>
        </span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      {t.winner && <div className="card tn-winner"><Crown place={1} size={34} /> <strong>{entryName(t.winner)}</strong> won the tournament!</div>}
      {myMatch && (
        <a className="card tn-go" href={`#/r/${myMatch.room}`}>
          <strong>Your round {current + 1} game is ready: {entrantsOf(myMatch).map(name).join(' · ')}</strong>
          <span>Go to the game{myMatch.deadline ? `, by ${new Date(myMatch.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} or it’s a forfeit` : ''} →</span>
        </a>
      )}

      {t.status === 'running' && t.config.format === 'swiss' && t.rounds.length === 1 && !entered && !session.user.guest && (
        <section className="card"><p>Late entries are open until round 2: you’d start on no points.</p>
          {teams ? <TeamEntry token={session.token} onEnter={(p) => post('entry', { entered: true, partnerId: p.id })} />
            : <button className="btn small primary" onClick={() => post('entry', { entered: true })}>Enter late</button>}
        </section>
      )}
      {organiser && t.status === 'running' && (
        <section className="card tn-org">
          <strong>Organiser</strong>
          <button className="btn small" onClick={() => post('more-time')}>Everyone gets 10 more minutes to turn up</button>
          <span className="muted small">Withdraw an entry from the table below; it loses its remaining games.</span>
        </section>
      )}
      {t.status === 'signup' && (
        <section className="card">
          <h2>Entries ({t.players.length})</h2>
          <div className="tn-players">{t.players.map((p) => <span key={p.id} className="tn-player"><Avatar name={entryName(p)} id={p.id} size={24} /> {entryName(p)}</span>)}{!t.players.length && <span className="muted">Nobody yet.</span>}</div>
          <div className="row">
            {!session.user.guest && (entered
              ? <button className="btn small" onClick={() => post('entry', { entered: false })}>Withdraw</button>
              : teams ? <TeamEntry token={session.token} onEnter={(p) => post('entry', { entered: true, partnerId: p.id })} />
                : <button className="btn small primary" onClick={() => post('entry', { entered: true })}>Enter</button>)}
            {organiser && <button className="btn small primary" disabled={t.players.length < Math.max(2, Math.ceil((t.config.tableSize ?? 2) / teamSize))} onClick={() => post('start')}>Close entries and start</button>}
          </div>
          {session.user.guest && <p className="hint">Entering needs an account, so the results are kept.</p>}
          {organiser && <p className="hint">Entries are seeded at random when you start. Share the link so people can join.</p>}
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
                  <li key={k} className={entrantsOf(m).some(mine) ? 'mine' : ''}>
                    {!m.b && !m.table ? <span><strong>{name(m.a)}</strong> <span className="muted">has a bye</span></span> : (
                      <>
                        {isTable(m) ? (
                          <div className="tn-table-result">
                            {m.placings?.length ? m.placings.map((group, place) => (
                              <div key={place} className="tn-place">
                                <b>{ordinal(place + 1)}</b>
                                <span>{group.map(name).join(', ')}</span>
                                {t.config.placePoints && <small>+{t.config.placePoints[place] ?? 0} pts</small>}
                              </div>
                            )) : <div className="tn-place"><b>Table</b><span>{entrantsOf(m).map(name).join(' · ')}</span>{!m.result && <span className="muted small">result pending</span>}</div>}
                          </div>
                        ) : (
                          <>
                            <span className={m.result === 'a' ? 'won' : ''}>{name(m.a)}</span>
                            <span className="muted tn-score">{m.result === 'a' ? '1 – 0' : m.result === 'b' ? '0 – 1' : m.result === 'draw' ? '½ – ½' : m.result === 'none' ? '0 – 0' : m.result === 'table' ? 'placed' : 'v'}</span>
                            <span className={m.result === 'b' ? 'won' : ''}>{name(m.b)}</span>
                          </>
                        )}
                        {m.how === 'forfeit' && <span className="muted small"> ({m.result === 'none' ? 'neither came' : 'forfeit'})</span>}
                        {m.how === 'organiser' && <span className="muted small"> (settled by the organiser)</span>}
                        {m.room && <a className="btn tiny" href={`#/r/${m.room}`}>{m.result ? 'Room' : 'Watch'}</a>}
                        {organiser && !m.result && i === current && (isTable(m)
                          ? <span className="tn-award">{entrantsOf(m).map((id) => <button key={id} className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'table', winner: id })}>{name(id)} wins</button>)}</span>
                          : <span className="tn-award">
                            <button className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'a' })}>{name(m.a)} wins</button>
                            {t.config.format !== 'knockout' && <button className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'draw' })}>Draw</button>}
                            <button className="btn tiny" onClick={() => post('award', { round: i, index: k, result: 'b' })}>{name(m.b)} wins</button>
                          </span>)}
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
            <thead><tr><th>#</th><th className="l">{teams ? 'Pair' : 'Player'}</th><th>Played</th><th>Points</th>{t.config.format !== 'knockout' && <th title={t.config.format === 'swiss' ? 'Buchholz: the points of the people you shared a table with' : 'Sonneborn-Berger: the points of the players you beat'}>Tie-break</th>}</tr></thead>
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
  const name = (id: string | null) => { const p = id ? t.players.find((x) => x.id === id || inEntry(x, id)) : null; return p ? entryName(p) : ''; };
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
        {t.winner && <div className="tn-col tn-champion"><div className="tn-col-head">Winner</div><div className="tn-col-body"><div className="tn-slot"><span className="won">🏆 {entryName(t.winner)}</span></div></div></div>}
      </div>
    </section>
  );
}
