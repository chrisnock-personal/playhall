// Your microphone, speakers and camera for voice and video. The choice is
// kept in this browser (each computer or phone has its own devices), and
// used whenever you join a room's voice or video.

export type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';
/** The device id, and its name: browsers may give a device a new id (Safari
 *  does, and Chrome without a lasting permission), so the name finds it again. */
export type DevicePrefs = Partial<Record<DeviceKind, { id: string; label: string }>>;

const KEY = 'playhall.devices';

export function readDevicePrefs(): DevicePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: DevicePrefs = {};
    for (const k of ['audioinput', 'audiooutput', 'videoinput'] as DeviceKind[]) {
      const v = raw[k] as { id?: unknown; label?: unknown } | undefined;
      if (v && typeof v.id === 'string') out[k] = { id: v.id, label: typeof v.label === 'string' ? v.label : '' };
    }
    return out;
  } catch { return {}; }
}

export function saveDevicePrefs(p: DevicePrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: not remembered */ }
}

/** Can this browser send sound to a chosen speaker? (Not Safari, so far.) */
export const canPickSpeaker = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Voice and video need a secure page and a browser that can do them. */
export const mediaAvailable = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

export async function listDevices(): Promise<Record<DeviceKind, MediaDeviceInfo[]>> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const of = (k: DeviceKind) => all.filter((d) => d.kind === k && d.deviceId);
  return { audioinput: of('audioinput'), audiooutput: of('audiooutput'), videoinput: of('videoinput') };
}

/** The saved device if it's still plugged in, otherwise the system default. */
export function chosen(kind: DeviceKind, devices: MediaDeviceInfo[], prefs = readDevicePrefs()): string | undefined {
  const p = prefs[kind];
  if (!p) return undefined;
  return (devices.find((d) => d.deviceId === p.id) ?? (p.label ? devices.find((d) => d.label === p.label) : undefined))?.deviceId;
}

/** getUserMedia constraints for the saved microphone and camera. */
export function constraints(kind: 'audio' | 'video', prefs = readDevicePrefs(), devices?: MediaDeviceInfo[]): MediaTrackConstraints | boolean {
  const k = kind === 'audio' ? 'audioinput' : 'videoinput';
  const id = devices ? chosen(k, devices, prefs) : prefs[k]?.id;
  const base: MediaTrackConstraints = kind === 'audio' ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { width: { ideal: 1280 }, height: { ideal: 720 } };
  // ideal, not exact: a device that's gone falls back to the default instead of failing.
  return id ? { ...base, deviceId: { ideal: id } } : base;
}
