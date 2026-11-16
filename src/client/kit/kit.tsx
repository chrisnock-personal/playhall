// The shared kit every game is drawn from, so they read as one family:
// the wood palette (from the chess board), player colours that differ in
// lightness as well as hue, one disc, one player strip and the same game
// controls. See docs/games.md.

import { useEffect, useState, type ReactNode } from 'react';
import type { ClientMessage, RoomSnapshot } from '../../shared/protocol';
import { Avatar } from '../ui';

export const WOOD = { light: '#E6D5B3', dark: '#A97F57', frame: '#8A6440', hole: '#2A2219', lastMove: '#EED68A' };

/** Fill, rim and a label for each player colour; white and black for chess
 *  and checkers. Seat ids in games are these names. */
export const COLOURS: Record<string, { fill: string; rim: string; label: string }> = {
  amber: { fill: '#F0A53C', rim: '#B36F14', label: 'Amber' },
  teal: { fill: '#3FB3A2', rim: '#1F6E63', label: 'Teal' },
  violet: { fill: '#9B7BE0', rim: '#5E43A3', label: 'Violet' },
  rose: { fill: '#E07A8F', rim: '#A3435A', label: 'Rose' },
  // Seats 5 and 6 (user, 2026-11-16): told apart from the four above by hue and lightness.
  lime: { fill: '#9CC83F', rim: '#5E8418', label: 'Lime' },
  blue: { fill: '#4F86E8', rim: '#2A55A8', label: 'Blue' },
  // Seats 7 and 8 (the camera table): a deep red, darker and more saturated
  // than rose and redder than amber, and a blue-grey slate, the one colour
  // without much hue (coral was too close to amber and rose).
  red: { fill: '#D2433F', rim: '#8C1F1C', label: 'Red' },
  slate: { fill: '#8C97A8', rim: '#525C6B', label: 'Slate' },
  white: { fill: '#F4EFE4', rim: '#9C9488', label: 'White' },
  black: { fill: '#2A2A2E', rim: '#0E0E10', label: 'Black' },
};

/** A flat playing disc with a rim: checkers men, Four in a Row counters,
 *  Ludo tokens. `ring` marks it (a winning line, the last move). */
export function Disc({ colour, size = 40, ring, crown, className }: {
  colour: string; size?: number | string; ring?: boolean; crown?: boolean; className?: string;
}) {
  const c = COLOURS[colour] ?? COLOURS.white;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {ring && <circle cx="20" cy="20" r="19" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />}
      <circle cx="20" cy="20" r="16.5" fill={c.rim} />
      <circle cx="20" cy="19" r="15" fill={c.fill} />
      <circle cx="20" cy="19" r="10.5" fill="none" stroke={c.rim} strokeOpacity=".35" strokeWidth="1.5" />
      {crown && <path d="M13 23l1.5-8 3.5 4 2-5 2 5 3.5-4 1.5 8z" fill={c.rim} />}
    </svg>
  );
}

/** An 8×8 (or any n×n) board in the chess board's colours. Square 0 is the
 *  bottom-left from the first player's side; `flipped` turns it round. Each
 *  square is a button when `onSquare` is given, so it works by keyboard. */
