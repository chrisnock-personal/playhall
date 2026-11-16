import { useEffect, useState } from 'react';
import { api, type Session } from '../api';
import type { BoardNamesResponse, LeaderboardResponse, LeaderboardRow, Period } from '../../shared/protocol';
import { AppBar } from '../AppBar';
import { useGames } from '../useGames';
import { Avatar, Crown, OutcomeChip, PeriodPicker, perGame, winPct } from '../ui';

export function Leaderboard({ session, onSignOut }: { session: Session; onSignOut(): void }) {
  const [period, setPeriod] = useState<Period>('month');
  const [game, setGame] = useState('chess');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const games = useGames();
  const tabs: [string, string][] = [...games.map((g) => [g.id, g.name] as [string, string]), ['all', 'All games']];
  // The camera table: a tab per game name played (null = every name together).
  const named = !!games.find((g) => g.id === game)?.tableCamera;
  const [names, setNames] = useState<BoardNamesResponse['names']>([]);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setNames([]); setName(null);
    if (!named) return;
    api<BoardNamesResponse>(`/leaderboard/names?game=${game}`, { token: session.token })
      .then((d) => { setNames(d.names); setName(d.names[0]?.key ?? null); })
      .catch(() => {});
  }, [game, named, session.token]);

  useEffect(() => {
    setData(null);
    const q = new URLSearchParams({ game, period });
    if (named && name) q.set('name', name);
    api<LeaderboardResponse>(`/leaderboard?${q}`, { token: session.token })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (e.status === 401) onSignOut(); else setError(e.message); });
  }, [game, period, named, name, session.token, onSignOut]);

  const podium = data?.ranked.slice(0, 3) ?? [];

  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active="leaderboard" />
      <main className="board-page">
        <div className="board-head">
          <div>
            <h1>Leaderboards</h1>
            <p className="muted">3 points for a win, 1 for a draw, 0 for a loss. Ranked from {data?.minGames ?? 5} games in the period.</p>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>

        <div className="page-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={game === id} className={game === id ? 'on' : ''} onClick={() => setGame(id)}>{label}</button>
          ))}
        </div>

        {named && (names.length ? (
          <div className="page-tabs sub" role="tablist" aria-label="Game name">
            {names.map((n) => (
              <button key={n.key} role="tab" aria-selected={name === n.key} className={name === n.key ? 'on' : ''} onClick={() => setName(n.key)}>
                {n.name} <span className="muted">{n.games}</span>
              </button>
            ))}
            <button role="tab" aria-selected={name === null} className={name === null ? 'on' : ''} onClick={() => setName(null)}>Every game together</button>
          </div>
        ) : <p className="muted">No counted camera table games yet. Each game name typed gets its own tab here.</p>)}

        {error && <p className="form-error" role="alert">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}

        {data && data.ranked.length === 0 && (
          <div className="card"><p className="empty">Nobody has played {data.minGames} counted games {period === 'all' ? 'yet' : `this ${period}`}.</p></div>
        )}

        {podium.length > 0 && (
          <div className={`podium n${podium.length}`}>
            {podium.map((r, i) => {
              const place = placeOf(r.rank) ?? ((i + 1) as 1 | 2 | 3);
              return (
                <a key={r.userId} href={`#/players/${r.userId}`} className={`podium-spot p${i + 1}`}>
                  <span className="podium-who">
                    <span className="podium-crown"><Crown place={place} size={i === 0 ? 46 : 36} /></span>
                    {i === 0 && <span className="sparkles" aria-hidden="true"><i /><i /><i /><i /></span>}
                    <Avatar name={r.name} id={r.userId} size={i === 0 ? 72 : 56} />
                    <strong>{r.name}{r.userId === session.user.id && <span className="you-tag">You</span>}</strong>
                    <span className="podium-pts"><strong>{r.points}</strong> pts</span>
                    <span className="muted small">{r.w} W · {r.d} D · {r.l} L{streak(r.form) >= 3 ? <> · <Flame n={streak(r.form)} /></> : null}</span>
                  </span>
                  <span className="podium-step" aria-label={`Place ${r.rank}`}>{r.rank}</span>
                </a>
              );
            })}
          </div>
        )}

        {data && data.ranked.length > 0 && (
          <div className="card table-card">
            <table className="board-table">
              <thead>
                <tr><th className="l">#</th><th className="l">Player</th><th>Played</th><th>W</th><th>D</th><th>L</th><th>Points</th><th>Per game</th><th>Win %</th><th className="l">Last five</th></tr>
              </thead>
              <tbody>{data.ranked.map((r) => <Row key={r.userId} r={r} me={session.user.id} top={data.ranked[0].points} />)}</tbody>
            </table>
          </div>
        )}

        <div className="board-notes">
          <div className="card">
            <h2>Not ranked yet</h2>
            {data && data.unranked.length
              ? <p className="muted">{data.unranked.map((r) => `${r.name} (${r.played} ${r.played === 1 ? 'game' : 'games'}, ${r.points} points)`).join(', ')}. {data.minGames} games in the period puts them on the board.</p>
              : <p className="muted">Nobody: everyone who played is ranked.</p>}
          </div>
          <div className="card">
            <h2>What counts</h2>
            <p className="muted">Finished games in rooms set to count for the leaderboard, between two account holders. A game the host stopped doesn’t count. Guests’ games aren’t ranked.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

