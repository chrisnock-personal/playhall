import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Channel, ClientMessage, MemberView, RoomSnapshot } from '../../shared/protocol';
import type { GameClient, StageProps } from '../games/types';
import type { SidePanelState } from './layout';
import { Avatar, Icon } from '../ui';

export type SideTab = Channel | 'people' | 'game';

export function SidePanel({ state, onSet, tab, onTab, unread, stage, game }: {
  state: SidePanelState; onSet(v: SidePanelState): void; tab: SideTab; onTab(t: SideTab): void;
  unread: Record<Channel, number>; stage: StageProps; game?: GameClient;
}) {
  const { snap } = stage;
  const hands = snap.queue.length;
  const tabs: { id: SideTab; label: string; icon: string; badge: number }[] = [
    { id: 'table', label: 'Table', icon: 'chat', badge: unread.table },
    ...(snap.you.canRead.includes('gallery') ? [{ id: 'gallery' as SideTab, label: 'Gallery', icon: 'chat', badge: unread.gallery }] : []),
    { id: 'people', label: 'People', icon: 'people', badge: snap.you.host ? hands : 0 },
    ...(game?.tab ? [{ id: 'game' as SideTab, label: game.tab.label, icon: 'game', badge: 0 }] : []),
  ];
  const totalUnread = unread.table + unread.gallery;

  if (state === 'hidden') {
    return <button className="edge-tab vertical" onClick={() => onSet('full')}>Chat{totalUnread ? ` · ${totalUnread} new` : ''}</button>;
  }

  if (state === 'rail') {
    return (
      <aside className="side-panel rail" aria-label="Chat and people">
        <button className="icon-btn" aria-label="Hide the side panel" onClick={() => onSet('hidden')}><Icon name="right" size={16} /></button>
        {tabs.map((t) => (
          <button key={t.id} className="rail-btn" aria-label={`${t.label}${t.badge ? `, ${t.badge} new` : ''}`} title={t.label} onClick={() => onTab(t.id)}>
            <Icon name={t.icon} size={20} />
            <span className="rail-label">{t.label}</span>
            {t.badge > 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </aside>
    );
  }

  const Tab = game?.tab?.Component;
  return (
    <aside className="side-panel" aria-label="Chat and people">
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)}>
            {t.label}{t.badge > 0 && <span className="badge inline">{t.badge}</span>}
          </button>
        ))}
        <button className="icon-btn" aria-label="Shrink the side panel" onClick={() => onSet('rail')}><Icon name="right" size={16} /></button>
      </div>
      {(tab === 'table' || tab === 'gallery') && <Chat channel={tab} snap={snap} send={stage.send} />}
      {tab === 'people' && <People snap={snap} send={stage.send} />}
      {tab === 'game' && Tab && <div className="tab-body"><Tab {...stage} /></div>}
    </aside>
  );
}

function chatHint(channel: Channel, snap: RoomSnapshot): string {
  const playing = snap.game.status === 'playing';
  if (channel === 'gallery') return 'Everyone watching. ' + (snap.room.settings.hideGalleryFromPlayers ? 'Players can’t read this while a game is on.' : 'Players can read this too.');
  if (snap.you.seat) return 'Everyone can read the table.' + (snap.room.settings.hideGalleryFromPlayers && playing ? ' The gallery is hidden from you until the game ends.' : '');
  return snap.you.canWrite.includes('table') ? 'The players’ conversation. Everyone can read it.' : 'The players’ conversation. Watchers can read it but not write here during play.';
}

