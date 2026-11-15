import { useEffect, useState } from 'react';
import type { PokerView } from '../../shared/games/poker';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card, Chip } from '../kit/cards';
import { Avatar } from '../ui';

function PokerStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as PokerView | null;
  const playing = snap.game.status === 'playing';
  const me = snap.you.seat;
  const myTurn = playing && !!v && v.toAct === me;
  const myMax = v && me ? v.chips[me] + v.bet[me] : 0;
  const [raiseTo, setRaiseTo] = useState(0);
  useEffect(() => { if (v) setRaiseTo(Math.min(myMax, v.minRaiseTo)); }, [v?.minRaiseTo, myMax, v?.toAct]);
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const shown = v?.last?.shown ?? {};
  const winnersLast = v?.last?.winners ?? [];

  return (
    <div className="board-stage">
      <div className="felt poker">
        <div className="felt-top">
          <span className="muted">{v ? `Hand ${v.hand} · blinds ${v.blinds[0]}/${v.blinds[1]}` : 'Texas Hold’em'}</span>
          <span className="muted">Play chips only</span>
        </div>
        <div className="dealer">
          <div className="hand">{[0, 1, 2, 3, 4].map((i) => (v?.board[i] ? <Card key={i} code={v.board[i]} width={56} /> : <span key={i} className="card-slot" />))}</div>
          {v && <span className="pot"><Chip amount={v.pot} size={30} /> Pot {v.pot.toLocaleString()}</span>}
          {winnersLast.length > 0 && (
            <p className="last-hand">Last hand: {winnersLast.map((w) => `${COLOURS[w.seat].label} won ${w.amount}${w.hand ? ` with ${w.hand.toLowerCase()}` : ''}`).join(' · ')}</p>
          )}
        </div>
        <div className="spots" style={{ gridTemplateColumns: `repeat(${Math.max(order.length, 1)}, minmax(0, 1fr))` }}>
          {order.map((p) => {
            const seat = snap.seats.find((s) => s.id === p)!;
            const out = v?.out.includes(p);
            const cards = p === me && v?.hole ? v.hole : shown[p] ?? null;
            const inHand = v?.inHand[p];
            return (
              <div key={p} className={`spot${v?.toAct === p ? ' to-move' : ''}${p === me ? ' mine' : ''}${out || (v && !inHand) ? ' out' : ''}`}>
                <div className="spot-head">
                  <Disc colour={p} size={18} />
                  {seat.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={24} />}
                  <strong>{seat.name ?? COLOURS[p].label}</strong>
                  {v?.dealer === p && <span className="button-chip" title="Dealer button">D</span>}
                  <MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} />
                </div>
                <div className="hand small">
                  {out ? null : cards ? cards.map((c, i) => <Card key={i} code={c} width={46} />) : inHand ? [0, 1].map((i) => <Card key={i} code={null} width={46} />) : null}
                </div>
                <div className="spot-foot">
                  <span>{out ? 'Out' : v?.folded[p] ? 'Folded' : v && v.chips[p] === 0 && inHand ? 'All in' : ''}</span>
                  <span className="bet">{v && v.bet[p] > 0 ? <Chip amount={v.bet[p]} size={26} /> : ''}</span>
                </div>
                <div className="stack">{v ? `${v.chips[p].toLocaleString()} chips` : ''}</div>
              </div>
            );
          })}
        </div>
        <GameActions snap={snap} send={send}>
          {myTurn && v && (
            <div className="bet-row">
              <button className="btn small danger" onClick={() => send({ t: 'act', action: { type: 'fold' } })}>Fold</button>
              {v.toCall > 0
                ? <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'call' } })}>Call {Math.min(v.toCall, v.chips[me!])}</button>
                : <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'check' } })}>Check</button>}
              {v.canRaise && myMax > v.minRaiseTo && (
                <>
                  <label className="sr-only" htmlFor="raise">Raise to</label>
                  <input id="raise" type="range" min={v.minRaiseTo} max={myMax} step={v.blinds[1] / 2} value={raiseTo} onChange={(e) => setRaiseTo(Number(e.target.value))} />
                  <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'raise', to: raiseTo } })}>{v.toCall > 0 || Object.values(v.bet).some((b) => b > 0) ? 'Raise to' : 'Bet'} {raiseTo}</button>
                </>
              )}
              {(v.canRaise || myMax <= v.bet[me!] + v.toCall) && <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'allin' } })}>All in ({myMax})</button>}
              {!v.canRaise && <span className="muted small">The all-in was short of a full raise: call or fold.</span>}
            </div>
          )}
        </GameActions>
      </div>
    </div>
  );
}

function LogTab({ snap }: StageProps) {
  const v = snap.game.view as PokerView | null;
  if (!v?.log.length) return <p className="empty">Nothing yet.</p>;
  return (
    <ol className="moves four-moves">
      {[...v.log].reverse().map((l, i) => <li key={i}><span className="n" /><Disc colour={l.seat} size={16} /><span>{l.text}</span></li>)}
    </ol>
  );
}

export const pokerClient: GameClient = {
  id: 'poker',
  Stage: PokerStage,
  tab: { label: 'Log', Component: LogTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as PokerView | null;
    return v && seatId in v.chips ? <span className="piece-count">{v.chips[seatId].toLocaleString()}</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: ({ value, onChange, disabled }) => {
    const c = (value ?? {}) as { startChips?: number; blindEvery?: number };
    return (
      <>
        <label className="field"><span>Starting chips</span>
          <select value={c.startChips ?? 1500} disabled={disabled} onChange={(e) => onChange({ ...c, startChips: Number(e.target.value) })}>
            {[1000, 1500, 3000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
          </select>
        </label>
        <label className="field"><span>Blinds double every</span>
          <select value={c.blindEvery ?? 5} disabled={disabled} onChange={(e) => onChange({ ...c, blindEvery: Number(e.target.value) })}>
            {[3, 5, 8].map((n) => <option key={n} value={n}>{n} hands</option>)}
          </select>
        </label>
      </>
    );
  },
};