export function SquareBoard({ size = 8, flipped, render, mark, onSquare, onHover, label, files = 'abcdefgh', variant }: {
  size?: number;
  flipped?: boolean;
  render(index: number): ReactNode;
  /** Extra class per square: 'last', 'selected', 'target'... */
  mark?(index: number): string | undefined;
  onSquare?(index: number): void;
  /** The square under the pointer (or keyboard focus), or null when it leaves. */
  onHover?(index: number | null): void;
  label: string;
  files?: string;
  /** 'sea' for Sea Battle's waters; the default is the wooden board. */
  variant?: 'sea';
}) {
  const cells: number[] = [];
  for (let vr = 0; vr < size; vr++) for (let vc = 0; vc < size; vc++) {
    const r = flipped ? vr : size - 1 - vr, c = flipped ? size - 1 - vc : vc;
    cells.push(r * size + c);
  }
  return (
    <div className={`square-board${variant ? ` ${variant}` : ''}`} role="grid" aria-label={label} style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${size}, minmax(0, 1fr))` }}>
      {cells.map((i, n) => {
        const r = Math.floor(i / size), c = i % size;
        const dark = (r + c) % 2 === 0;
        const name = variant === 'sea' ? `${files[c]}${size - r}` : `${files[c] ?? c + 1}${r + 1}`;
        const cls = `sq ${dark ? 'dark' : 'light'} ${mark?.(i) ?? ''}`;
        const content = (
          <>
            {render(i)}
            {n % size === 0 && <span className="coord rank">{variant === 'sea' ? size - r : r + 1}</span>}
            {n >= size * (size - 1) && <span className="coord file">{files[c] ?? c + 1}</span>}
          </>
        );
        return onSquare
          ? (
            <button key={i} className={cls} aria-label={name} onClick={() => onSquare(i)}
              onMouseEnter={onHover && (() => onHover(i))} onFocus={onHover && (() => onHover(i))}
              onMouseLeave={onHover && (() => onHover(null))} onBlur={onHover && (() => onHover(null))}>
              {content}
            </button>
          )
          : <div key={i} className={cls}>{content}</div>;
      })}
    </div>
  );
}

/** Counts down the room's move timer for the seat whose turn it is. */
export function MoveTimer({ snap, seatId, receivedAt }: { snap: RoomSnapshot; seatId: string; receivedAt: number }) {
  // A player who dropped out shows their time to get back instead.
  const away = snap.game.leaving?.[seatId];
  const deadline = away ?? snap.game.moveDeadline;
  const active = !!deadline && (!!away || snap.game.turnSeats.includes(seatId));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  if (!active || !deadline) return null;
  const left = Math.max(0, deadline - snap.serverNow - (now - receivedAt));
  const s = Math.ceil(left / 1000);
  const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return away
    ? <span className="clock away" aria-label="Time left to come back before forfeiting">away {text}</span>
    : <span className={`clock running${left < 10_000 ? ' low' : ''}`} aria-label="Time left for this move">{text}</span>;
}

/** The pawn from the Playhall logo, in a player's colour: Snakes and
 *  Ladders and Ludo tokens. */
export function Pawn({ colour, size = 28 }: { colour: string; size?: number | string }) {
  const c = COLOURS[colour] ?? COLOURS.white;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="20" cy="36" rx="12" ry="3" fill="rgba(0,0,0,.35)" />
      <circle cx="20" cy="11" r="6.5" fill={c.fill} stroke={c.rim} strokeWidth="1.5" />
      <rect x="13.5" y="18" width="13" height="3.5" rx="1.7" fill={c.fill} stroke={c.rim} strokeWidth="1.5" />
      <path d="M17 21.5h6l3 9.5H14z" fill={c.fill} stroke={c.rim} strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="10.5" y="30.5" width="19" height="5" rx="2.2" fill={c.fill} stroke={c.rim} strokeWidth="1.5" />
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

/** One die. `rollKey` changing replays the roll animation. The value always
 *  comes from the server. */
export function Die({ value, size = 56, rollKey }: { value: number | null; size?: number; rollKey?: string | number }) {
  return (
    <svg key={rollKey} className="die" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={value ? `Die showing ${value}` : 'Die'}>
      <rect x="4" y="4" width="92" height="92" rx="18" fill="#F4EFE4" stroke="#9C9488" strokeWidth="3" />
      {(PIPS[value ?? 0] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8.5" fill="#2A2219" />)}
    </svg>
  );
}

/** A seated player above or below a board: colour, name, whose turn it is,
 *  a "Sit here" button for a free seat, and a slot for a clock or score. */
export function PlayerStrip({ snap, send, seatId, toMove, extra, receivedAt }: {
  snap: RoomSnapshot; send(m: ClientMessage): void; seatId: string; toMove: boolean; extra?: ReactNode; receivedAt?: number;
}) {
  const seat = snap.seats.find((s) => s.id === seatId)!;
  const member = snap.members.find((m) => m.userId === seat.userId);
  const canSit = !seat.userId && snap.game.status !== 'playing' && !snap.you.seat
    && (snap.room.settings.seatPolicy === 'open' || snap.you.host);
  return (
    <div className={`player-strip${toMove ? ' to-move' : ''}`}>
      {COLOURS[seatId] && <Disc colour={seatId} size={22} />}
      {seat.userId ? (
        <>
          <Avatar name={seat.name ?? '?'} id={seat.userId} size={32} dim={member ? !member.online : false} />
          <div className="who">
            <strong>{seat.name}</strong>
            <span>{seat.label}{member?.host ? ' · host' : ''}{seat.userId === snap.you.userId ? ' · you' : ''}{member && !member.online ? ' · away' : ''}{toMove ? ' · to play' : ''}</span>
          </div>
        </>
      ) : (
        <div className="who"><strong className="muted">Free seat</strong><span>{seat.label}</span></div>
      )}
      {canSit && <button className="btn small primary" onClick={() => send({ t: 'sit', seat: seatId })}>Sit here</button>}
      {extra}
      {receivedAt !== undefined && <MoveTimer snap={snap} seatId={seatId} receivedAt={receivedAt} />}
    </div>
  );
}

/** After a game: a seated player's rematch button, and who has agreed.
 *  The next game starts when every seated player has (or the host starts it). */
export function Rematch({ snap, send }: { snap: RoomSnapshot; send(m: ClientMessage): void }) {
  const r = snap.rematch;
  if (!r || !r.allowed || snap.game.status !== 'over') return null;
  const seated = snap.seats.filter((s) => s.userId);
  if (seated.length < snap.room.minPlayers) return null;
  const mine = !!snap.you.seat && r.agreed.includes(snap.you.userId);
  const agreed = seated.filter((s) => r.agreed.includes(s.userId!)).map((s) => s.name);
  return (
    <>
      {snap.you.seat && (
        <button className={`btn small${mine ? '' : ' primary'}`} aria-pressed={mine}
          onClick={() => send({ t: 'rematch', want: !mine })}>
          {mine ? 'Take back rematch' : 'Rematch'}
        </button>
      )}
      {agreed.length > 0 && (
        <span className="note" aria-live="polite">
          Rematch: {agreed.join(', ')} {agreed.length === 1 ? 'wants' : 'want'} one ({agreed.length} of {seated.length})
        </span>
      )}
    </>
  );
}

/** Under the stage: the result, resigning (with a second click to confirm),
 *  and the host's start button. Each game adds its own buttons as children. */
export function GameActions({ snap, send, minPlayers, resign = true, children }: {
  snap: RoomSnapshot; send(m: ClientMessage): void; minPlayers?: number; resign?: boolean; children?: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setConfirm(false); }, [snap.game.status]);
  const playing = snap.game.status === 'playing';
  const seated = snap.seats.filter((s) => s.userId).length;
  const need = minPlayers ?? snap.room.minPlayers;
  const ready = seated >= need;
  const result = snap.game.result;
  const winnerLabel = result?.winner ? snap.seats.find((s) => s.id === result.winner)?.label : null;
  return (
    <div className="stage-actions">
      {result && !playing && (
        <span className="result-pill">{result.aborted ? `Stopped: ${result.reason}` : `${winnerLabel ? `${winnerLabel} wins` : 'Draw'} by ${result.reason}`}</span>
      )}
      {children}
      {playing && snap.you.seat && resign && (confirm
        ? <>
          <button className="btn small danger" onClick={() => send({ t: 'act', action: { type: 'resign' } })}>Yes, resign</button>
          <button className="btn small" onClick={() => setConfirm(false)}>Keep playing</button>
        </>
        : <button className="btn small danger" onClick={() => setConfirm(true)}>Resign</button>)}
      {!playing && snap.you.host && (
        <button className="btn small primary" disabled={!ready} onClick={() => send({ t: 'start' })}
          title={ready ? undefined : `Needs ${need} players`}>
          {snap.game.status === 'over' ? 'Start the next game' : 'Start the game'}
        </button>
      )}
      {!playing && <Rematch snap={snap} send={send} />}
      {!playing && !snap.you.host && ready && !(snap.rematch?.allowed && snap.you.seat) && <span className="note">{snap.rematch?.allowed ? 'Waiting for a rematch or the host' : 'Waiting for the host to start'}</span>}
      {!playing && !ready && <span className="note">Waiting for players ({seated} of {need})</span>}
    </div>
  );
}
