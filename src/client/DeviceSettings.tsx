import { useCallback, useEffect, useRef, useState } from 'react';
import { canPickSpeaker, chosen, constraints, listDevices, mediaAvailable, readDevicePrefs, saveDevicePrefs, type DeviceKind, type DevicePrefs } from './devices';

type Lists = Record<DeviceKind, MediaDeviceInfo[]>;
const EMPTY: Lists = { audioinput: [], audiooutput: [], videoinput: [] };
const label = (d: MediaDeviceInfo, i: number, what: string) => d.label || `${what} ${i + 1}`;

/** Microphone, speakers and camera: pick each, and check they work. Used on
 *  the Settings page and (phase 2) from inside a room. */
export function DeviceSettings() {
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [prefs, setPrefs] = useState<DevicePrefs>(readDevicePrefs);
  const [allowed, setAllowed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [camOn, setCamOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const micStream = useRef<MediaStream | null>(null);
  const camStream = useRef<MediaStream | null>(null);

  const refresh = useCallback(async () => {
    const l = await listDevices();
    setLists(l);
    // Labels only appear once the browser has been allowed to use the devices.
    setAllowed([...l.audioinput, ...l.videoinput].some((d) => d.label));
  }, []);

  useEffect(() => {
    if (!mediaAvailable()) return;
    void refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  const pick = (kind: DeviceKind, id: string) => {
    const d = lists[kind].find((x) => x.deviceId === id);
    const next: DevicePrefs = { ...prefs, [kind]: d ? { id, label: d.label } : undefined };
    setPrefs(next); saveDevicePrefs(next);
  };

  const allow = async () => {
    setProblem(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
      s.getTracks().forEach((t) => t.stop());
      await refresh();
    } catch (e) {
      setProblem((e as Error).name === 'NotAllowedError'
        ? 'The browser was told not to allow the microphone. Allow it in the site settings (the icon at the left of the address bar), then try again.'
        : 'No microphone was found, or another app is using it.');
    }
  };

  // The microphone level meter, on the chosen microphone.
  useEffect(() => {
    if (!allowed) return;
    let stop = false, raf = 0, ctx: AudioContext | null = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: constraints('audio', prefs, lists.audioinput) });
        if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
        micStream.current = s;
        ctx = new AudioContext();
        // Firefox and Safari can start it paused until the page is clicked or a key pressed.
        if (ctx.state === 'suspended') {
          const c = ctx;
          const wake = () => { void c.resume(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
          addEventListener('pointerdown', wake); addEventListener('keydown', wake);
        }
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setProblem('That microphone couldn’t be opened. Is another app using it?'); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); micStream.current?.getTracks().forEach((t) => t.stop()); micStream.current = null; void ctx?.close(); setLevel(0); };
  }, [allowed, chosen('audioinput', lists.audioinput, prefs)]);

  // The camera preview, only while it's switched on here.
  useEffect(() => {
    if (!camOn) return;
    let stop = false;
    navigator.mediaDevices.getUserMedia({ video: constraints('video', prefs, lists.videoinput) }).then((s) => {
      if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
      camStream.current = s;
      if (video.current) video.current.srcObject = s;
    }).catch(() => { setProblem('That camera couldn’t be opened. Is another app using it?'); setCamOn(false); });
    return () => { stop = true; camStream.current?.getTracks().forEach((t) => t.stop()); camStream.current = null; };
  }, [camOn, chosen('videoinput', lists.videoinput, prefs)]);

  // A short two-note chime through the chosen speakers.
  const testSound = async () => {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    for (const [f, t] of [[660, 0], [880, 0.18]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
      o.connect(g).connect(dest); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
    }
    const el = new Audio();
    el.srcObject = dest.stream;
    const out = chosen('audiooutput', lists.audiooutput, prefs);
    if (out && canPickSpeaker()) await (el as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(out).catch(() => {});
    await el.play().catch(() => {});
    setTimeout(() => { el.pause(); void ctx.close(); }, 900);
  };

  if (!mediaAvailable()) {
    return <p className="hint">Voice and video need the secure (https://) address and a current browser.</p>;
  }

  const select = (kind: DeviceKind, what: string, none: string) => {
    const list = lists[kind];
    return (
      <select id={`dev-${kind}`} value={chosen(kind, list, prefs) ?? ''} onChange={(e) => pick(kind, e.target.value)} disabled={!list.length}>
        <option value="">{list.length ? `System default` : none}</option>
        {list.filter((d) => d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i, what)}</option>)}
      </select>
    );
  };

  return (
    <div className="devices">
      {!allowed && (
        <div className="devices-allow">
          <p>To list your microphones and cameras by name, the browser needs your permission once.</p>
          <button className="btn primary" onClick={allow}>Allow microphone and camera</button>
        </div>
      )}
      {problem && <p className="form-error" role="alert">{problem}</p>}

      <div className="device-row">
        <label htmlFor="dev-audioinput">Microphone</label>
        {select('audioinput', 'Microphone', 'No microphone found')}
        <div className="mic-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <span style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
        <span className="hint">{allowed ? 'Speak: the bar should move.' : ''}</span>
      </div>

      <div className="device-row">
        <label htmlFor="dev-audiooutput">Speakers</label>
        {canPickSpeaker() ? select('audiooutput', 'Speakers', 'Your system’s speakers') : <span className="hint">This browser plays through the system’s speakers: change them in your computer’s sound settings.</span>}
        <button className="btn small" onClick={testSound}>Play a test sound</button>
      </div>

      <div className="device-row">
        <label htmlFor="dev-videoinput">Camera</label>
        {select('videoinput', 'Camera', 'No camera found')}
        <button className="btn small" onClick={() => setCamOn(!camOn)} disabled={!lists.videoinput.length}>{camOn ? 'Stop preview' : 'Preview'}</button>
      </div>
      {camOn && <video ref={video} className="cam-preview" autoPlay muted playsInline aria-label="Your camera" />}
      <p className="hint">Saved in this browser, so each computer or phone keeps its own. Used whenever you join voice or video in a room.</p>
    </div>
  );
}
