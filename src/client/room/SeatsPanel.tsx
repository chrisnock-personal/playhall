import type { GameClient, StageProps } from '../games/types';
import type { Panel3 } from './layout';
import { Avatar, Icon } from '../ui';

export function SeatsPanel({ state, onCycle, stage, game }: { state: Panel3; onCycle(): void; stage: StageProps; game?: GameClient }) {
  const { snap, send } = stage;
  const filled = snap.seats.filter((s) => s.userId).length;
  const canSit = (seatFree: boolean) => seatFree && snap.game.status !== 'playing' && !snap.you.seat
    && (snap.room.settings.seatPolicy === 'open' || snap.you.host);

  if (state === 'hidden') {
    return <button className="edge-tab vertical" onClick={onCycle} aria-label="Show players">Players {filled}/{snap.seats.length}</button>;
  }

  if (state === 'compact') {
    return (
      <aside className="seats-panel compact" aria-label="Players">
        <button className="icon-btn" aria-label="Hide players" onClick={onCycle}><Icon name="left" size={16} /></button>
        {snap.seats.map((s) => {
          const m = snap.members.find((x) => x.userId === s.userId);
          return (
            <div key={s.id} className="seat-mini" title={`${s.label}: ${s.name ?? 'free'}`}>
              {s.userId ? <Avatar name={s.name ?? '?'} id={s.userId} size={40} dim={m ? !m.online : false} /> : <span className="free-dot big">+</span>}
              <span className="seat-mini-label">{s.label}</span>
              {game?.seatExtra?.(stage, s.id)}
            </div>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="seats-panel" aria-label="Players">
      <div className="panel-head">
        <span className="label">Players {filled}/{snap.seats.length}</span>
        <button className="icon-btn" aria-label="Shrink players" onClick={onCycle}><Icon name="left" size={16} /></button>
      </div>
      {snap.seats.map((s) => {
        const m = snap.members.find((x) => x.userId === s.userId);
        return (
          <div key={s.id} className={`seat-card${s.userId === snap.you.userId ? ' mine' : ''}`}>
            <div className="seat-tile">
              {s.userId ? <Avatar name={s.name ?? '?'} id={s.userId} size={48} dim={m ? !m.online : false} /> : <span className="free-dot big">+</span>}
              <span className="video-note">Video in phase 2</span>
            </div>
            <div className="seat-meta">
              <div className="who">
                <strong>{s.name ?? 'Free seat'}</strong>
                <span>{s.label}{m?.host ? ' · host' : ''}{m && !m.online ? ' · away' : ''}</span>
              </div>
              {game?.seatExtra?.(stage, s.id)}
            </div>
            {canSit(!s.userId) && <button className="btn small primary wide" onClick={() => send({ t: 'sit', seat: s.id })}>Sit here</button>}
            {s.userId === snap.you.userId && snap.game.status !== 'playing' && (
              <button className="btn small wide" onClick={() => send({ t: 'stand' })}>Leave the seat</button>
            )}
          </div>
        );
      })}
    </aside>
  );
}
