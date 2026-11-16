// The table camera: a phone (or any device) on a stand over a real board,
// sending its camera to a camera table room. It's opened from the host's
// link (#/camera/CODE?k=KEY), needs no account and takes no seat: the key
// buys a camera-only LiveKit token (POST /api/camera/token), so the device
// can't hear, see, chat or play, only show the board.
//
// Phones: the rear camera by default (facingMode environment), 1280x720 with
// simulcast layers for small screens, never mirrored. iOS Safari needs a tap
// to start the camera, playsInline and a muted preview; the screen is kept
// awake (Wake Lock) where the browser allows it, and the camera is restarted
// if the system stopped it while the page was in the background.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalVideoTrack, Room } from 'livekit-client';
import './camera.css';

type Facing = 'environment' | 'user';
type Phase = 'checking' | 'ready' | 'starting' | 'live' | 'stopped' | 'error';

async function fetchToken(key: string): Promise<{ token: string; room: { code: string; name: string; game: string } }> {
  const res = await fetch('/api/camera/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'The table camera link didn’t work');
  return data;
}

function cameraError(e: unknown): string {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError') return 'The browser didn’t allow the camera. Allow it in the browser’s settings for this site, then try again.';
  if (name === 'NotReadableError') return 'The camera couldn’t be opened. Is another app using it?';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found on this device.';
  if (!window.isSecureContext) return 'The camera needs a secure (https://) page.';
  return (e as Error)?.message ?? 'Something went wrong';
}

export function CameraPage({ code, keyParam }: { code: string; keyParam: string }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [room, setRoom] = useState<{ name: string; game: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [awake, setAwake] = useState(false);
  const lkRoom = useRef<Room | null>(null);
  const track = useRef<LocalVideoTrack | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const wake = useRef<{ release(): Promise<void> } | null>(null);

  // Check the link at once, so a stale one says so before anyone sets up.
  useEffect(() => {
    fetchToken(keyParam).then((r) => { setRoom(r.room); setPhase('ready'); }).catch((e) => { setError((e as Error).message); setPhase('error'); });
  }, [keyParam]);

  const keepAwake = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      wake.current = await nav.wakeLock.request('screen');
      setAwake(true);
    } catch { setAwake(false); }
  }, []);

  const stop = useCallback((why: Phase = 'stopped') => {
    const r = lkRoom.current;
    lkRoom.current = null;
    void r?.disconnect();
    track.current?.stop();
    track.current = null;
    void wake.current?.release().catch(() => {});
    wake.current = null;
    setAwake(false);
    setPhase(why);
  }, []);

  // Started by a tap (iOS Safari wants the camera opened from a user gesture),
  // so the camera is opened first, before any network round trip.
  const start = async () => {
    setError(null);
    setPhase('starting');
    try {
      const lk = await import('livekit-client');
      const cam = await lk.createLocalVideoTrack({ facingMode: facing, resolution: lk.VideoPresets.h720.resolution });
      track.current = cam;
      if (video.current) cam.attach(video.current);
      const { token, room: info } = await fetchToken(keyParam);
      setRoom(info);
      const r = new lk.Room({ adaptiveStream: false, dynacast: true });
      lkRoom.current = r;
      r.on(lk.RoomEvent.Disconnected, () => {
        if (lkRoom.current !== r) return;
        stop('error');
        setError('The table camera was disconnected: the host may have stopped it or made a new link. Try again, or ask the host for a new link.');
      });
      await r.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`, token, { autoSubscribe: false });
      await r.localParticipant.publishTrack(cam, {
        source: lk.Track.Source.Camera,
        simulcast: true,
        videoEncoding: lk.VideoPresets.h720.encoding,
        videoSimulcastLayers: [lk.VideoPresets.h180, lk.VideoPresets.h360],
      });
      setPhase('live');
      void keepAwake();
    } catch (e) {
      stop('error');
      setError(cameraError(e));
    }
  };

  const flip = async () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    try { await track.current?.restartTrack({ facingMode: next }); } catch (e) { setError(cameraError(e)); }
  };

  // Back from the background: phones stop the camera and drop the wake lock.
  useEffect(() => {
    const on = () => {
      if (document.visibilityState !== 'visible' || !track.current) return;
      if (track.current.mediaStreamTrack?.readyState === 'ended') void track.current.restartTrack({ facingMode: facing }).catch(() => {});
      void keepAwake();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [facing, keepAwake]);

  useEffect(() => () => stop(), [stop]);

  const live = phase === 'live';
  return (
    <div className={`cam-page${live ? ' live' : ''}`}>
      {/* muted + playsInline + autoPlay: shown at once on iPhone Safari, not full screen. Never mirrored. */}
      <video ref={video} className="cam-preview" muted playsInline autoPlay aria-label="What the table camera sends" />
      <div className="cam-panel">
        <h1>Table camera</h1>
        {room && <p className="cam-room">{room.name} · {room.game}</p>}
        {phase === 'checking' && <p>Checking the link…</p>}
        {phase === 'ready' && <p>Put this device on a stand over the board, then start. It sends only its camera: no sound, and it can’t see or hear the room.</p>}
        {phase === 'starting' && <p>Starting the camera…</p>}
        {live && <p className="cam-on"><span className="cam-dot" aria-hidden="true" />On the table: everyone in the room sees this.{awake ? '' : ' Keep the screen on (this browser can’t keep it awake by itself).'}</p>}
        {phase === 'stopped' && <p>The table camera is off.</p>}
        {error && <p className="cam-error" role="alert">{error}</p>}
        <div className="cam-buttons">
          {(phase === 'ready' || phase === 'stopped' || (phase === 'error' && room)) && (
            <button className="btn primary" onClick={() => void start()}>Start the table camera</button>
          )}
          {live && <button className="btn" onClick={() => void flip()}>Switch camera</button>}
          {live && <button className="btn danger" onClick={() => stop()}>Stop</button>}
          <a className="btn" href={`#/r/${code}`}>Open the room instead</a>
        </div>
      </div>
    </div>
  );
}
