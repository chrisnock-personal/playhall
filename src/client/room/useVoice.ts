// Voice in a room, through LiveKit. Each Playhall room has two voice channels
// matching the chats: the table and the gallery. The server decides who may
// listen and talk (and changes it live when a game starts or ends); this hook
// joins one channel, plays everyone else, and sends your microphone.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, RemoteTrack, Room } from 'livekit-client';
// Loaded on first use, so the app stays small for people who never join voice.
let lk: typeof import('livekit-client') | null = null;
const loadLiveKit = async () => (lk ??= await import('livekit-client'));
import { canPickSpeaker, chosen, constraints, listDevices, readDevicePrefs } from '../devices';
import type { Channel } from '../../shared/protocol';

export interface VoicePerson { id: string; name: string; speaking: boolean; muted: boolean; you: boolean }

export interface Voice {
  state: 'off' | 'joining' | 'on' | 'error';
  channel: Channel | null;
  canTalk: boolean;
  muted: boolean;
  /** The browser blocked sound until you click something. */
  needsClick: boolean;
  people: VoicePerson[];
  error: string | null;
  join(channel: Channel): Promise<void>;
  leave(): void;
  toggleMute(): Promise<void>;
  startAudio(): Promise<void>;
}

export function useVoice(code: string, sessionToken: string): Voice {
  const room = useRef<Room | null>(null);
  const audio = useRef(new Map<string, HTMLMediaElement[]>());
  const [state, setState] = useState<Voice['state']>('off');
  const [channel, setChannel] = useState<Channel | null>(null);
  const [canTalk, setCanTalk] = useState(false);
  const [muted, setMuted] = useState(true);
  const [needsClick, setNeedsClick] = useState(false);
  const [people, setPeople] = useState<VoicePerson[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const r = room.current;
    if (!r || !lk) { setPeople([]); return; }
    const { Track } = lk;
    const all: Participant[] = [r.localParticipant, ...r.remoteParticipants.values()];
    setPeople(all.map((p) => ({
      id: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, you: p === r.localParticipant,
      muted: !p.getTrackPublication(Track.Source.Microphone) || !!p.getTrackPublication(Track.Source.Microphone)?.isMuted,
    })));
    setCanTalk(!!r.localParticipant.permissions?.canPublish);
    setMuted(!r.localParticipant.isMicrophoneEnabled);
  }, []);

  const leave = useCallback(() => {
    const r = room.current;
    room.current = null;
    void r?.disconnect();
    for (const els of audio.current.values()) els.forEach((e) => e.remove());
    audio.current.clear();
    setState('off'); setChannel(null); setPeople([]); setMuted(true); setNeedsClick(false);
  }, []);

  const join = useCallback(async (ch: Channel) => {
    leave();
    setState('joining'); setError(null); setChannel(ch);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/media/${ch}`, { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Voice isn’t available');
      const { Room, RoomEvent, Track } = await loadLiveKit();
      const r = new Room({ adaptiveStream: true, dynacast: true });
      room.current = r;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, p) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.dataset.voice = p.identity;
        document.body.appendChild(el);
        audio.current.set(track.sid ?? p.identity, [...(audio.current.get(track.sid ?? p.identity) ?? []), el]);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => { track.detach().forEach((e) => e.remove()); });
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsClick(!r.canPlaybackAudio));
      r.on(RoomEvent.Disconnected, () => { if (room.current === r) leave(); });
      for (const ev of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ActiveSpeakersChanged,
        RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
        RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.ParticipantPermissionsChanged]) r.on(ev, refresh);

      await r.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`, data.token);
      const devices = await listDevices().catch(() => null);
      const prefs = readDevicePrefs();
      const out = devices ? chosen('audiooutput', devices.audiooutput, prefs) : undefined;
      if (out && canPickSpeaker()) await r.switchActiveDevice('audiooutput', out).catch(() => {});
      // Talkers join unmuted, as in a real room; one click mutes.
      if (data.talk) await r.localParticipant.setMicrophoneEnabled(true, constraints('audio', prefs, devices?.audioinput) as object);
      setNeedsClick(!r.canPlaybackAudio);
      setState('on');
      refresh();
    } catch (e) {
      leave();
      setState('error');
      setError((e as Error).name === 'NotAllowedError' ? 'The browser didn’t allow the microphone' : (e as Error).message);
    }
  }, [code, sessionToken, leave, refresh]);

  const toggleMute = useCallback(async () => {
    const r = room.current;
    if (!r || !r.localParticipant.permissions?.canPublish) return;
    const on = r.localParticipant.isMicrophoneEnabled;
    const devices = await listDevices().catch(() => null);
    await r.localParticipant.setMicrophoneEnabled(!on, on ? undefined : constraints('audio', readDevicePrefs(), devices?.audioinput) as object);
    refresh();
  }, [refresh]);

  const startAudio = useCallback(async () => { await room.current?.startAudio(); setNeedsClick(false); }, []);

  useEffect(() => leave, [leave]);

  return { state, channel, canTalk, muted, needsClick, people, error, join, leave, toggleMute, startAudio };
}
