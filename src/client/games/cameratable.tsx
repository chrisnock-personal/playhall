// The camera table's stage: the board camera filling the stage, a turn bar,
// the dice roller, the score pad and the result (entered by the host,
// confirmed by every player). See src/shared/games/cameratable.ts.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { encode } from 'uqr';
import { DICE, MAX_DICE, MAX_SEATS, MIN_SEATS, NAME_MAX, type CameraTableConfig, type CameraTableView, type Proposal, type Roll } from '../../shared/games/cameratable';
import type { RoomSnapshot } from '../../shared/protocol';
import type { GameClient, StageProps } from './types';
import { COLOURS, Die, Disc, GameActions, MoveTimer } from '../kit/kit';
import { VideoTile } from '../room/VideoTile';
import { isTableCamera } from '../room/useVoice';
import { api } from '../api';
import { Icon } from '../ui';
import './cameratable.css';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const nameOf = (snap: RoomSnapshot, seat: string | null) => snap.seats.find((s) => s.id === seat)?.name ?? COLOURS[seat ?? '']?.label ?? 'Someone';

/** Send an action: the host's go through hostAct (the host's powers, and
 *  their own seat if they have one); everyone else's are a player's. */
function useAct(props: StageProps) {
  const { snap, send } = props;
  return (action: unknown) => send(snap.you.host ? { t: 'hostAct', action } : { t: 'act', action });
}

function CameraTableStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as CameraTableView | null;
  const playing = snap.game.status === 'playing' && !!v;
  return (
    <div className="ct">
      <div className="ct-main">
        {playing && v && <TurnBar {...props} v={v} />}
        <TableCamera {...props} />
      </div>
      <div className="ct-side">
        {playing && v ? (
          <>
            <Result {...props} v={v} />
            <DiceRoller {...props} v={v} />
            <ScorePad {...props} v={v} />
          </>
        ) : (
          <div className="ct-card">
            <h3>{snap.game.status === 'over' ? 'Between games' : 'Getting ready'}</h3>
            <p className="hint">
              {snap.you.host
                ? 'Seat the players, put a phone on a stand over the board (Table camera, above), then start. You move the pieces; Playhall keeps turns, dice and scores.'
                : 'The host sets up the table camera and starts the game. Take a free seat to play.'}
            </p>
          </div>
        )}
        <GameActions snap={snap} send={send} resign={false} />
        {playing && v && <MoveTimerNote snap={snap} v={v} receivedAt={receivedAt} />}
      </div>
    </div>
  );
}

/** Players who've dropped out: a reminder the game waits for them. */
function MoveTimerNote({ snap, v }: { snap: RoomSnapshot; v: CameraTableView; receivedAt: number }) {
  const away = v.order.filter((seat) => {
    const id = snap.seats.find((s) => s.id === seat)?.userId;
    return id && snap.members.find((m) => m.userId === id)?.online === false;
  });
  if (!away.length) return null;
  return <p className="hint">Away: {away.map((s) => nameOf(snap, s)).join(', ')}. The game waits for them.</p>;
}

// ---- the board camera ------------------------------------------------

