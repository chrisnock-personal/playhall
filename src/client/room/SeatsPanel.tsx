import type { GameClient, StageProps } from '../games/types';
import type { Panel3, VideoSize } from './layout';
import type { Voice } from './useVoice';
import { VideoTile } from './VideoTile';
import { Avatar, Icon } from '../ui';
import { useGames } from '../useGames';

export function SeatsPanel({ state, onCycle, onExpand, stage, game, voice, video, onVideo }: {
  /** Set when the panel is compact only for the game: opens it out again. */
  state: Panel3; onCycle(): void; onExpand?(): void; stage: StageProps; game?: GameClient;
  voice: Voice; video: VideoSize; onVideo(v: VideoSize): void;
}) {
  const { snap, send } = stage;
  const filled = snap.seats.filter((s) => s.userId).length;
  const canSit = (seatFree: boolean) => seatFree && snap.game.status !== 'playing' && !snap.you.seat
    && (snap.room.settings.seatPolicy === 'open' || snap.you.host);
  // Players' cameras are in the table channel; anyone who may see it gets them.
  const anyVideo = voice.feeds.some((f) => f.channel === 'table');
  // The host can put a computer player in a free seat, between games (#18).
  const bots = !!useGames().find((g) => g.id === snap.room.gameId)?.bots;
  const canAddBot = (seatFree: boolean) => bots && seatFree && snap.you.host && snap.game.status !== 'playing';

  if (state === 'hidden') {
    return <button className="edge-tab vertical" onClick={onCycle} aria-label="Show players">Players {filled}/{snap.seats.length}</button>;
  }

  if (state === 'compact') {
    return (
      <aside className="seats-panel compact" aria-label="Players">
        <div className="seats-mini-head">
          {onExpand && <button className="icon-btn small" aria-label="Show the players panel in full" title="Show in full" onClick={onExpand}><Icon name="right" size={16} /></button>}
          <button className={`icon-btn${onExpand ? ' small' : ''}`} aria-label="Hide players" onClick={onCycle}><Icon name="left" size={16} /></button>
        </div>
        {/* Free seats can't be taken during a game, so they're left out. */}
        {snap.seats.filter((s) => s.userId || snap.game.status !== 'playing').map((s) => {
          const m = snap.members.find((x) => x.userId === s.userId);
          const avatar = s.userId ? <Avatar name={s.name ?? '?'} id={s.userId} size={40} dim={m ? !m.online : false} /> : <span className="free-dot big">+</span>;
          return (
            <div key={s.id} className="seat-mini" title={`${s.label}: ${s.name ?? 'free'}`}>
              {s.userId ? <VideoTile voice={voice} channel="table" id={s.userId} name={s.name ?? '?'} fallback={avatar} className="mini" /> : avatar}
              <span className="seat-mini-label">{s.label}</span>
              {game?.seatExtra?.(stage, s.id)}
            </div>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className={`seats-panel video-${video}`} aria-label="Players">
      <div className="panel-head">
        <span className="label">Players {filled}/{snap.seats.length}</span>
        <div className="row">
          {anyVideo && (
            <button className="icon-btn" aria-label={video === 'big' ? 'Smaller video' : 'Bigger video'} title={video === 'big' ? 'Smaller video' : 'Bigger video'}
              aria-pressed={video === 'big'} onClick={() => onVideo(video === 'big' ? 'normal' : 'big')}>
              <Icon name="camera" size={16} />
            </button>
          )}
          <button className="icon-btn" aria-label="Shrink players" onClick={onCycle}><Icon name="left" size={16} /></button>
        </div>
      </div>
      {snap.seats.map((s) => {
        const m = snap.members.find((x) => x.userId === s.userId);
        const avatar = s.userId ? <Avatar name={s.name ?? '?'} id={s.userId} size={48} dim={m ? !m.online : false} /> : <span className="free-dot big">+</span>;
        return (
          <div key={s.id} className={`seat-card${s.userId === snap.you.userId ? ' mine' : ''}`} data-seat={s.id}>
            <VideoTile voice={voice} channel="table" id={s.userId} name={s.name ?? 'Free seat'} fallback={avatar} className="seat-tile" />
            <div className="seat-meta">
              <div className="who">
                <strong>{s.name ?? 'Free seat'}</strong>
                <span>{s.label}{m?.host ? ' · host' : ''}{m && !m.online ? ' · away' : ''}</span>
              </div>
              {game?.seatExtra?.(stage, s.id)}
            </div>
            {canSit(!s.userId) && <button className="btn small primary wide" onClick={() => send({ t: 'sit', seat: s.id })}>Sit here</button>}
            {canAddBot(!s.userId) && <button className="btn small wide" onClick={() => send({ t: 'addBot', seat: s.id })}><Icon name="bot" size={16} />Add a bot</button>}
            {canAddBot(!s.userId) && snap.room.aiPlayers && <button className="btn small wide" onClick={() => send({ t: 'addBot', seat: s.id, ai: true })}><Icon name="spark" size={16} />Add an AI player</button>}
            {s.bot && snap.you.host && snap.game.status !== 'playing' && (
              <button className="btn small wide" onClick={() => send({ t: 'unseat', userId: s.userId! })}>{s.ai ? 'Remove the AI player' : 'Remove the bot'}</button>
            )}
            {s.userId === snap.you.userId && snap.game.status !== 'playing' && (
              <button className="btn small wide" onClick={() => send({ t: 'stand' })}>Leave the seat</button>
            )}
          </div>
        );
      })}
    </aside>
  );
}
