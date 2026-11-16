// Voice and video in a room, through LiveKit. Each Playhall room has two
// channels matching the chats: the table and the gallery. The server decides
// who may listen, talk and send their camera (and changes it live when a game
// starts or ends); this hook joins one channel, plays everyone else, and sends
// your microphone and, when you switch it on, your camera.
//
// Video: players' cameras go to the table (their seat cards), watchers' to the
// gallery (the gallery strip, when the host allows it). So you can see both,
// while you're in one channel's voice the hook also opens a second, video-only
// connection to the other channel when you may see it. Video is only fetched
// for tiles actually on screen (watch()), at a modest size, with simulcast.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, RemoteTrack, RemoteTrackPublication, Room, Track as LkTrack } from 'livekit-client';
// Loaded on first use, so the app stays small for people who never join voice.
let lk: typeof import('livekit-client') | null = null;
const loadLiveKit = async () => (lk ??= await import('livekit-client'));
import { canPickSpeaker, chosen, constraints, listDevices, readDevicePrefs } from '../devices';
import type { Channel } from '../../shared/protocol';

export interface VoicePerson { id: string; name: string; speaking: boolean; muted: boolean; you: boolean; volume: number }
export type VoiceMode = 'open' | 'ptt';

/** A camera that's on, in one channel. `track` is there once it's received
 *  (yours at once; someone else's after a tile asks for it with watch()). */
export interface VideoFeed { channel: Channel; id: string; you: boolean; track: LkTrack | undefined }

const MODE_KEY = 'playhall.voiceMode';
const readMode = (): VoiceMode => { try { return localStorage.getItem(MODE_KEY) === 'ptt' ? 'ptt' : 'open'; } catch { return 'open'; } };
const other = (c: Channel): Channel => (c === 'table' ? 'gallery' : 'table');
const key = (c: Channel, id: string) => `${c}|${id}`;
/** LiveKit's protocol number for the camera in a permission's source list. */
const CAMERA_SOURCE = 1;

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
  /** Open mic (mute/unmute) or push to talk (hold Space or the mic button). */
  mode: VoiceMode;
  setMode(m: VoiceMode): void;
  talking: boolean;
  pushToTalk(down: boolean): void;
  /** Your own volume for one person, 0 to 1 (0 mutes them for you only). */
  setVolume(id: string, v: number): void;
  /** You may send your camera in the channel you're in. */
  canVideo: boolean;
  /** Your camera is on. */
  camera: boolean;
  cameraBusy: boolean;
  toggleCamera(): Promise<void>;
  /** Cameras that are on, in your channel and the one you're viewing. */
  feeds: VideoFeed[];
  /** Who's talking, per channel (for the ring on tiles). */
  speaking: Record<Channel, string[]>;
  /** Ask for someone's video while their tile is on screen; returns the "done" call. */
  watch(channel: Channel, id: string): () => void;
  /** Also show video from this other channel (null: none). */
  view(channel: Channel | null): void;
  /** Your microphone's track while it's published (for transcripts). */
  micTrack: MediaStreamTrack | null;
}

