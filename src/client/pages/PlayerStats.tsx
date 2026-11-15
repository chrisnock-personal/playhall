import { useEffect, useState } from 'react';
import { api, type Session } from '../api';
import type { Period, PlayerStatsResponse } from '../../shared/protocol';
import { AppBar } from '../AppBar';
import { Avatar, OutcomeChip, PeriodPicker, perGame, winPct } from '../ui';

const OUTCOME_WORD = { win: 'Win', draw: 'Draw', loss: 'Loss' } as const;

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 0 && new Date().getDate() === d.getDate()) return `Today, ${time}`;
  if (days <= 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function Bar({ w, d, l, label }: { w: number; d: number; l: number; label: string }) {
  return (
    <div className="wdl-bar" role="img" aria-label={label}>
      {w > 0 && <span className="w" style={{ flex: w }} />}
      {d > 0 && <span className="d" style={{ flex: d }} />}
      {l > 0 && <span className="l" style={{ flex: l }} />}
    </div>
  );
}

export function PlayerStats({ session, onSignOut, userId }: { session: Session; onSignOut(): void; userId: string }) {
  const [period, setPeriod] = useState<Period>('all');
  const [data, setData] = useState<PlayerStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = userId === session.user.id;

  useEffect(() => {
    api<PlayerStatsResponse>(`/players/${userId}/stats?game=chess&period=${period}`, { token: session.token })
      .then((d) => { setData(d); setError(null); })
      .catch((e) => { if (e.status === 401) onSignOut(); else setError(e.message); });
  }, [userId, period, session.token, onSignOut]);

  const t = data?.totals;
  const maxWeek = Math.max(1, ...(data?.weekly.map((w) => w.points) ?? [1]));
  const maxEnding = Math.max(1, ...(data?.endings.map((e) => e.n) ?? [1]));
  const streak = data?.streak.current;
  const periodWord = period === 'all' ? 'all time' : `this ${period}`;

  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active={mine ? 'stats' : null} />
      <main className="stats-page">
        {error && <p className="form-error" role="alert">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && t && (
          <>
            <section className="stats-main">
              <div className="stats-head">
                <Avatar name={data.user.name} id={data.user.id} size={64} />
                <div className="who">
                  <h1>{data.user.name}</h1>
                  <span>
                    Chess{data.rank ? ` · #${data.rank} ${periodWord}` : ''} · playing since {new Date(data.user.since).toLocaleDateString([], { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <PeriodPicker value={period} onChange={setPeriod} />
              </div>

              {data.user.guest && <p className="hint">Guests’ games don’t count towards stats or leaderboards. Create an account to start a record.</p>}

              {t.played === 0 ? (
                <div className="card"><p className="empty">No counted games {periodWord}.</p></div>
              ) : (
                <>
                  <div className="tiles">
                    <div className="card tile"><span className="label">Points</span><strong>{t.points}</strong><span className="muted">{data.rank ? `#${data.rank} in chess` : 'Not ranked yet'}</span></div>
                    <div className="card tile"><span className="label">Played</span><strong>{t.played}</strong><span className="muted">{t.w} W · {t.d} D · {t.l} L</span></div>
                    <div className="card tile"><span className="label">Per game</span><strong>{perGame(t.points, t.played)}</strong><span className="muted">out of 3</span></div>
                    <div className="card tile"><span className="label">Win rate</span><strong>{winPct(t.w, t.played)}</strong><span className="muted">draws count as not won</span></div>
                    <div className="card tile"><span className="label">Streak</span><strong>{streak ? `${streak.outcome[0].toUpperCase()}${streak.length}` : '-'}</strong><span className="muted">best: {data.streak.bestWins} {data.streak.bestWins === 1 ? 'win' : 'wins'} in a row</span></div>
                  </div>

                  <div className="card">
                    <div className="row-between"><h2>Results</h2><span className="muted">{t.w} won · {t.d} drawn · {t.l} lost</span></div>
                    <Bar w={t.w} d={t.d} l={t.l} label={`${t.w} wins, ${t.d} draws, ${t.l} losses`} />
                    <div className="by-seat">
                      {data.bySeat.map((s) => (
                        <div key={s.seat} className="seat-stat">
                          <span className={`side-dot ${s.seat}`} aria-hidden="true" />
                          <span className="who"><strong>As {s.label}</strong><span>{s.played} games · {s.w} W {s.d} D {s.l} L</span></span>
                          <span className="seat-pts"><strong>{s.points}</strong><span>{s.played ? perGame(s.points, s.played) : '-'} a game</span></span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="two-col">
                    <div className="card">
                      <h2>Points per week</h2>
                      <div className="week-bars" role="img" aria-label={`Points per week for the last eight weeks: ${data.weekly.map((w) => w.points).join(', ')}`}>
                        {data.weekly.map((w, i) => (
                          <div key={w.weekStart} className="week">
                            <span className="v">{w.points}</span>
                            <span className={`bar${i === data.weekly.length - 1 ? ' now' : ''}`} style={{ height: `${Math.round((w.points / maxWeek) * 100)}px` }} />
                            <span className="muted">{i === data.weekly.length - 1 ? 'This' : new Date(w.weekStart).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="card">
                      <h2>How games ended</h2>
                      {data.endings.map((e) => (
                        <div key={e.reason} className="ending">
                          <span>{e.reason[0].toUpperCase() + e.reason.slice(1)}</span>
                          <span className="track"><span style={{ width: `${Math.round((e.n / maxEnding) * 100)}%` }} /></span>
                          <span className="n">{e.n}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="card">
                    <h2>Recent games</h2>
                    <ul className="recent">
                      {data.recent.map((g, i) => (
                        <li key={i}>
                          <OutcomeChip outcome={g.outcome} big />
                          <span className="who">
                            <strong>{OUTCOME_WORD[g.outcome]} vs {g.opponentId ? <a href={`#/players/${g.opponentId}`}>{g.opponent}</a> : g.opponent ?? 'someone'}</strong>
                            <span>{g.reason[0].toUpperCase() + g.reason.slice(1)} · {g.seatLabel} · {g.room} · {when(g.endedAt)}</span>
                          </span>
                          <span className={`pts ${g.outcome}`}>+{g.points}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </section>

            <aside className="stats-side">
              <div className="card">
                <h2>Head to head</h2>
                {data.headToHead.length === 0 && <p className="empty">No opponents yet.</p>}
                {data.headToHead.map((h) => (
                  <a key={h.userId} className="h2h" href={`#/players/${h.userId}`}>
                    <Avatar name={h.name} id={h.userId} size={30} />
                    <strong>{h.name}</strong>
                    <span className="mono">{h.w}–{h.d}–{h.l}</span>
                    <Bar w={h.w} d={h.d} l={h.l} label={`${h.w} wins, ${h.d} draws, ${h.l} losses against ${h.name}`} />
                  </a>
                ))}
                <span className="hint">Won–drawn–lost, {periodWord}.</span>
              </div>
            </aside>
          </>
        )}
      </main>
    </div>
  );
}