function TableCamera({ snap, voice, token }: StageProps) {
  const feed = voice?.feeds.find((f) => f.channel === 'table' && isTableCamera(f.id));
  const [open, setOpen] = useState(false);
  const on = !!snap.room.tableCamera?.on;
  const canSee = snap.you.media.table.listen;
  const empty = !canSee
    ? (snap.you.delay ? 'You’re watching on a delay, so the table camera is hidden until the game ends.' : 'You can’t see the table right now.')
    : on ? 'Waiting for the table camera to connect…'
      : snap.you.host ? 'No table camera yet. Open Table camera to film the board with a phone.' : 'The host hasn’t set up the table camera yet.';
  return (
    <div className={`ct-camera${feed ? ' live' : ''}`}>
      {feed && voice
        ? <VideoTile voice={voice} channel="table" id={feed.id} name="Table camera" fallback={<div className="ct-camera-empty"><p>Connecting to the table camera…</p></div>} className="ct-camera-tile" />
        : <div className="ct-camera-empty"><Icon name="camera" size={40} /><p>{empty}</p></div>}
      {snap.you.host && token && (
        <button className="btn small ct-camera-btn" onClick={() => setOpen(true)}><Icon name="camera" size={16} />Table camera</button>
      )}
      {open && token && <CameraLink code={snap.room.code} token={token} on={on} live={!!feed} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The host's link (and QR code) for the phone that films the board. */
function CameraLink({ code, token, on, live, onClose }: { code: string; token: string; on: boolean; live: boolean; onClose(): void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = (fresh: boolean) => {
    setError(null);
    api<{ path: string }>(`/rooms/${code}/table-camera`, { token, body: { fresh } })
      .then((r) => setUrl(`${location.origin}/${r.path}`))
      .catch((e) => setError((e as Error).message));
  };
  useEffect(() => { make(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => {
    api(`/rooms/${code}/table-camera`, { token, method: 'DELETE' }).then(() => { setUrl(null); onClose(); }).catch((e) => setError((e as Error).message));
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is on screen to copy by hand */ }
  };
  return (
    <div className="ct-link" role="dialog" aria-label="Table camera">
      <div className="row-between">
        <h3>Table camera</h3>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <p className="hint">Scan this with a phone (or open the link on it) and put the phone on a stand over the board. It needs no account and takes no seat; it only sends its camera. {live ? 'A table camera is on now.' : on ? 'Nothing is connected with this link yet.' : ''}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {url && <Qr text={url} />}
      {url && <input className="ct-link-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Table camera link" />}
      <div className="row wrap">
        <button className="btn small primary" disabled={!url} onClick={copy}><Icon name="link" size={16} />{copied ? 'Link copied' : 'Copy link'}</button>
        <a className={`btn small${url ? '' : ' disabled'}`} href={url ?? undefined}>Use this device as the table camera</a>
      </div>
      <div className="row wrap">
        <button className="btn small" onClick={() => make(true)} title="The device using the old link is cut off">New link</button>
        {on && <button className="btn small danger" onClick={stop}>Stop the table camera</button>}
      </div>
      <p className="hint">Anyone with the link can show a picture on the stage until you stop it or make a new link (12 hours at most), so only give it to the device on the table.</p>
    </div>
  );
}

/** A QR code, black on white whatever the theme (so phones can read it). */
function Qr({ text }: { text: string }) {
  const qr = useMemo(() => encode(text, { ecc: 'M', border: 2 }), [text]);
  const n = qr.data.length;
  let d = '';
  qr.data.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return (
    <svg className="ct-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label="QR code of the table camera link" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

// ---- turns -------------------------------------------------------------

function TurnBar(props: StageProps & { v: CameraTableView }) {
  const { snap, v, receivedAt } = props;
  const act = useAct(props);
  const seat = v.proposal || v.result ? null : v.order[v.turn];
  const mine = !!seat && snap.you.seat === seat;
  return (
    <div className={`ct-turn${mine ? ' mine' : ''}`} aria-live="polite">
      {seat ? (
        <>
          <Disc colour={seat} size={22} />
          <strong>{mine ? 'Your turn' : `${nameOf(snap, seat)}’s turn`}</strong>
          <span className="muted">Round {v.round}</span>
          <MoveTimer snap={snap} seatId={seat} receivedAt={receivedAt} />
          <span className="ct-spacer" />
          {snap.you.host && (
            <select aria-label="Whose turn" value="" onChange={(e) => e.target.value && act({ type: 'next', seat: e.target.value })}>
              <option value="">Pass to…</option>
              {v.order.map((s) => <option key={s} value={s}>{nameOf(snap, s)}</option>)}
            </select>
          )}
          {(mine || snap.you.host) && <button className="btn small primary" onClick={() => act({ type: 'next' })}>Next turn</button>}
        </>
      ) : <strong>Agreeing the result</strong>}
    </div>
  );
}

// ---- dice ----------------------------------------------------------------

function DieFace({ sides, value }: { sides: number; value: number }) {
  if (sides === 6) return <Die value={value} size={34} />;
  return <span className={`ct-die d${sides}`} role="img" aria-label={`d${sides} showing ${value}`}><span>{value}</span></span>;
}

function DiceRoller(props: StageProps & { v: CameraTableView }) {
  const { snap, v } = props;
  const act = useAct(props);
  const [pool, setPool] = useState<number[]>([6, 6]);
  const canRoll = snap.you.host || (!!snap.you.seat && v.order.includes(snap.you.seat));
  const last = v.rolls.at(-1);
  const counts = DICE.map((d) => [d, pool.filter((p) => p === d).length] as const).filter(([, n]) => n);
  const label = counts.map(([d, n]) => `${n > 1 ? n : ''}d${d}`).join(' + ');
  return (
    <section className="ct-card" aria-label="Dice">
      <h3>Dice</h3>
      {last ? <LastRoll roll={last} /> : <p className="hint">Rolled on the server, so everyone sees the same roll.</p>}
      {canRoll && (
        <>
          <div className="ct-dice-pick" role="group" aria-label="Add a die">
            {DICE.map((d) => (
              <button key={d} className="chip" disabled={pool.length >= MAX_DICE} onClick={() => setPool([...pool, d].sort((a, b) => a - b))} aria-label={`Add a d${d}`}>d{d}</button>
            ))}
          </div>
          <div className="row wrap">
            <button className="btn small primary" disabled={!pool.length} onClick={() => act({ type: 'roll', dice: pool })}>Roll {label || 'dice'}</button>
            {pool.length > 0 && <button className="btn small" onClick={() => setPool([])}>Clear</button>}
            {pool.length > 0 && <button className="btn small" onClick={() => setPool(pool.slice(0, -1))} aria-label="Remove a die">−1 die</button>}
          </div>
        </>
      )}
    </section>
  );
}

function LastRoll({ roll }: { roll: Roll }) {
  return (
    <div className="ct-roll" key={roll.id}>
      <div className="ct-roll-dice">{roll.dice.map((d, i) => <DieFace key={i} sides={d.sides} value={d.value} />)}</div>
      <p><strong>{roll.name}</strong> rolled {roll.dice.length > 1 ? `${roll.dice.map((d) => d.value).join(' + ')} = ${roll.total}` : roll.total}</p>
    </div>
  );
}

// ---- score pad -----------------------------------------------------------

function ScorePad(props: StageProps & { v: CameraTableView }) {
  const { snap, v } = props;
  const act = useAct(props);
  const canEdit = (seat: string) => snap.you.host || (v.config.playersScore && snap.you.seat === seat);
  return (
    <section className="ct-card" aria-label="Score pad">
      <h3>Score pad</h3>
      <table className="ct-scores">
        <tbody>
          {v.order.map((seat) => (
            <tr key={seat} className={snap.you.seat === seat ? 'mine' : ''}>
              <td><Disc colour={seat} size={18} /></td>
              <td className="ct-name">{nameOf(snap, seat)}</td>
              <td className="ct-score">
                {canEdit(seat)
                  ? <ScoreInput value={v.scores[seat] ?? 0} label={nameOf(snap, seat)} onSet={(value) => act({ type: 'score', seat, value })} onDelta={(delta) => act({ type: 'score', seat, delta })} />
                  : <span className="ct-score-value">{v.scores[seat] ?? 0}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{v.config.playersScore ? 'The host can change any score; players change their own.' : 'The host keeps the scores.'}</p>
    </section>
  );
}

function ScoreInput({ value, label, onSet, onDelta }: { value: number; label: string; onSet(v: number): void; onDelta(d: number): void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isInteger(n) && n !== value) onSet(n); else setDraft(String(value));
  };
  return (
    <span className="ct-score-edit">
      <button className="icon-btn small" aria-label={`Take one from ${label}`} onClick={() => onDelta(-1)}>−</button>
      <input inputMode="numeric" aria-label={`${label}’s score`} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button className="icon-btn small" aria-label={`Add one to ${label}`} onClick={() => onDelta(1)}>+</button>
    </span>
  );
}

// ---- the result --------------------------------------------------------

function Placings({ snap, placings, proposal }: { snap: RoomSnapshot; placings: string[][]; proposal?: Proposal }) {
  let place = 1;
  return (
    <ol className="ct-places">
      {placings.map((group) => {
        const p = place;
        place += group.length;
        return group.map((seat) => (
          <li key={seat}>
            <span className="ct-place">{ordinal(p)}</span>
            <Disc colour={seat} size={16} />
            <span className="ct-name">{nameOf(snap, seat)}</span>
            {proposal && (proposal.confirmed.includes(seat)
              ? <span className="ct-ok">Confirmed</span>
              : <span className="muted">Waiting</span>)}
          </li>
        ));
      })}
    </ol>
  );
}

function Result(props: StageProps & { v: CameraTableView }) {
  const { snap, v } = props;
  const act = useAct(props);
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  const p = v.proposal;
  useEffect(() => { setEditing(false); setEnding(false); }, [p?.version, v.disputed?.version]);
  const me = snap.you.seat && v.order.includes(snap.you.seat) ? snap.you.seat : null;
  const end = ending
    ? <><button className="btn small danger" onClick={() => act({ type: 'abandon' })}>Yes, end it: it won’t count</button><button className="btn small" onClick={() => setEnding(false)}>Keep playing</button></>
    : <button className="btn small" onClick={() => setEnding(true)}>End without a result</button>;

  if (editing) return <PlacesForm {...props} v={v} start={v.disputed?.placings ?? p?.placings} onCancel={() => setEditing(false)} onSend={(placings) => act({ type: 'propose', placings })} />;

  if (p) {
    return (
      <section className="ct-card ct-result" aria-label="The result">
        <h3>The result, to confirm</h3>
        <Placings snap={snap} placings={p.placings} proposal={p} />
        <p className="hint">{p.confirmed.length} of {v.order.length} confirmed. It counts once everyone has; a dispute sends it back to the host.</p>
        <div className="row wrap">
          {me && !p.confirmed.includes(me) && (
            <>
              <button className="btn small primary" onClick={() => act({ type: 'confirm', version: p.version })}>Confirm</button>
              <button className="btn small danger" onClick={() => act({ type: 'dispute', version: p.version })}>Dispute</button>
            </>
          )}
          {me && p.confirmed.includes(me) && <span className="note">You’ve confirmed. Waiting for the others.</span>}
          {snap.you.host && <button className="btn small" onClick={() => act({ type: 'withdraw' })}>Take it back</button>}
          {snap.you.host && end}
        </div>
      </section>
    );
  }

  if (v.disputed) {
    const who = v.disputed.disputed.map((s) => nameOf(snap, s)).join(', ');
    return (
      <section className="ct-card ct-result disputed" aria-label="The result">
        <h3>Disputed by {who}</h3>
        <Placings snap={snap} placings={v.disputed.placings} />
        {snap.you.host
          ? <div className="row wrap"><button className="btn small primary" onClick={() => setEditing(true)}>Change the places and ask again</button>{end}</div>
          : <p className="hint">The host can change the places and ask again, or end the game without it counting.</p>}
      </section>
    );
  }

  if (!snap.you.host) return null;
  return (
    <section className="ct-card ct-result" aria-label="The result">
      <h3>Finished?</h3>
      <div className="row wrap">
        <button className="btn small primary" onClick={() => setEditing(true)}>Enter the result</button>
        {end}
      </div>
    </section>
  );
}

/** The host enters each player's place (ties share a place). Starts from the
 *  score pad (highest first), or the places being revised. */
function PlacesForm({ snap, v, start, onCancel, onSend }: StageProps & { v: CameraTableView; start?: string[][]; onCancel(): void; onSend(placings: string[][]): void }) {
  const initial = useMemo(() => {
    const out: Record<string, number> = {};
    if (start) {
      let place = 1;
      for (const group of start) { for (const s of group) out[s] = place; place += group.length; }
      return out;
    }
    const sorted = [...v.order].sort((a, b) => (v.scores[b] ?? 0) - (v.scores[a] ?? 0));
    sorted.forEach((s, i) => { out[s] = i > 0 && v.scores[s] === v.scores[sorted[i - 1]] ? out[sorted[i - 1]] : i + 1; });
    return out;
  }, [start, v.order, v.scores]);
  const [places, setPlaces] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const byPlace = new Map<number, string[]>();
    for (const s of v.order) byPlace.set(places[s], [...(byPlace.get(places[s]) ?? []), s]);
    onSend([...byPlace].sort(([a], [b]) => a - b).map(([, g]) => g));
  };
  return (
    <form className="ct-card ct-result" onSubmit={submit} aria-label="Enter the result">
      <h3>Enter the result</h3>
      {v.order.map((s) => (
        <label key={s} className="ct-place-row">
          <Disc colour={s} size={16} />
          <span className="ct-name">{nameOf(snap, s)}</span>
          <span className="muted">{v.scores[s] ?? 0}</span>
          <select value={places[s]} onChange={(e) => setPlaces({ ...places, [s]: Number(e.target.value) })} aria-label={`${nameOf(snap, s)}’s place`}>
            {v.order.map((_, i) => <option key={i} value={i + 1}>{ordinal(i + 1)}</option>)}
          </select>
        </label>
      ))}
      <p className="hint">Give players the same place for a tie. Each player then confirms.</p>
      <div className="row wrap">
        <button className="btn small primary">Ask everyone to confirm</button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ---- the side tab, seat cards and settings -------------------------------

function RollsTab({ snap }: StageProps) {
  const v = snap.game.view as CameraTableView | null;
  if (!v?.rolls.length) return <p className="empty">No rolls yet.</p>;
  return (
    <ol className="ct-rolls">
      {[...v.rolls].reverse().map((r) => (
        <li key={r.id}>
          <span className="ct-roll-dice small">{r.dice.map((d, i) => <DieFace key={i} sides={d.sides} value={d.value} />)}</span>
          <span><strong>{r.name}</strong> · {r.total}</span>
        </li>
      ))}
    </ol>
  );
}

function ConfigPicker({ value, onChange, disabled }: { value: unknown; onChange(v: unknown): void; disabled?: boolean }) {
  const c = { name: '', seats: 4, playersScore: true, ...(value as Partial<CameraTableConfig> | null) };
  const [name, setName] = useState(c.name);
  useEffect(() => { setName(c.name); }, [c.name]);
  return (
    <>
      <label className="field"><span>The game you’re playing</span>
        <input value={name} required maxLength={NAME_MAX} disabled={disabled} placeholder="e.g. Ticket to Ride"
          onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) onChange({ ...c, name: e.target.value }); }} />
        <span className="hint">Its leaderboard is kept under this name (capitals don’t matter).</span>
      </label>
      <label className="field"><span>Seats</span>
        <select value={c.seats} disabled={disabled} onChange={(e) => onChange({ ...c, seats: Number(e.target.value) })}>
          {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => i + MIN_SEATS).map((n) => <option key={n} value={n}>{n} players</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={c.playersScore} disabled={disabled} onChange={(e) => onChange({ ...c, playersScore: e.target.checked })} /> Players can change their own score (the host always can)</label>
    </>
  );
}

export const cameraTableClient: GameClient = {
  id: 'cameratable',
  Stage: CameraTableStage,
  tab: { label: 'Rolls', Component: RollsTab },
  seatExtra: ({ snap }, seatId) => {
    const v = snap.game.view as CameraTableView | null;
    const score = v && snap.game.status !== 'idle' && v.order.includes(seatId) ? v.scores[seatId] ?? 0 : null;
    return (
      <span className="ct-seat-extra">
        <Disc colour={seatId} size={20} />
        {score !== null && <span className="ct-seat-score" title="Score">{score}</span>}
      </span>
    );
  },
  ConfigPicker,
};