export function useVoice(code: string, sessionToken: string): Voice {
  const room = useRef<Room | null>(null);
  const viewRoom = useRef<Room | null>(null);
  const viewing = useRef<Channel | null>(null);
  const viewWanted = useRef<Channel | null>(null);
  const audio = useRef(new Map<string, HTMLMediaElement[]>());
  const wanted = useRef(new Map<string, number>());
  const [state, setState] = useState<Voice['state']>('off');
  const [channel, setChannel] = useState<Channel | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const [canTalk, setCanTalk] = useState(false);
  const [canVideo, setCanVideo] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [muted, setMuted] = useState(true);
  const [needsClick, setNeedsClick] = useState(false);
  const [people, setPeople] = useState<VoicePerson[]>([]);
  const [feeds, setFeeds] = useState<VideoFeed[]>([]);
  const [speaking, setSpeaking] = useState<Record<Channel, string[]>>({ table: [], gallery: [] });
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<VoiceMode>(readMode);
  const [talking, setTalking] = useState(false);
  const volumes = useRef(new Map<string, number>());
  const [micTrack, setMicTrack] = useState<MediaStreamTrack | null>(null);

  /** Subscribe to what's needed and nothing else: everyone's voice in your
   *  channel, and only the cameras whose tiles are on screen. */
  const reconcile = useCallback(() => {
    if (!lk) return;
    const { Track } = lk;
    const conns: [Room | null, Channel | null, boolean][] = [[room.current, channelRef.current, true], [viewRoom.current, viewing.current, false]];
    for (const [r, ch, main] of conns) {
      if (!r || !ch) continue;
      for (const p of r.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values() as IterableIterator<RemoteTrackPublication>) {
          const want = pub.kind === Track.Kind.Audio ? main
            : pub.source === Track.Source.Camera && (wanted.current.get(key(ch, p.identity)) ?? 0) > 0;
          if (pub.isDesired !== want) pub.setSubscribed(want);
        }
      }
    }
  }, []);

  const refresh = useCallback(() => {
    const r = room.current;
    if (!r || !lk) { setPeople([]); setFeeds([]); setSpeaking({ table: [], gallery: [] }); return; }
    const { Track } = lk;
    const all: Participant[] = [r.localParticipant, ...r.remoteParticipants.values()];
    setPeople(all.map((p) => ({
      id: p.identity, name: p.name || p.identity, speaking: p.isSpeaking, you: p === r.localParticipant,
      muted: !p.getTrackPublication(Track.Source.Microphone) || !!p.getTrackPublication(Track.Source.Microphone)?.isMuted,
      volume: volumes.current.get(p.identity) ?? 1,
    })));
    const perm = r.localParticipant.permissions;
    const sources = (perm?.canPublishSources ?? []) as number[];
    setCanTalk(!!perm?.canPublish);
    setCanVideo(!!perm?.canPublish && (sources.length === 0 || sources.includes(CAMERA_SOURCE)));
    setMuted(!r.localParticipant.isMicrophoneEnabled);
    setCamera(r.localParticipant.isCameraEnabled);
    const out: VideoFeed[] = [];
    const talk: Record<Channel, string[]> = { table: [], gallery: [] };
    for (const [conn, ch] of [[r, channelRef.current], [viewRoom.current, viewing.current]] as [Room | null, Channel | null][]) {
      if (!conn || !ch) continue;
      for (const p of [conn.localParticipant, ...conn.remoteParticipants.values()] as Participant[]) {
        const you = p === conn.localParticipant;
        if (you && conn !== r) continue; // the view connection never sends
        if (p.isSpeaking) talk[ch].push(p.identity);
        const cam = p.getTrackPublication(Track.Source.Camera);
        if (cam && !cam.isMuted) out.push({ channel: ch, id: p.identity, you, track: cam.track });
      }
    }
    setFeeds(out);
    setSpeaking(talk);
    setMicTrack(r.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null);
  }, []);

  /** Events that change who's there, what they send, or what we receive. */
  const listen = useCallback((r: Room) => {
    if (!lk) return;
    const { RoomEvent } = lk;
    const update = () => { reconcile(); refresh(); };
    for (const ev of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ActiveSpeakersChanged,
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
      RoomEvent.ParticipantPermissionsChanged]) r.on(ev, update);
  }, [reconcile, refresh]);

  const tokenFor = useCallback(async (ch: Channel) => {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/media/${ch}`, { method: 'POST', headers: { authorization: `Bearer ${sessionToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Voice isn’t available');
    return data.token as string;
  }, [code, sessionToken]);

  const url = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

  const closeView = useCallback(() => {
    const v = viewRoom.current;
    viewRoom.current = null;
    viewing.current = null;
    void v?.disconnect();
  }, []);

  const openView = useCallback(async (ch: Channel) => {
    if (viewing.current === ch || !room.current) return;
    closeView();
    viewing.current = ch;
    try {
      const token = await tokenFor(ch);
      const { Room, RoomEvent } = await loadLiveKit();
      if (viewing.current !== ch || !room.current) return;
      const v = new Room({ adaptiveStream: true, dynacast: true });
      viewRoom.current = v;
      listen(v);
      v.on(RoomEvent.Disconnected, () => {
        if (viewRoom.current !== v) return;
        viewRoom.current = null; viewing.current = null; refresh();
        // Dropped by the network (not by the rules): try again shortly.
        setTimeout(() => { const w = viewWanted.current; if (w && room.current && !viewing.current) void openView(w); }, 3000);
      });
      await v.connect(url(), token, { autoSubscribe: false });
      if (viewRoom.current !== v) { void v.disconnect(); return; }
      reconcile(); refresh();
    } catch {
      // Not allowed to see that channel right now (the server said no): no video from it.
      if (viewing.current === ch) { viewRoom.current = null; viewing.current = null; }
      refresh();
    }
  }, [closeView, tokenFor, listen, reconcile, refresh]);

  const view = useCallback((ch: Channel | null) => {
    viewWanted.current = ch;
    if (!ch) { if (viewing.current) { closeView(); refresh(); } return; }
    if (viewing.current !== ch) void openView(ch);
  }, [closeView, openView, refresh]);

  const leave = useCallback(() => {
    const r = room.current;
    room.current = null;
    channelRef.current = null;
    void r?.disconnect();
    closeView();
    for (const els of audio.current.values()) els.forEach((e) => e.remove());
    audio.current.clear();
    setState('off'); setChannel(null); setPeople([]); setFeeds([]); setSpeaking({ table: [], gallery: [] });
    setMuted(true); setCamera(false); setNeedsClick(false); setMicTrack(null);
  }, [closeView]);

  const join = useCallback(async (ch: Channel) => {
    leave();
    setState('joining'); setError(null); setChannel(ch);
    try {
      const token = await tokenFor(ch);
      const { Room, RoomEvent, Track, VideoPresets } = await loadLiveKit();
      const r = new Room({
        adaptiveStream: true, dynacast: true,
        // Seat cards and gallery tiles are small: 640x360 is plenty, with a
        // 320x180 layer for the smallest tiles and slow connections.
        videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
        publishDefaults: { simulcast: true, videoEncoding: VideoPresets.h360.encoding, videoSimulcastLayers: [VideoPresets.h180] },
      });
      room.current = r;
      channelRef.current = ch;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, p) => {
        if (track.kind !== Track.Kind.Audio) return;
        const v = volumes.current.get(p.identity);
        if (v !== undefined) (p as unknown as { setVolume(v: number): void }).setVolume(v);
        const el = track.attach();
        el.dataset.voice = p.identity;
        document.body.appendChild(el);
        audio.current.set(track.sid ?? p.identity, [...(audio.current.get(track.sid ?? p.identity) ?? []), el]);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => { if (track.kind === Track.Kind.Audio) track.detach().forEach((e) => e.remove()); });
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsClick(!r.canPlaybackAudio));
      r.on(RoomEvent.Disconnected, () => { if (room.current === r) leave(); });
      // The rules changed (the game started, the host turned watcher video
      // off): stop a camera you may no longer send.
      r.on(RoomEvent.ParticipantPermissionsChanged, (_prev, p) => {
        if (p && p !== r.localParticipant) return;
        const perm = r.localParticipant.permissions;
        const sources = (perm?.canPublishSources ?? []) as number[];
        const allowed = !!perm?.canPublish && (sources.length === 0 || sources.includes(CAMERA_SOURCE));
        const cam = r.localParticipant.getTrackPublication(Track.Source.Camera);
        if (!allowed && cam?.track) void r.localParticipant.unpublishTrack(cam.track, true).catch(() => {}).then(refresh);
      });
      listen(r);

      // Nothing is received until asked for (reconcile): voice at once, video per tile.
      await r.connect(url(), token, { autoSubscribe: false });
      reconcile();
      const devices = await listDevices().catch(() => null);
      const prefs = readDevicePrefs();
      const out = devices ? chosen('audiooutput', devices.audiooutput, prefs) : undefined;
      if (out && canPickSpeaker()) await r.switchActiveDevice('audiooutput', out).catch(() => {});
      // You join muted, camera off (the plan for phase 2): one click on each to start.
      setNeedsClick(!r.canPlaybackAudio);
      setState('on');
      refresh();
      if (viewWanted.current && viewWanted.current !== ch) void openView(viewWanted.current);
    } catch (e) {
      leave();
      setState('error');
      setError((e as Error).name === 'NotAllowedError' ? 'The browser didn’t allow the microphone' : (e as Error).message);
    }
  }, [leave, tokenFor, listen, reconcile, refresh, openView]);

  const toggleMute = useCallback(async () => {
    const r = room.current;
    if (!r || !r.localParticipant.permissions?.canPublish) return;
    const on = r.localParticipant.isMicrophoneEnabled;
    const devices = await listDevices().catch(() => null);
    await r.localParticipant.setMicrophoneEnabled(!on, on ? undefined : constraints('audio', readDevicePrefs(), devices?.audioinput) as object);
    refresh();
  }, [refresh]);

  const toggleCamera = useCallback(async () => {
    const r = room.current;
    if (!r || !lk || cameraBusy) return;
    const on = r.localParticipant.isCameraEnabled;
    setCameraBusy(true); setError(null);
    try {
      if (on) await r.localParticipant.setCameraEnabled(false);
      else {
        // The camera chosen in Settings; the size is ours (small tiles).
        const devices = await listDevices().catch(() => null);
        const c = constraints('video', readDevicePrefs(), devices?.videoinput);
        const deviceId = typeof c === 'object' ? c.deviceId : undefined;
        await r.localParticipant.setCameraEnabled(true, { deviceId, resolution: lk.VideoPresets.h360.resolution });
      }
    } catch (e) {
      const name = (e as Error).name;
      setError(name === 'NotAllowedError' ? 'The browser didn’t allow the camera'
        : name === 'NotReadableError' ? 'The camera couldn’t be opened. Is another app using it?'
          : name === 'NotFoundError' ? 'No camera found' : (e as Error).message);
    } finally {
      setCameraBusy(false);
      refresh();
    }
  }, [cameraBusy, refresh]);

  const watch = useCallback((ch: Channel, id: string) => {
    const k = key(ch, id);
    wanted.current.set(k, (wanted.current.get(k) ?? 0) + 1);
    reconcile();
    return () => {
      const n = (wanted.current.get(k) ?? 1) - 1;
      if (n > 0) wanted.current.set(k, n); else wanted.current.delete(k);
      reconcile();
    };
  }, [reconcile]);

  const startAudio = useCallback(async () => { await room.current?.startAudio(); setNeedsClick(false); }, []);

  const setMode = useCallback((m: VoiceMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered */ }
    // Switching to push to talk starts muted.
    const r = room.current;
    if (m === 'ptt' && r?.localParticipant.isMicrophoneEnabled) void r.localParticipant.setMicrophoneEnabled(false).then(refresh);
  }, [refresh]);

  const pushToTalk = useCallback((down: boolean) => {
    const r = room.current;
    if (!r || !r.localParticipant.permissions?.canPublish) return;
    setTalking(down);
    void (async () => {
      const devices = down ? await listDevices().catch(() => null) : null;
      await r.localParticipant.setMicrophoneEnabled(down, down ? constraints('audio', readDevicePrefs(), devices?.audioinput) as object : undefined);
      refresh();
    })();
  }, [refresh]);

  const setVolume = useCallback((id: string, v: number) => {
    volumes.current.set(id, v);
    const p = room.current?.remoteParticipants.get(id);
    p?.setVolume(v);
    refresh();
  }, [refresh]);

  // Push to talk: hold Space, unless you're typing somewhere.
  useEffect(() => {
    if (mode !== 'ptt' || state !== 'on') return;
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat && !typing(e)) { e.preventDefault(); pushToTalk(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space' && !typing(e)) { e.preventDefault(); pushToTalk(false); } };
    const blur = () => pushToTalk(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [mode, state, pushToTalk]);

  useEffect(() => leave, [leave]);

  return {
    state, channel, canTalk, muted, needsClick, people, error, join, leave, toggleMute, startAudio, mode, setMode, talking, pushToTalk, setVolume,
    canVideo, camera, cameraBusy, toggleCamera, feeds, speaking, watch, view, micTrack,
  };
}

/** Which other channel's video you may see while in voice (from your rights). */
export function viewChannel(voiceChannel: Channel | null, media: Record<Channel, { listen: boolean }>): Channel | null {
  if (!voiceChannel) return null;
  const o = other(voiceChannel);
  return media[o].listen ? o : null;
}
