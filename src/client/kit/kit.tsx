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

/** A seated player above or below a board: colour, name, whose turn it is,
 *  a "Sit here" button for a free seat, and a slot for a clock or score. */
export function PlayerStrip({ snap, send, seatId, toMove, extra }: {
  snap: RoomSnapshot; send(m: ClientMessage): void; seatId: string; toMove: boolean; extra?: ReactNode;
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
    </div>
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
  const need = minPlayers ?? snap.seats.length;
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
      {!playing && !snap.you.host && ready && <span className="note">Waiting for the host to start</span>}
      {!playing && !ready && <span className="note">Waiting for players ({seated} of {need})</span>}
    </div>
  );
}
