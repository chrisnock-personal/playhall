// Transcripts, the speaker's side: while the room has transcripts on and your
// mic is live (unmuted, or push to talk held), your own browser cuts what you
// say into utterances and sends each to Playhall, which has Whisper write it
// down as a *said* line in the channel you're talking in. Nothing is sent
// while you're muted, while the rule is off, or when the server doesn't allow
// transcripts; nothing is kept in the browser after it's sent.

import { useEffect, useRef, useState } from 'react';
import { isTeamVoiceChannel, type RoomSnapshot } from '../../shared/protocol';
import type { Voice } from './useVoice';
import { tapMic } from '../transcribe/capture';
import { Utterances } from '../transcribe/vad';
import { encodeWav, Resampler } from '../transcribe/wav';

export interface Transcriber {
  /** The room has transcripts on (and the server allows them). */
  on: boolean;
  /** Your speech is being listened for right now. */
  listening: boolean;
  /** Utterances on their way to Whisper. */
  sending: number;
  error: string | null;
}

export const transcriptsOn = (snap: RoomSnapshot | null) => !!snap && snap.room.settings.transcripts && snap.room.transcriptsAllowed;

export function useTranscriber(code: string, token: string, snap: RoomSnapshot | null, voice: Voice): Transcriber {
  const on = transcriptsOn(snap);
  // Team voice is private audio; transcripts only go to the open channels.
  const channel = voice.state === 'on' && voice.channel && !isTeamVoiceChannel(voice.channel) ? voice.channel : null;
  const track = on && channel && voice.canTalk ? voice.micTrack : null;
  const live = !!track && (voice.mode === 'ptt' ? voice.talking && !voice.muted : !voice.muted);
  const [sending, setSending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Turned off by the server mid-session (403/503): stop until the rule changes.
  const [refused, setRefused] = useState(false);
  useEffect(() => { setRefused(false); setError(null); }, [on, channel]);

  const liveRef = useRef(live);
  const vad = useRef<Utterances | null>(null);
  const send = useRef<(u: Float32Array) => void>(() => {});

  send.current = (u: Float32Array) => {
    if (!channel) return;
    setSending((n) => n + 1);
    fetch(`/api/rooms/${encodeURIComponent(code)}/said/${channel}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav' }, body: encodeWav(u) as BodyInit,
    }).then(async (r) => {
      if (r.ok) { setError(null); return; }
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? 'Couldn’t write that down');
      if (r.status === 403 || r.status === 503) setRefused(true);
    }).catch(() => setError('Couldn’t reach the server')).finally(() => setSending((n) => n - 1));
  };

  // The mic tap runs while you may be transcribed; samples only count while live.
  const active = !!track && !refused;
  useEffect(() => {
    if (!active || !track) return;
    let stopped = false, stop = () => {};
    const segmenter = new Utterances();
    vad.current = segmenter;
    let resampler: Resampler | null = null;
    tapMic(track, (samples) => {
      if (stopped || !liveRef.current || !resampler) return;
      for (const u of segmenter.push(resampler.push(samples))) send.current(u);
    }).then((tap) => {
      if (stopped) { tap.stop(); return; }
      resampler = new Resampler(tap.rate);
      stop = tap.stop;
    }).catch((e) => setError(`Transcripts can’t hear your microphone: ${(e as Error).message}`));
    return () => { stopped = true; stop(); segmenter.reset(); if (vad.current === segmenter) vad.current = null; };
  }, [active, track]);

  // Muting or letting go of push to talk ends what you were saying: send it.
  useEffect(() => {
    liveRef.current = live && active;
    if (!liveRef.current) {
      const u = vad.current?.flush();
      if (u) send.current(u);
    }
  }, [live, active]);

  return { on, listening: live && active, sending, error };
}
