// The table sounds in a room (#29): what plays when, and the controls for
// them (a small speaker button in the room's top bar, and a section on the
// Settings page). The sounds themselves are in sound.ts.

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { tableCues, timerCue } from './cues';
import { armSound, getPrefs, play, setDuck, setPrefs, subscribePrefs, unlockSound, type SoundPrefs } from './sound';
import './sound.css';

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}

/** Plays the table's sounds as snapshots arrive: moves, your turn, the
 *  timer running low, the end of the game. `duck` (0-1) turns them down
 *  under voice chat. */
export function useTableSounds(snap: RoomSnapshot, receivedAt: number, duck: number) {
  const prev = useRef<RoomSnapshot | null>(null);
  useEffect(() => { armSound(); }, []);
  useEffect(() => { setDuck(duck); return () => setDuck(1); }, [duck]);

  useEffect(() => {
    const before = prev.current;
    prev.current = snap;
    if (!before || before.room.code !== snap.room.code) return;
    if (!snap.you.seat && !getPrefs().watching) return;
    for (const c of tableCues(before, snap)) play(c.sound, c.at);
  }, [snap]);

  // Your move timer running low.
  const seat = snap.you.seat;
  const mine = !!seat && snap.game.status === 'playing' && snap.game.turnSeats.includes(seat);
  const deadline = mine ? snap.game.moveDeadline : null;
  const offset = snap.serverNow - receivedAt;
  useEffect(() => {
    if (!deadline) return;
    const left = () => deadline - (Date.now() + offset);
    let last = left();
    const t = setInterval(() => {
      const now = left();
      const s = timerCue(last, now);
      last = now;
      if (s) play(s);
    }, 200);
    return () => clearInterval(t);
  }, [deadline, offset]);
}

function SpeakerIcon({ off, size = 18 }: { off: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4z" />
      {off ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  );
}

/** The room's speaker button: click to mute or unmute, and a small panel
 *  with the volume. For watchers it turns "sounds while watching" on/off. */
export function SoundButton({ watching }: { watching: boolean }) {
  const p = useSoundPrefs();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const on = !p.muted && p.volume > 0 && (!watching || p.watching);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const toggle = () => {
    unlockSound();
    if (on) setPrefs(watching ? { watching: false } : { muted: true });
    else {
      setPrefs({ muted: false, ...(watching ? { watching: true } : {}), ...(p.volume <= 0 ? { volume: 0.6 } : {}) });
      play('chip');
    }
  };
  return (
    <div className="sound-ctl" ref={box}>
      <button className={`icon-btn small${on ? '' : ' off'}`} onClick={toggle} aria-pressed={on}
        aria-label={on ? 'Turn table sounds off' : 'Turn table sounds on'}
        title={on ? 'Table sounds on: click to turn off' : watching && !p.watching ? 'Table sounds are off while you watch: click to turn on' : 'Table sounds off: click to turn on'}>
        <SpeakerIcon off={!on} />
      </button>
      <button className="icon-btn small sound-more" aria-label="Sound volume" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="sound-pop" id={id} role="dialog" aria-label="Table sounds">
          <VolumeSlider />
          <label className="sound-check"><input type="checkbox" checked={p.watching} onChange={(e) => setPrefs({ watching: e.target.checked })} /> Sounds while watching</label>
        </div>
      )}
    </div>
  );
}

function VolumeSlider() {
  const p = useSoundPrefs();
  const id = useId();
  return (
    <div className="sound-volume">
      <label htmlFor={id}>Volume</label>
      <input id={id} type="range" min={0} max={100} step={5} value={Math.round(p.volume * 100)}
        onChange={(e) => { unlockSound(); setPrefs({ volume: Number(e.target.value) / 100, ...(Number(e.target.value) > 0 ? { muted: false } : {}) }); }}
        onPointerUp={() => play('chip')} onKeyUp={() => play('chip')} />
      <span className="sound-pct">{Math.round(p.volume * 100)}%</span>
    </div>
  );
}

/** The Settings page's section: on/off, volume, while watching, a test. */
export function SoundSettings() {
  const p = useSoundPrefs();
  return (
    <div className="sound-settings">
      <label className="sound-check"><input type="checkbox" checked={!p.muted} onChange={(e) => { unlockSound(); setPrefs({ muted: !e.target.checked }); }} /> Play table sounds (dice, cards, moves, your turn)</label>
      <VolumeSlider />
      <label className="sound-check"><input type="checkbox" checked={p.watching} onChange={(e) => setPrefs({ watching: e.target.checked })} /> Also while watching a game</label>
      <div className="row">
        <button className="btn small" onClick={() => { unlockSound(); play('dice'); play('turn', 500); }}>Test the sounds</button>
      </div>
      <p className="muted">Kept quieter than voice chat, and turned down further while someone is talking. Saved in this browser.</p>
    </div>
  );
}