function Chat({ channel, snap, send }: { channel: Channel; snap: RoomSnapshot; send(m: ClientMessage): void }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const lines = snap.chat.filter((l) => l.channel === channel);
  const canWrite = snap.you.canWrite.includes(channel);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length, channel]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send({ t: 'chat', channel, text: t });
    setText('');
  };

  return (
    <>
      <p className="chat-hint">{chatHint(channel, snap)}</p>
      <ol className="chat" ref={listRef} aria-live="polite">
        {lines.length === 0 && <li className="empty">Nothing said yet.</li>}
        {lines.map((l) => l.kind === 'system'
          ? <li key={l.id} className="sys">{l.text}</li>
          : (
            <li key={l.id} className="msg">
              <Avatar name={l.name} id={l.userId ?? l.name} size={28} />
              <div>
                <div className="msg-head"><strong>{l.name}</strong> · typed · {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="msg-text">{l.text}</div>
              </div>
            </li>
          ))}
      </ol>
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={`msg-${channel}`}>Message</label>
        <input id={`msg-${channel}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} disabled={!canWrite}
          placeholder={canWrite ? (channel === 'gallery' ? 'Message the gallery' : 'Message the table') : 'You can’t write here right now'} />
        <button className="btn primary icon-only" aria-label="Send" disabled={!canWrite || !text.trim()}><Icon name="send" /></button>
      </form>
    </>
  );
}

function People({ snap, send }: { snap: RoomSnapshot; send(m: ClientMessage): void }) {
  const seated = snap.members.filter((m) => m.seat);
  const queue = snap.queue.map((id) => snap.members.find((m) => m.userId === id)).filter(Boolean) as MemberView[];
  const others = snap.members.filter((m) => !m.seat && !m.hand && (m.online || m.host));
  const seatLabel = (id: string | null) => snap.seats.find((s) => s.id === id)?.label ?? '';
  const playing = snap.game.status === 'playing';

  const row = (m: MemberView) => (
    <li key={m.userId} className="person">
      <Avatar name={m.name} id={m.userId} size={32} dim={!m.online} />
      <div className="who">
        <strong>{m.name}{m.userId === snap.you.userId ? ' (you)' : ''}</strong>
        <span>
          {[m.host && 'Host', m.seat && seatLabel(m.seat), m.guest && 'guest', !m.online && 'away', m.hand && 'asking for a seat'].filter(Boolean).join(' · ') || 'Watching'}
        </span>
      </div>
      {snap.you.host && m.userId !== snap.you.userId && <HostActions m={m} snap={snap} send={send} playing={playing} />}
      {snap.you.host && m.userId === snap.you.userId && !m.seat && !playing && (
        <SeatPicker snap={snap} onPick={(seat) => send({ t: 'seat', userId: m.userId, seat })} label="Sit as" />
      )}
    </li>
  );

  return (
    <div className="tab-body people">
      <h3 className="label">Players</h3>
      <ul>{seated.length ? seated.map(row) : <li className="empty">Nobody seated yet.</li>}</ul>
      {queue.length > 0 && <><h3 className="label">Asking for a seat</h3><ul>{queue.map(row)}</ul></>}
      <h3 className="label">Watching</h3>
      <ul>{others.length ? others.map(row) : <li className="empty">Nobody else here.</li>}</ul>
      {!snap.you.host && (
        <p className="hint">
          {snap.room.settings.seatPolicy === 'host' ? 'The host seats players in this room: ask for a seat from the watchers’ strip.' : 'Free seats are open: sit in one from the players panel or the board.'}
        </p>
      )}
    </div>
  );
}

function SeatPicker({ snap, onPick, label }: { snap: RoomSnapshot; onPick(seat: string): void; label: string }) {
  return (
    <select className="mini-select" aria-label={label} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{label}…</option>
      {snap.seats.map((s) => <option key={s.id} value={s.id}>{s.label}{s.name ? ` (now ${s.name})` : ''}</option>)}
    </select>
  );
}

function HostActions({ m, snap, send, playing }: { m: MemberView; snap: RoomSnapshot; send(msg: ClientMessage): void; playing: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const canPlay = !m.guest || snap.room.settings.guestsCanPlay;
  return (
    <div className="host-actions">
      {!m.seat && m.online && canPlay && !playing && (
        <SeatPicker snap={snap} onPick={(seat) => send({ t: 'seat', userId: m.userId, seat })} label="Seat as" />
      )}
      {m.seat && (playing && !confirm
        ? <button className="btn tiny" onClick={() => setConfirm(true)}>To watching</button>
        : <button className={`btn tiny${playing ? ' danger' : ''}`} onClick={() => { send({ t: 'unseat', userId: m.userId }); setConfirm(false); }}>
          {playing ? 'Stop game and move' : 'To watching'}
        </button>)}
      {!m.guest && m.online && <button className="btn tiny" onClick={() => send({ t: 'makeHost', userId: m.userId })}>Make host</button>}
    </div>
  );
}
