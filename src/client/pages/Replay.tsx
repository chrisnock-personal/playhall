import { useEffect, useMemo, useState } from 'react';
import { api, type Session } from '../api';
import { DEFAULT_SETTINGS, type ReplayResponse, type RoomSnapshot } from '../../shared/protocol';
import { AppBar } from '../AppBar';
import { GAME_CLIENTS } from '../games';
import { useGames } from '../useGames';

// A finished game, move by move, on the game's own board (read-only).
export function Replay({ session, onSignOut, id }: { session: Session; onSignOut(): void; id: string }) {
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const games = useGames();

  useEffect(() => {
    api<ReplayResponse>(`/games/${id}`, { token: session.token })
      .then((d) => { setData(d); setStep(d.frames.length - 1); })
      .catch((e) => { if (e.status === 401) onSignOut(); else setError(e.message); });
  }, [id, session.token, onSignOut]);

  const info = games.find((g) => g.id === data?.gameId);
  const snap = useMemo<RoomSnapshot | null>(() => {
    if (!data || !info) return null;
    const last = step === data.frames.length - 1;
    return {
      room: {
        id: 'replay', code: '', name: data.room, gameId: data.gameId, gameName: info.name, configLabel: '', hostId: '',
        settings: { ...DEFAULT_SETTINGS, gameConfig: info.defaultConfig }, locked: false, moveTimer: false, minPlayers: info.minPlayers, transcriptsAllowed: false,
      },
      seats: info.seats.map((s) => {
        const p = data.players.find((x) => x.seat === s.id);
        return { id: s.id, label: s.label, userId: p?.userId ?? null, name: p?.name ?? null };
      }),
      members: data.players.map((p) => ({ userId: p.userId, name: p.name, guest: false, online: true, host: false, seat: p.seat, hand: false })),
      queue: [],
      game: { status: 'playing', view: data.frames[step], result: last ? data.result : null, turnSeats: [], moveDeadline: null, leaving: {} },
      lastResult: null, rematch: null, chat: [],
      you: { userId: '', host: false, seat: null, canRead: [], canWrite: [], delay: 0,
        media: { table: { listen: false, talk: false, video: false }, gallery: { listen: false, talk: false, video: false } } },
      serverNow: Date.now(),
    };
  }, [data, info, step]);

  const Stage = data ? GAME_CLIENTS[data.gameId]?.Stage : undefined;
  const n = data ? data.frames.length - 1 : 0;
  return (
    <div className="page">
      <AppBar session={session} onSignOut={onSignOut} active={null} />
      <main className="replay-page">
        {error && <p className="form-error" role="alert">{error}</p>}
        {data && info && (
          <>
            <div className="board-head">
              <div>
                <h1>{info.name} replay</h1>
                <p className="muted">
                  {data.players.map((p) => `${p.name} (${info.seats.find((s) => s.id === p.seat)?.label})`).join(' v ')} · {data.room} · {new Date(data.endedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                  {data.result ? ` · ${data.result.winner ? `${info.seats.find((s) => s.id === data.result!.winner)?.label} won` : 'Draw'} by ${data.result.reason}` : ''}
                </p>
              </div>
            </div>
            <div className="replay-stage stage">{Stage && snap && <Stage snap={snap} receivedAt={Date.now()} send={() => {}} />}</div>
            <div className="replay-controls" role="group" aria-label="Replay controls">
              <button className="btn small" onClick={() => setStep(0)} disabled={step === 0}>First</button>
              <button className="btn small" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
              <label className="sr-only" htmlFor="replay-step">Move</label>
              <input id="replay-step" type="range" min={0} max={n} value={step} onChange={(e) => setStep(Number(e.target.value))} />
              <span className="muted">Move {step} of {n}</span>
              <button className="btn small primary" onClick={() => setStep((s) => Math.min(n, s + 1))} disabled={step === n}>Next</button>
              <button className="btn small" onClick={() => setStep(n)} disabled={step === n}>Last</button>
            </div>
          </>
        )}
        {!data && !error && <p className="muted">Loading…</p>}
      </main>
    </div>
  );
}
