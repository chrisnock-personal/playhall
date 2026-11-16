import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, readRoomPass, saveRoomPass, type Session } from '../api';
import type { Channel, RoomSnapshot } from '../../shared/protocol';
import { useRoom } from '../useRoom';
import { GAME_CLIENTS } from '../games';
import type { StageProps } from '../games/types';
import { useLayout, NEXT, PRESETS, type PresetId } from './layout';
import { SeatsPanel } from './SeatsPanel';
import { GalleryStrip } from './GalleryStrip';
import { VoiceDock } from './VoiceDock';
import { useVoice, viewChannel } from './useVoice';
import { useTranscriber } from './useTranscriber';
import { TranscriptNotice } from './TranscriptNotice';
import { SidePanel, type SideTab } from './SidePanel';
import { SettingsDialog } from './SettingsDialog';
import { ResultCard } from './ResultCard';
import { Icon } from '../ui';
import { SoundButton, useTableSounds } from '../kit/SoundControls';

export function RoomPage({ code, session, onSignOut }: { code: string; session: Session; onSignOut(): void }) {
  const [pass, setPass] = useState<string | null>(() => readRoomPass(code));
  const conn = useRoom(code, session.token, pass);
  const voice = useVoice(code, session.token);
  const { snap } = conn;

  if (conn.state === 'locked') {
    return <PasswordGate code={code} session={session} hadPass={!!pass} onPass={(p) => { saveRoomPass(code, p); setPass(p); }} />;
  }

  if (conn.state === 'gone') {
    return (
      <div className="center-page">
        <div className="card narrow">
          <h1>Can’t open this room</h1>
          <p className="muted">{conn.goneReason}</p>
          {conn.goneReason?.includes('Sign in') ? <button className="btn primary" onClick={onSignOut}>Sign in</button> : <a className="btn primary" href="#/">Back to rooms</a>}
        </div>
      </div>
    );
  }
  if (!snap) return <div className="center-page"><p className="muted">Opening room {code}…</p></div>;
  return <Room snap={snap} conn={conn} session={session} voice={voice} />;
}

