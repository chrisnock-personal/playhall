import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { TIME_CONTROLS, type ChessConfig, type ChessSide, type ChessView } from '../../shared/games/chess';
import type { GameClient, StageProps } from './types';
import { Avatar } from '../ui';

function useNow(active: boolean, ms = 200): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 20 && ms > 0 && ms < 10_000) return (Math.max(0, ms) / 1000).toFixed(1);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

function Clock({ view, side, receivedAt }: { view: ChessView | null; side: ChessSide; receivedAt: number }) {
  const running = view?.clockRunning === side;
  const now = useNow(running);
  if (!view?.clocks) return null;
  const left = view.clocks[side] - (running ? now - receivedAt : 0);
  return (
    <span className={`clock${running ? ' running' : ''}${left < 20_000 ? ' low' : ''}`} aria-label={`${side} clock`}>
      {fmt(left)}
    </span>
  );
}

function dests(fen: string): Map<Key, Key[]> {
  const c = new Chess(fen);
  const m = new Map<Key, Key[]>();
  for (const mv of c.moves({ verbose: true })) {
    const list = m.get(mv.from as Key) ?? [];
    list.push(mv.to as Key);
    m.set(mv.from as Key, list);
  }
  return m;
}

function PlayerStrip({ props, side }: { props: StageProps; side: ChessSide }) {
  const { snap, receivedAt, send } = props;
  const seat = snap.seats.find((s) => s.id === side)!;
  const view = snap.game.view as ChessView | null;
  const member = snap.members.find((m) => m.userId === seat.userId);
  const canSit = !seat.userId && snap.game.status !== 'playing' && !snap.you.seat
    && (snap.room.settings.seatPolicy === 'open' || snap.you.host);
  const toMove = snap.game.status === 'playing' && view?.turn === side;
  return (
    <div className={`player-strip${toMove ? ' to-move' : ''}`}>
      {seat.userId ? (
        <>
          <Avatar name={seat.name ?? '?'} id={seat.userId} size={32} dim={member ? !member.online : false} />
          <div className="who">
            <strong>{seat.name}</strong>
            <span>{seat.label}{member?.host ? ' · host' : ''}{seat.userId === snap.you.userId ? ' · you' : ''}{member && !member.online ? ' · away' : ''}</span>
          </div>
        </>
      ) : (
        <div className="who"><strong className="muted">Free seat</strong><span>{seat.label}</span></div>
      )}
      {canSit && <button className="btn small primary" onClick={() => send({ t: 'sit', seat: side })}>Sit here</button>}
      <Clock view={view} side={side} receivedAt={receivedAt} />
    </div>
  );
}

const PROMO: { role: string; label: string; glyph: Record<ChessSide, string> }[] = [
  { role: 'q', label: 'Queen', glyph: { white: '♕', black: '♛' } },
  { role: 'r', label: 'Rook', glyph: { white: '♖', black: '♜' } },
  { role: 'b', label: 'Bishop', glyph: { white: '♗', black: '♝' } },
  { role: 'n', label: 'Knight', glyph: { white: '♘', black: '♞' } },
];