/** 1, 2 or 3 for a podium place (ties share it), else null. */
const placeOf = (rank: number | null) => (rank && rank <= 3 ? (rank as 1 | 2 | 3) : null);

/** Wins in a row, counting back from the latest game. */
const streak = (form: LeaderboardRow['form']) => { let n = 0; for (const o of form) { if (o !== 'win') break; n++; } return n; };

/** Three wins or more in a row: on a roll. */
function Flame({ n }: { n: number }) {
  return (
    <span className="flame" title={`${n} wins in a row`}>
      <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0c1 3 5 4.5 5 8.5A5 5 0 0 1 1 8.5C1 6.5 2.3 5.4 3 4.5c.2 1.4.9 2.2 1.8 2.4C4.6 4.6 5 2 6 0z" fill="#F07A2C" /><path d="M6 6.5c.7 1.4 2.3 2 2.3 3.6a2.3 2.3 0 0 1-4.6 0c0-1 .6-1.6 1-2 .1.6.4.9.8 1-.1-1 .1-1.8.5-2.6z" fill="#FFD25E" /></svg>
      {n} in a row
    </span>
  );
}

function Row({ r, me, top }: { r: LeaderboardRow; me: string; top: number }) {
  const place = placeOf(r.rank);
  const run = streak(r.form);
  return (
    <tr className={`${r.userId === me ? 'me' : ''}${place ? ` place-${place}` : ''}`}>
      <td className="l rank-cell">{place ? <span className="rank-crown"><Crown place={place} size={24} /><span>{r.rank}</span></span> : <span className="muted">{r.rank}</span>}</td>
      <td className="l">
        <a className="player-link" href={`#/players/${r.userId}`}>
          <Avatar name={r.name} id={r.userId} size={30} />
          <strong>{r.name}</strong>
          {r.userId === me && <span className="you-tag">You</span>}
          {run >= 3 && <Flame n={run} />}
        </a>
      </td>
      <td>{r.played}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td>
      <td className="pts">
        <span className="pts-cell">
          <span className="pts-bar" aria-hidden="true"><i style={{ width: `${top ? Math.max(4, (r.points / top) * 100) : 0}%` }} /></span>
          {r.points}
        </span>
      </td>
      <td>{perGame(r.points, r.played)}</td>
      <td>{winPct(r.w, r.played)}</td>
      <td className="l"><span className="form">{r.form.map((o, i) => <OutcomeChip key={i} outcome={o} />)}</span></td>
    </tr>
  );
}
