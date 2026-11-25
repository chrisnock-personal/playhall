// Bounty Board's first stage: a plain board with legal squares, a visible
// shop and the money log. Deliberately no Wild West art yet — the rules are
// what this prototype is testing.

import { useEffect, useState } from 'react';
import {
  GADGETS, gadgetInfo, type BountyConfig, type BountyKind, type BountyMove,
  type BountySide, type BountyView, type GadgetId,
} from '../../shared/games/bountyboard';
import type { GameClient, StageProps } from './types';
import { GameActions, PlayerStrip, SquareBoard } from '../kit/kit';
import './bountyboard.css';

const GLYPH: Record<BountyKind, string> = {
  king: 'M', queen: 'B', rook: 'S', bishop: 'R', knight: 'N', pawn: 'G',
};
const BADGE: Record<GadgetId, string> = {
  spurs: 's', sidewinder: 'w', longrifle: 'l', ladder: 'd', lasso: 'o',
  ironhorse: 'h', railswitch: 'r', vest: 'v', bountyhunter: 'b', reward: '$',
};
const squareName = (i: number) => `${'abcdefgh'[i % 8]}${Math.floor(i / 8) + 1}`;

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
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function Clock({ v, side, receivedAt }: { v: BountyView | null; side: BountySide; receivedAt: number }) {
  const running = v?.clockRunning === side;
  const now = useNow(running);
  if (!v?.clocks) return null;
  const left = v.clocks[side] - (running ? now - receivedAt : 0);
  return <span className={running ? 'clock running' : 'clock'}>{fmt(left)}</span>;
}

function fits(g: GadgetId, piece: { kind: BountyKind; gadgets: GadgetId[] }): boolean {
  const info = gadgetInfo(g);
  return !!info && piece.kind !== 'king' && piece.gadgets.length < 2
    && !piece.gadgets.includes(g) && (info.who === 'any' || info.who === piece.kind);
}

function BountyStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as BountyView | null;
  const playing = snap.game.status === 'playing';
  const mine = snap.you.seat as BountySide | null;
  const myTurn = playing && !!mine && v?.turn === mine;
  const [flip, setFlip] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [gadget, setGadget] = useState<GadgetId | null>(null);
  const [buySquare, setBuySquare] = useState<number | null>(null);
  useEffect(() => {
    setSelected(null); setGadget(null); setBuySquare(null);
  }, [v?.moveCount, snap.game.status]);
  const flipped = mine ? mine === 'black' : flip;
  const opp: BountySide = mine === 'white' ? 'black' : 'white';
  const top: BountySide = flipped ? 'black' : 'white';

  const targets = new Set(selected === null ? [] : (v?.legal ?? []).filter((m) => m.from === selected).map((m) => m.to));
  const movable = new Set((v?.legal ?? []).map((m) => m.from));
  const last = v?.lastMove;

  const click = (i: number) => {
    if (!myTurn || !v) return;
    if (selected !== null) {
      const move: BountyMove | undefined = (v.legal ?? []).find((m) => m.from === selected && m.to === i);
      if (move) {
        send({ t: 'act', action: { type: 'move', ...move, ...(gadget && buySquare !== null ? { buy: { gadget, square: buySquare } } : {}) } });
        setSelected(null); setGadget(null); setBuySquare(null);
        return;
      }
    }
    const piece = v.board[i];
    if (piece?.side === mine) {
      setSelected(i);
      if (gadget && fits(gadget, piece)) setBuySquare(i);
      return;
    }
    setSelected(null);
  };

  const pickGadget = (id: GadgetId) => {
    setGadget((g) => (g === id ? null : id));
    setBuySquare(null);
  };

  return (
    <div className="board-stage">
      <div className="checkers-col">
        <PlayerStrip snap={snap} send={send} seatId={top} toMove={playing && v?.turn === top} receivedAt={receivedAt}
          extra={<span className="bb-money">${v?.dollars[top] ?? 0} <Clock v={v} side={top} receivedAt={receivedAt} /></span>} />
        <SquareBoard label="Bounty Board" flipped={flipped} onSquare={myTurn ? click : undefined}
          mark={(i) => [
            last && (last.to === i || last.from === i || last.via === i || last.pull === i) ? 'last' : '',
            selected === i ? 'selected' : '',
            targets.has(i) ? 'target' : '',
            selected === null && movable.has(i) ? 'movable' : '',
            buySquare === i ? 'selected' : '',
          ].join(' ')}
          render={(i) => {
            const p = v?.board[i];
            if (!p) return null;
            return (
              <span className={`bb-piece ${p.side}`} title={`${GLYPH[p.kind]} — ${p.kind}${p.gadgets.length ? `, ${p.gadgets.map((g) => gadgetInfo(g)?.label).join(', ')}` : ''}`}>
                {GLYPH[p.kind]}
                {p.gadgets.length > 0 && <small className="bb-badges">{p.gadgets.map((g) => <em key={g}>{BADGE[g]}</em>)}</small>}
              </span>
            );
          }} />
        <PlayerStrip snap={snap} send={send} seatId={top === 'white' ? 'black' : 'white'} toMove={playing && v?.turn !== top} receivedAt={receivedAt}
          extra={<span className="bb-money">${v?.dollars[top === 'white' ? 'black' : 'white'] ?? 0} <Clock v={v} side={top === 'white' ? 'black' : 'white'} receivedAt={receivedAt} /></span>} />
        <div className="bb-shop">
          <span className="note">{v?.shop === 'closed' ? 'The shop has shut' : v?.shop === 'soon' ? 'The shop opens shortly' : `Your dollars: $${mine ? v?.dollars[mine] ?? 0 : 0}`}</span>
          {v?.shop === 'open' && mine && GADGETS.map((g) => {
            const eligible = myTurn && !!v.board.some((p) => p?.side === mine && fits(g.id, p));
            return (
              <button key={g.id} className={`btn small${gadget === g.id ? ' primary' : ''}`} disabled={!eligible || v.dollars[mine] < g.cost}
                title={`${g.text} Put it on one of your ${g.who === 'any' ? 'pieces' : `${g.who}s`}, then move.`}
                onClick={() => pickGadget(g.id)}>
                {g.label} ${g.cost}
              </button>
            );
          })}
          {gadget && <span className="note">{buySquare === null ? `Click the ${gadgetInfo(gadget)?.who === 'any' ? 'piece' : gadgetInfo(gadget)?.who} this goes on, then move it` : `Now move the piece carrying ${gadgetInfo(gadget)?.label}`}</span>}
        </div>
        <GameActions snap={snap} send={send}>
          {playing && mine && v?.drawOfferBy === opp && (
            <>
              <span className="note">Draw offered</span>
              <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'accept_draw' } })}>Accept draw</button>
              <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'decline_draw' } })}>Decline</button>
            </>
          )}
          {playing && mine && v?.drawOfferBy !== opp && (
            <button className="btn small" disabled={v?.drawOfferBy === mine} onClick={() => send({ t: 'act', action: { type: 'offer_draw' } })}>
              {v?.drawOfferBy === mine ? 'Draw offered' : 'Offer draw'}
            </button>
          )}
          {!mine && <button className="btn small" onClick={() => setFlip((f) => !f)}>Flip board</button>}
        </GameActions>
      </div>
    </div>
  );
}