function ChessStage(props: StageProps) {
  const { snap, send } = props;
  const view = snap.game.view as ChessView | null;
  const mySide = (snap.you.seat as ChessSide | null) ?? null;
  const [flipped, setFlipped] = useState(false);
  const orientation: ChessSide = mySide ?? (flipped ? 'black' : 'white');
  const playing = snap.game.status === 'playing';
  const fen = view?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const myTurn = playing && !!mySide && view?.turn === mySide;

  const boxRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const [promo, setPromo] = useState<{ from: Key; to: Key } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const sendRef = useRef(send);
  sendRef.current = send;

  useLayoutEffect(() => {
    const el = boxRef.current!;
    const cg = Chessground(el, { coordinates: true, animation: { duration: 180 }, highlight: { lastMove: true, check: true } });
    cgRef.current = cg;
    const ro = new ResizeObserver(() => cg.redrawAll());
    ro.observe(el);
    return () => { ro.disconnect(); cg.destroy(); cgRef.current = null; };
  }, []);

  useEffect(() => {
    const cg = cgRef.current;
    if (!cg) return;
    const turn: ChessSide = view?.turn ?? 'white';
    cg.set({
      fen,
      orientation,
      turnColor: turn,
      lastMove: (view?.lastMove as Key[] | undefined) ?? undefined,
      check: view?.check ? turn : false,
      movable: {
        free: false,
        color: myTurn ? mySide! : undefined,
        dests: myTurn ? dests(fen) : new Map(),
        showDests: true,
        events: {
          after: (orig, dest) => {
            const piece = new Chess(fen).get(orig as Square);
            const last = dest[1] === '8' || dest[1] === '1';
            if (piece?.type === 'p' && last) { setPromo({ from: orig, to: dest }); return; }
            sendRef.current({ t: 'act', action: { type: 'move', from: orig, to: dest } });
          },
        },
      },
      premovable: { enabled: false },
    });
  }, [fen, orientation, myTurn, mySide, view?.lastMove?.join(), view?.check, view?.turn]);

  useEffect(() => { setConfirmResign(false); }, [snap.game.status]);

  const choosePromo = (role: string) => {
    if (!promo) return;
    send({ t: 'act', action: { type: 'move', from: promo.from, to: promo.to, promotion: role } });
    setPromo(null);
  };
  const cancelPromo = () => { setPromo(null); cgRef.current?.set({ fen }); };

  const top: ChessSide = orientation === 'white' ? 'black' : 'white';
  const opp: ChessSide | null = mySide ? (mySide === 'white' ? 'black' : 'white') : null;
  const allSeated = snap.seats.every((s) => s.userId);
  const result = snap.game.result;
  const resultText = result
    ? `${result.winner ? `${snap.seats.find((s) => s.id === result.winner)?.label} wins` : 'Draw'} by ${result.reason}`
    : null;

  return (
    <div className="chess-stage">
      <div className="chess-col">
        <PlayerStrip props={props} side={top} />
        <div className="board-box">
          <div ref={boxRef} className="board" />
          {promo && mySide && (
            <div className="promo" role="dialog" aria-label="Promote to">
              {PROMO.map((p) => (
                <button key={p.role} className="promo-btn" onClick={() => choosePromo(p.role)} aria-label={p.label}>{p.glyph[mySide]}</button>
              ))}
              <button className="btn small" onClick={cancelPromo}>Cancel</button>
            </div>
          )}
        </div>
        <PlayerStrip props={props} side={orientation} />
        <div className="stage-actions">
          {resultText && <span className="result-pill">{resultText}</span>}
          {playing && mySide && view?.drawOfferBy === opp && (
            <>
              <span className="note">Draw offered</span>
              <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'accept_draw' } })}>Accept draw</button>
              <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'decline_draw' } })}>Decline</button>
            </>
          )}
          {playing && mySide && view?.drawOfferBy !== opp && (
            <button className="btn small" disabled={view?.drawOfferBy === mySide}
              onClick={() => send({ t: 'act', action: { type: 'offer_draw' } })}>
              {view?.drawOfferBy === mySide ? 'Draw offered' : 'Offer draw'}
            </button>
          )}
          {playing && mySide && (confirmResign
            ? <>
              <button className="btn small danger" onClick={() => send({ t: 'act', action: { type: 'resign' } })}>Yes, resign</button>
              <button className="btn small" onClick={() => setConfirmResign(false)}>Keep playing</button>
            </>
            : <button className="btn small danger" onClick={() => setConfirmResign(true)}>Resign</button>)}
          {!mySide && <button className="btn small" onClick={() => setFlipped((f) => !f)}>Flip board</button>}
          {!playing && snap.you.host && (
            <button className="btn small primary" disabled={!allSeated} onClick={() => send({ t: 'start' })}
              title={allSeated ? undefined : 'Both seats need a player'}>
              {snap.game.status === 'over' ? 'Start the next game' : 'Start the game'}
            </button>
          )}
          {!playing && !snap.you.host && allSeated && <span className="note">Waiting for the host to start</span>}
          {!playing && !allSeated && <span className="note">Waiting for players</span>}
        </div>
      </div>
    </div>
  );
}

function MovesTab({ snap }: StageProps) {
  const view = snap.game.view as ChessView | null;
  const san = view?.san ?? [];
  if (!san.length) return <p className="empty">No moves yet.</p>;
  const rows: [number, string, string | undefined][] = [];
  for (let i = 0; i < san.length; i += 2) rows.push([i / 2 + 1, san[i], san[i + 1]]);
  return (
    <ol className="moves">
      {rows.map(([n, w, b]) => (
        <li key={n}><span className="n">{n}.</span><span>{w}</span><span>{b ?? ''}</span></li>
      ))}
    </ol>
  );
}

function ConfigPicker({ value, onChange, disabled }: { value: unknown; onChange(v: unknown): void; disabled?: boolean }) {
  const v = value as ChessConfig;
  const current = TIME_CONTROLS.findIndex((t) => t.config.initialSeconds === v?.initialSeconds && t.config.incrementSeconds === v?.incrementSeconds);
  return (
    <label className="field">
      <span>Time control</span>
      <select value={current < 0 ? '' : String(current)} disabled={disabled} onChange={(e) => onChange(TIME_CONTROLS[Number(e.target.value)].config)}>
        {current < 0 && <option value="">Custom</option>}
        {TIME_CONTROLS.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
      </select>
    </label>
  );
}

export const chessClient: GameClient = {
  id: 'chess',
  Stage: ChessStage,
  tab: { label: 'Moves', Component: MovesTab },
  seatExtra: ({ snap, receivedAt }, seatId) => <Clock view={snap.game.view as ChessView | null} side={seatId as ChessSide} receivedAt={receivedAt} />,
  ConfigPicker,
};
