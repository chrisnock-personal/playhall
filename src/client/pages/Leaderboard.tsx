import { useEffect, useState } from 'react';
import { api, type Session } from '../api';
import type { LeaderboardResponse, LeaderboardRow, Period } from '../../shared/protocol';
import { AppBar } from '../AppBar';
import { useGames } from '../useGames';
import { Avatar, OutcomeChip, PeriodPicker, perGame, winPct } from '../ui';

export function Leaderboard({ session, onSignOut }: { session: Session; onSignOut(): void }) {
  const [period, setPeriod] = useState<Period>('month');
  const [game, setGame] = useState('chess');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabs: [string, string][] = [...useGames().map((g) => [g.id, g.name] as [string, string]), ['all', 'All games']];

  useEffect(() => {
    setData(null);
    api<LeaderboardResponse>(`/leaderboard?game=${game}&period=${period}`, { token: session.token })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (e.status === 401) onSignOut(); else setError(e.message); });
  }, [game, period, session.token, onSignOut]);

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

        {error && <p className="form-error" role="alert">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}

        {data && data.ranked.length === 0 && (
          <div className="card"><p className="empty">Nobody has played {data.minGames} counted games {period === 'all' ? 'yet' : `this ${period}`}.</p></div>
        )}

        {podium.length > 0 && (
          <div className="podium">
            {podium.map((r, i) => (
              <a key={r.userId} href={`#/players/${r.userId}`} className={`podium-card${i === 0 ? ' first' : ''}`}>
                <span className={`podium-rank r${i + 1}`}>{r.rank}</span>
                <Avatar name={r.name} id={r.userId} size={46} />
                <span className="who"><strong>{r.name}</strong><span>{r.w} W · {r.d} D · {r.l} L</span></span>
                <span className="podium-pts"><strong>{r.points}</strong><span>points</span></span>
              </a>
            ))}
          </div>
        )}

        {data && data.ranked.length > 0 && (
          <div className="card table-card">
            <table className="board-table">
              <thead>
                <tr><th className="l">#</th><th className="l">Player</th><th>Played</th><th>W</th><th>D</th><th>L</th><th>Points</th><th>Per game</th><th>Win %</th><th className="l">Last five</th></tr>
              </thead>
              <tbody>{data.ranked.map((r) => <Row key={r.userId} r={r} me={session.user.id} />)}</tbody>
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

function Row({ r, me }: { r: LeaderboardRow; me: string }) {
  return (
    <tr className={r.userId === me ? 'me' : ''}>
      <td className="l muted">{r.rank}</td>
      <td className="l">
        <a className="player-link" href={`#/players/${r.userId}`}>
          <Avatar name={r.name} id={r.userId} size={30} />
          <strong>{r.name}</strong>
          {r.userId === me && <span className="you-tag">You</span>}
        </a>
      </td>
      <td>{r.played}</td><td>{r.w}</td><td>{r.d}</td><td>{r.l}</td>
      <td className="pts">{r.points}</td>
      <td>{perGame(r.points, r.played)}</td>
      <td>{winPct(r.w, r.played)}</td>
      <td className="l"><span className="form">{r.form.map((o, i) => <OutcomeChip key={i} outcome={o} />)}</span></td>
    </tr>
  );
}
