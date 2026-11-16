import { useEffect, useState } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { Avatar, Icon } from '../ui';
import type { Voice } from './useVoice';

let mediaOn: Promise<boolean> | null = null;
/** Does this server have voice and video at all? (Asked once.) */
const serverHasMedia = () => (mediaOn ??= fetch('/api/health').then((r) => r.json()).then((h) => !!h.media).catch(() => false));

/** Join voice at the table or in the gallery, mute, see who's talking. */
export function VoiceDock({ voice, snap, compact }: { voice: Voice; snap: RoomSnapshot; compact?: boolean }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => { void serverHasMedia().then(setAvailable); }, []);
  if (!available) return null;

  const seated = !!snap.you.seat;
  const playing = snap.game.status === 'playing';
  // Players talk at the table; watchers default to the gallery and can listen in at the table.
  const choices: ('table' | 'gallery')[] = seated && playing ? ['table'] : seated ? ['table', 'gallery'] : ['gallery', 'table'];
  const label = (c: string) => (c === 'table' ? 'Table' : 'Gallery');

  if (voice.state !== 'on') {
    return (
      <div className="voice-dock off" role="group" aria-label="Voice">
        <button className="btn small" disabled={voice.state === 'joining'} onClick={() => voice.join(choices[0])}>
          <Icon name="headphones" size={16} />{voice.state === 'joining' ? 'Joining…' : compact ? 'Voice' : `Join voice: ${label(choices[0])}`}
        </button>
        {!compact && choices.length > 1 && voice.state !== 'joining' && (
          <button className="btn small ghost" onClick={() => voice.join(choices[1])}>{label(choices[1])}</button>
        )}
        {voice.error && <span className="voice-error" role="alert">{voice.error}</span>}
      </div>
    );
  }

  const others = choices.filter((c) => c !== voice.channel);
  return (
    <div className="voice-dock on" role="group" aria-label={`Voice: ${label(voice.channel!)}`}>
      <span className="voice-where" title="You're in this voice channel">{label(voice.channel!)}</span>
      {voice.canTalk ? (
        <button className={`icon-btn${voice.muted ? ' muted' : ' live'}`} onClick={voice.toggleMute} aria-pressed={!voice.muted}
          aria-label={voice.muted ? 'Unmute your microphone' : 'Mute your microphone'} title={voice.muted ? 'Unmute' : 'Mute'}>
          <Icon name={voice.muted ? 'micOff' : 'mic'} size={18} />
        </button>
      ) : <span className="voice-listen" title="You can listen here, not talk">Listening</span>}
      <div className="voice-people">
        {voice.people.slice(0, compact ? 4 : 8).map((p) => (
          <span key={p.id} className={`voice-av${p.speaking ? ' speaking' : ''}${p.muted ? ' quiet' : ''}`} title={`${p.name}${p.you ? ' (you)' : ''}${p.muted ? ', muted' : p.speaking ? ', talking' : ''}`}>
            <Avatar name={p.name} id={p.id} size={26} />
          </span>
        ))}
        {voice.people.length > (compact ? 4 : 8) && <span className="muted small">+{voice.people.length - (compact ? 4 : 8)}</span>}
      </div>
      {voice.needsClick && <button className="btn small primary" onClick={voice.startAudio}><Icon name="volume" size={16} />Turn sound on</button>}
      {!compact && others.map((c) => <button key={c} className="btn small ghost" onClick={() => voice.join(c)}>Go to {label(c)}</button>)}
      <button className="btn small" onClick={voice.leave}>Leave</button>
    </div>
  );
}
