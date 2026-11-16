import { useEffect, useState } from 'react';
import type { ClientMessage, RoomSnapshot } from '../../shared/protocol';
import { Icon } from '../ui';
import { Rematch } from '../kit/kit';

// Shown over the stage when a game ends: points gained, new totals and
// ranks, and the head-to-head record. Gone when the next game starts.
export function ResultCard({ snap, send }: { snap: RoomSnapshot; send(m: ClientMessage): void }) {
  const r = snap.lastResult;
  const [closed, setClosed] = useState(false);
  useEffect(() => { setClosed(false); }, [r]);
  if (!r || closed || snap.game.status !== 'over') return null;

  const result = snap.game.result;
  const winners = r.players.filter((p) => p.outcome === 'win');
  const title = winners.length ? `${winners.map((p) => p.name).join(', ')} ${winners.length === 1 ? 'wins' : 'win'}${result ? ` by ${result.reason}` : ''}`
    : result?.nobodyWins ? `Nobody wins: ${result.reason}` : `Draw${result ? ` by ${result.reason}` : ''}`;
  const [a, b] = r.players;
  const canStart = snap.you.host && snap.seats.filter((s) => s.userId).length >= snap.room.minPlayers;

  return (
    <div className="result-card" role="status">
      <div className="row-between">
        <h2>{title}</h2>
        <button className="icon-btn" aria-label="Close" onClick={() => setClosed(true)}><Icon name="close" size={16} /></button>
      </div>
      <div className="result-players">
        {r.players.map((p) => (
          <div key={p.userId} className={`result-player ${p.outcome}`}>
            <span className="name">{p.name} · {snap.seats.find((s) => s.id === p.seat)?.label}</span>
            <strong>+{p.points}</strong>
            <span className="muted">
              {r.counted && p.total !== null ? `${p.total} point${p.total === 1 ? '' : 's'}${p.rank ? ` · #${p.rank}` : ' · not ranked yet'}` : 'not counted'}
            </span>
          </div>
        ))}
      </div>
      {r.headToHead && a && b && (
        <p className="muted">Head to head: {a.name} {r.headToHead.w} – {r.headToHead.d} – {r.headToHead.l} {b.name}</p>
      )}
      {r.note && <p className="hint">{r.note}</p>}
      <div className="row">
        {canStart && <button className="btn small primary" onClick={() => send({ t: 'start' })}>Start the next game</button>}
        <Rematch snap={snap} send={send} />
        {r.replayable && <a className="btn small" href={`#/replay/${r.gameRowId}`}>Review the game</a>}
        <a className="btn small" href="#/leaderboard">Leaderboard</a>
      </div>
    </div>
  );
}