function MovesTab({ snap }: StageProps) {
  const v = snap.game.view as BountyView | null;
  if (!v?.log.length) return <p className="empty">No moves yet.</p>;
  return (
    <ol className="bb-log">
      {v.log.map((r, i) => (
        <li key={i}>
          <b>{r.seat}</b> {squareName(r.move.from)}–{squareName(r.move.to)}
          {r.move.via !== undefined && ` via ${squareName(r.move.via)}`}
          {r.move.pull !== undefined && ` pulls to ${squareName(r.move.pull)}`}
          {r.buy && ` · bought ${gadgetInfo(r.buy.gadget)?.label} ($${GADGETS.find((g) => g.id === r.buy!.gadget)?.cost})`}
          {r.captured && ` · +$${r.captured.value} for ${r.captured.kind}`}
          {r.vested && ' · vest blocked it'}
          {r.promoted && ' · promoted'}
        </li>
      ))}
    </ol>
  );
}

const TIMES = [
  { label: '3 min + 2 s', config: { initialSeconds: 180, incrementSeconds: 2, shopDelay: 0 } },
  { label: '5 min + 3 s', config: { initialSeconds: 300, incrementSeconds: 3, shopDelay: 0 } },
  { label: '10 min + 5 s', config: { initialSeconds: 600, incrementSeconds: 5, shopDelay: 0 } },
  { label: 'Shop after 4 moves each', config: { initialSeconds: 300, incrementSeconds: 3, shopDelay: 4 } },
  { label: 'No clock', config: { initialSeconds: 0, incrementSeconds: 0, shopDelay: 0 } },
];

function ConfigPicker({ value, onChange, disabled }: { value: unknown; onChange(v: unknown): void; disabled?: boolean }) {
  const c = (value ?? {}) as Partial<BountyConfig>;
  const key = TIMES.findIndex((t) => t.config.initialSeconds === c.initialSeconds
    && t.config.incrementSeconds === c.incrementSeconds && t.config.shopDelay === c.shopDelay);
  return (
    <select className="mini-select" aria-label="Clock and shop" disabled={disabled}
      value={key < 0 ? 1 : key} onChange={(e) => onChange(TIMES[Number(e.target.value)].config)}>
      {TIMES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
    </select>
  );
}

export const bountyBoardClient: GameClient = {
  id: 'bountyboard',
  Stage: BountyStage,
  tab: { label: 'Bounties', Component: MovesTab },
  ConfigPicker,
};