function Room({ snap, conn, session, voice }: { snap: RoomSnapshot; conn: ReturnType<typeof useRoom>; session: Session; voice: ReturnType<typeof useVoice> }) {
  const game = GAME_CLIENTS[snap.room.gameId];
  const { layout, set, preset } = useLayout(snap.room.gameId);
  const [tab, setTab] = useState<SideTab>(snap.you.seat ? 'table' : 'gallery');
  const [seen, setSeen] = useState<Record<Channel, number>>({ table: 0, gallery: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const stageProps: StageProps = { snap, receivedAt: conn.receivedAt, send: conn.send };
  const tx = useTranscriber(snap.room.code, session.token, snap, voice);
  // Table sounds (#29): quieter under voice chat, quieter still while someone talks.
  const talking = voice.state === 'on' && !!voice.channel && voice.speaking[voice.channel].length > 0;
  useTableSounds(snap, conn.receivedAt, voice.state !== 'on' ? 1 : talking ? 0.35 : 0.6);

  // While you're in one channel's voice, also show the other channel's video
  // when you may see it (players' cameras for watchers in the gallery, and
  // watchers' cameras for players, when the gallery isn't hidden from them).
  const viewing = voice.state === 'on' ? viewChannel(voice.channel, snap.you.media) : null;
  const { view } = voice;
  useEffect(() => { view(viewing); }, [view, viewing]);

  // Errors from the server show for a few seconds.
  useEffect(() => {
    if (!conn.error) return;
    setToast(conn.error.message);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [conn.error]);

  // A tab that can't be read any more (gallery once you sit down) falls back.
  useEffect(() => {
    if (tab === 'gallery' && !snap.you.canRead.includes('gallery')) setTab('table');
  }, [tab, snap.you.canRead]);

  // Lines in the open tab count as read.
  const maxId = (ch: Channel) => snap.chat.reduce((m, l) => (l.channel === ch ? Math.max(m, l.id) : m), 0);
  useEffect(() => {
    if (layout.side === 'full' && (tab === 'table' || tab === 'gallery')) {
      const m = maxId(tab);
      if (m > seen[tab]) setSeen((s) => ({ ...s, [tab]: m }));
    }
  });
  const unread = useMemo(() => {
    const u: Record<Channel, number> = { table: 0, gallery: 0 };
    for (const l of snap.chat) if (l.kind === 'typed' && l.userId !== snap.you.userId && l.id > seen[l.channel]) u[l.channel]++;
    return u;
  }, [snap.chat, seen, snap.you.userId]);

  const invite = async () => {
    const url = `${location.origin}/#/r/${snap.room.code}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setToast(`Invite link: ${url}`); }
  };

  const me = snap.members.find((m) => m.userId === snap.you.userId);
  const role = snap.you.seat
    ? `${snap.seats.find((s) => s.id === snap.you.seat)?.label}${snap.you.host ? ' + host' : ''}`
    : snap.you.host ? 'Host, watching' : 'Watching';
  const status = { idle: 'Waiting', playing: 'In play', over: 'Between games' }[snap.game.status];

  return (
    <div className={`room top-${layout.top}`}>
      {layout.top === 'full' ? (
        <header className="room-top">
          <a className="icon-btn" href="#/" aria-label="Back to rooms"><Icon name="back" /></a>
          <div className="room-title">
            <h1>{snap.room.name}</h1>
            <p>{snap.room.gameName} · {snap.room.configLabel} · code {snap.room.code}</p>
          </div>
          <span className={`pill ${snap.game.status}`}>{status}</span>
          <span className={`pill ${snap.you.seat ? 'role-player' : 'role-watch'}`}>You: {role}</span>
          {snap.you.delay > 0 && <span className="pill delayed" title="The host has set a delay for watchers">{snap.you.delay < 60 ? `${snap.you.delay} s` : `${snap.you.delay / 60} min`} behind live</span>}
          {conn.state !== 'open' && <span className="pill warn">Reconnecting…</span>}
          <div className="room-top-right">
            <VoiceDock voice={voice} snap={snap} />
            <SoundButton watching={!snap.you.seat} />
            <TranscriptNotice snap={snap} voice={voice} tx={tx} />
            <div className="segmented small" role="group" aria-label="Layout">
              {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                <button key={id} className={layout.preset === id ? 'on' : ''} onClick={() => preset(id)}>{PRESETS[id].label}</button>
              ))}
            </div>
            <button className="btn small" onClick={invite}><Icon name="link" size={16} />{copied ? 'Link copied' : 'Invite'}</button>
            {snap.you.host && <button className="btn small" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={16} />Room rules</button>}
            <button className="icon-btn" aria-label="Shrink the top bar" onClick={() => set('top', NEXT.top[layout.top])}><Icon name="up" /></button>
          </div>
        </header>
      ) : (
        <div className="room-top-compact">
          <strong>{snap.room.name}</strong>
          <span className="muted">{snap.room.gameName} · {status} · {role}{snap.you.delay > 0 ? ` · ${snap.you.delay} s behind` : ''}</span>
          {conn.state !== 'open' && <span className="pill warn">Reconnecting…</span>}
          <VoiceDock voice={voice} snap={snap} compact />
          <SoundButton watching={!snap.you.seat} />
          <TranscriptNotice snap={snap} voice={voice} tx={tx} compact />
          <button className="icon-btn small" aria-label="Show the top bar" onClick={() => set('top', NEXT.top[layout.top])}><Icon name="down" size={16} /></button>
        </div>
      )}

      <div className="room-body">
        <SeatsPanel state={layout.seats} onCycle={() => set('seats', NEXT.seats[layout.seats])} stage={stageProps} game={game}
          voice={voice} video={layout.video} onVideo={(v) => set('video', v)} />
        <div className="stage-col">
          <div className="stage">
            {game ? <game.Stage {...stageProps} /> : <p className="empty">This game isn’t available in this version.</p>}
            <ResultCard snap={snap} send={conn.send} />
          </div>
          <GalleryStrip
            state={layout.gallery}
            onSet={(v) => set('gallery', v)}
            snap={snap}
            send={conn.send}
            handUp={!!me?.hand}
            voice={voice}
            video={layout.video}
          />
        </div>
        <SidePanel
          state={layout.side}
          onSet={(v) => set('side', v)}
          tab={tab}
          onTab={(t) => { setTab(t); if (layout.side !== 'full') set('side', 'full'); }}
          unread={unread}
          stage={stageProps}
          game={game}
        />
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
      {settingsOpen && <SettingsDialog snap={snap} send={conn.send} game={game} token={session.token} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function PasswordGate({ code, session, hadPass, onPass }: { code: string; session: Session; hadPass: boolean; onPass(pass: string): void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(hadPass ? 'The room password has changed since you were last here.' : null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ pass: string | null }>(`/rooms/${code}/pass`, { token: session.token, body: { password } });
      if (r.pass) onPass(r.pass);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="center-page">
      <form className="card narrow" onSubmit={submit}>
        <h1>This room is private</h1>
        <p className="muted">Room {code} needs a password. Ask the host for it.</p>
        <label className="field"><span>Room password</span>
          <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy || !password}>Go in</button>
          <a className="btn" href="#/">Back to rooms</a>
        </div>
      </form>
    </div>
  );
}
