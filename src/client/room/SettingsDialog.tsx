import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, RoomSettings, RoomSnapshot } from '../../shared/protocol';
import type { GameClient } from '../games/types';
import { api } from '../api';
import { Icon } from '../ui';

type BoolKey = 'listed' | 'guestsCanPlay' | 'hideGalleryFromPlayers' | 'watchersWriteTable' | 'ranked';

const SWITCHES: { key: BoolKey; label: string; help: string }[] = [
  { key: 'hideGalleryFromPlayers', label: 'Hide the gallery from players during play', help: 'Players can’t read what watchers say until the game ends.' },
  { key: 'watchersWriteTable', label: 'Watchers can write at the table during play', help: 'Off: watchers read the table chat but only write in the gallery.' },
  { key: 'guestsCanPlay', label: 'Guests can play', help: 'Off: guests can watch but not take a seat.' },
  { key: 'listed', label: 'Show the room in the lobby', help: 'Off: only people with the invite link can find it.' },
  { key: 'ranked', label: 'Games count for the leaderboard', help: 'Off: a casual room. Can change between games. Guests’ games never count.' },
];

export function SettingsDialog({ snap, send, game, token, onClose }: {
  snap: RoomSnapshot; send(m: ClientMessage): void; game?: GameClient; token: string; onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = snap.room.settings;
  const playing = snap.game.status === 'playing';
  const update = (settings: Partial<RoomSettings>) => send({ t: 'settings', settings });

  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const onCancel = () => onClose();
    d.addEventListener('close', onCancel);
    return () => d.removeEventListener('close', onCancel);
  }, [onClose]);

  const closeRoom = async () => {
    try {
      await api(`/rooms/${snap.room.code}`, { method: 'DELETE', token });
      location.hash = '#/';
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const seg = <K extends 'seatPolicy' | 'afterGame'>(key: K, options: [RoomSettings[K], string][]) => (
    <div className="segmented" role="group">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={s[key] === v ? 'on' : ''} aria-pressed={s[key] === v} onClick={() => update({ [key]: v } as Partial<RoomSettings>)}>{label}</button>
      ))}
    </div>
  );

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="rules-title">
      <div className="dialog-head">
        <h2 id="rules-title">Room rules</h2>
        <button className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}><Icon name="close" /></button>
      </div>
      <div className="dialog-body">
        <section>
          <h3>Seats</h3>
          <div className="field"><span>Who can take a free seat</span>
            {seg('seatPolicy', [['open', 'Anyone'], ['host', 'Only people I seat']])}
          </div>
          <div className="field"><span>After each game</span>
            {seg('afterGame', [['same', 'Same players'], ['winnerStays', 'Winner stays'], ['rotate', 'Both rotate out']])}
            <span className="hint">Seats go to people asking for one, oldest first. If nobody is asking, the players stay.</span>
          </div>
          {game && <game.ConfigPicker value={s.gameConfig} onChange={(v) => update({ gameConfig: v })} disabled={playing} />}
          {playing && <p className="hint">The time control can change between games.</p>}
        </section>
        <section>
          <h3>Who reads and writes what</h3>
          {SWITCHES.map((sw) => (
            <label key={sw.key} className="switch-row">
              <span><strong>{sw.label}</strong><span className="hint">{sw.help}</span></span>
              <input type="checkbox" role="switch" className="switch" checked={s[sw.key]} disabled={sw.key === 'ranked' && playing} onChange={(e) => update({ [sw.key]: e.target.checked })} />
            </label>
          ))}
        </section>
        <section>
          <h3>Close the room</h3>
          <p className="hint">Everyone is sent back to the lobby and the room disappears. Finished games stay in the history.</p>
          {confirmClose
            ? <div className="row"><button className="btn danger" onClick={closeRoom}>Yes, close it</button><button className="btn" onClick={() => setConfirmClose(false)}>Keep it open</button></div>
            : <button className="btn danger" onClick={() => setConfirmClose(true)}>Close the room</button>}
          {error && <p className="form-error">{error}</p>}
        </section>
      </div>
    </dialog>
  );
}
