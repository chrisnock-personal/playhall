import type { ClientMessage, RoomSnapshot } from '../../shared/protocol';
import type { Panel3, VideoSize } from './layout';
import type { Voice } from './useVoice';
import { VideoTile } from './VideoTile';
import { Avatar, Icon } from '../ui';

export function GalleryStrip({ state, onSet, snap, send, handUp, voice, video }: {
  state: Panel3; onSet(v: Panel3): void; snap: RoomSnapshot; send(m: ClientMessage): void; handUp: boolean;
  voice: Voice; video: VideoSize;
}) {
  const watchers = snap.members.filter((m) => !m.seat && m.online);
  const watching = !snap.you.seat;
  const handBtn = watching && snap.you.locked ? (
    <span className="pill locked-note" title={snap.you.locked}>🔒 Not open on your ladder yet: you can watch</span>
  ) : watching && (
    <button className={`btn small${handUp ? ' on' : ''}`} onClick={() => send({ t: 'hand', up: !handUp })}>
      <Icon name="hand" size={16} />{handUp ? 'Seat requested' : 'Ask for a seat'}
    </button>
  );

  if (state === 'hidden') {
    return <button className="edge-tab" onClick={() => onSet('compact')}>Watching · {watchers.length}</button>;
  }

  if (state === 'compact') {
    return (
      <div className="gallery compact" aria-label="Watching">
        <span className="label">Watching · {watchers.length}</span>
        <div className="gallery-avatars">
          {watchers.map((w) => (
            <span key={w.userId} className="gallery-av" title={`${w.name}${w.hand ? ' (asking for a seat)' : ''}`}>
              <Avatar name={w.name} id={w.userId} size={28} ring={w.hand} />
            </span>
          ))}
        </div>
        {handBtn}
        <button className="icon-btn" aria-label="Show watchers bigger" onClick={() => onSet('full')}><Icon name="up" size={16} /></button>
        <button className="icon-btn" aria-label="Hide watchers" onClick={() => onSet('hidden')}><Icon name="close" size={16} /></button>
      </div>
    );
  }

  return (
    <div className={`gallery full video-${video}`} aria-label="Watching">
      <div className="panel-head">
        <span className="label">Watching · {watchers.length}</span>
        <div className="row">
          {handBtn}
          <button className="icon-btn" aria-label="Shrink watchers" onClick={() => onSet('compact')}><Icon name="down" size={16} /></button>
        </div>
      </div>
      <div className="gallery-tiles">
        {watchers.length === 0 && <p className="empty">Nobody watching yet.</p>}
        {watchers.map((w) => (
          // Watchers' cameras (when the host allows them) show here, in the full strip only.
          <VideoTile key={w.userId} voice={voice} channel="gallery" id={w.userId} name={w.name} className="gallery-tile"
            fallback={<>
              <Avatar name={w.name} id={w.userId} size={36} ring={w.hand} />
              <span>{w.name}{w.userId === snap.you.userId ? ' (you)' : ''}</span>
              {w.hand && <span className="hand-tag">Wants a seat</span>}
            </>} />
        ))}
      </div>
    </div>
  );
}
