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
  const [open, setOpen] = useState<string | null>(null);
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
        <button className="btn small" disabled={voice.state === 'joining'} onClick={() => voice.join(choices[0])}
          title="Voice and video: you join muted with your camera off, and see the cameras that are on">

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
      {!voice.canTalk ? <span className="voice-listen" title="You can listen here, not talk">Listening</span>
        : voice.mode === 'ptt' ? (
          <button className={`icon-btn ptt${voice.talking ? ' live' : ' muted'}`} aria-pressed={voice.talking}
            aria-label="Hold to talk (or hold Space)" title="Hold to talk, or hold Space"
            onPointerDown={() => voice.pushToTalk(true)} onPointerUp={() => voice.pushToTalk(false)} onPointerLeave={() => voice.talking && voice.pushToTalk(false)}>
            <Icon name={voice.talking ? 'mic' : 'micOff'} size={18} />
          </button>
        ) : (
          <button className={`icon-btn${voice.muted ? ' muted' : ' live'}`} onClick={voice.toggleMute} aria-pressed={!voice.muted}
            aria-label={voice.muted ? 'Unmute your microphone' : 'Mute your microphone'} title={voice.muted ? 'Unmute' : 'Mute'}>
            <Icon name={voice.muted ? 'micOff' : 'mic'} size={18} />
          </button>
        )}
      {voice.canVideo && (
        <button className={`icon-btn cam${voice.camera ? ' live on-air' : ''}`} onClick={voice.toggleCamera} disabled={voice.cameraBusy}
          aria-pressed={voice.camera} aria-label={voice.camera ? 'Turn your camera off' : 'Turn your camera on'}
          title={voice.camera ? 'Your camera is on: click to turn it off' : 'Turn your camera on'}>
          <Icon name={voice.camera ? 'camera' : 'cameraOff'} size={18} />
        </button>
      )}
      {voice.camera && !compact && <span className="cam-live" role="status">Camera on</span>}
      {voice.canTalk && !compact && (
        <select className="voice-mode" aria-label="How you talk" value={voice.mode} onChange={(e) => voice.setMode(e.target.value as 'open' | 'ptt')}>
          <option value="open">Open mic</option>
          <option value="ptt">Push to talk (Space)</option>
        </select>
      )}
      <div className="voice-people">
        {voice.people.slice(0, compact ? 4 : 8).map((p) => (
          <button key={p.id} className={`voice-av${p.speaking ? ' speaking' : ''}${p.muted ? ' quiet' : ''}${p.volume === 0 ? ' silenced' : ''}`}
            disabled={p.you} onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}
            title={`${p.name}${p.you ? ' (you)' : ''}${p.muted ? ', muted' : p.speaking ? ', talking' : ''}${p.volume === 0 ? ', silenced for you' : ''}`}
            aria-label={`${p.name}${p.you ? ' (you)' : ': volume'}`}>
            <Avatar name={p.name} id={p.id} size={26} />
          </button>
        ))}
        {open && (() => {
          const p = voice.people.find((x) => x.id === open);
          if (!p) return null;
          return (
            <div className="voice-pop" role="dialog" aria-label={`${p.name}: volume`}>
              <strong>{p.name}</strong>
              <label className="row"><Icon name="volume" size={16} />
                <input type="range" min={0} max={1} step={0.05} value={p.volume} aria-label={`Volume for ${p.name}`} onChange={(e) => voice.setVolume(p.id, Number(e.target.value))} />
              </label>
              <button className="btn small" onClick={() => voice.setVolume(p.id, p.volume === 0 ? 1 : 0)}>{p.volume === 0 ? 'Hear them again' : 'Silence for me'}</button>
              <span className="hint">Only changes what you hear.</span>
            </div>
          );
        })()}
        {voice.people.length > (compact ? 4 : 8) && <span className="muted small">+{voice.people.length - (compact ? 4 : 8)}</span>}
      </div>
      {voice.needsClick && <button className="btn small primary" onClick={voice.startAudio}><Icon name="volume" size={16} />Turn sound on</button>}
      {voice.error && <span className="voice-error" role="alert">{voice.error}</span>}
      {!compact && others.map((c) => <button key={c} className="btn small ghost" onClick={() => voice.join(c)}>Go to {label(c)}</button>)}
      <button className="btn small" onClick={voice.leave}>Leave</button>
    </div>
  );
}
