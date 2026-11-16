import { useEffect, useRef, type ReactNode } from 'react';
import type { Channel } from '../../shared/protocol';
import type { Voice } from './useVoice';

/** Someone's camera, or `fallback` (their avatar) while it's off or loading.
 *  Their video is only received while this is on screen; your own is mirrored. */
export function VideoTile({ voice, channel, id, name, fallback, className = '' }: {
  voice: Voice; channel: Channel; id: string | null; name: string; fallback: ReactNode; className?: string;
}) {
  const feed = id ? voice.feeds.find((f) => f.channel === channel && f.id === id) : undefined;
  const ref = useRef<HTMLVideoElement>(null);
  const on = !!feed;
  const you = !!feed?.you;
  const { watch } = voice;

  // Ask for their video only while the tile shows it.
  useEffect(() => (on && !you && id ? watch(channel, id) : undefined), [on, you, channel, id, watch]);

  const track = feed?.track;
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);

  const talking = !!id && voice.speaking[channel].includes(id);
  return (
    <div className={`video-tile${talking ? ' speaking' : ''}${track ? ' live' : ''} ${className}`} data-user={id ?? undefined}>
      {track
        // muted: the voice plays through its own element; playsInline for iPhone Safari.
        ? <video ref={ref} className={you ? 'mirror' : undefined} autoPlay muted playsInline aria-label={`${name}${you ? ' (you)' : ''}: camera`} />
        : fallback}
      {you && track && <span className="cam-badge" title="Your camera is on">Camera on</span>}
    </div>
  );
}
