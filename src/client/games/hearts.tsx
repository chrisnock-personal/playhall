import { useEffect, useState } from 'react';
import { passTarget, type HeartsView } from '../../shared/games/hearts';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card } from '../kit/cards';
import { Avatar } from '../ui';
import './cardtable.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const POS = ['bottom', 'left', 'top', 'right'] as const;

function HeartsStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as HeartsView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { setPicked([]); }, [v?.hand, v?.phase]);
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  // You at the bottom; the others round the table in play order (left, across, right).
  const start = me ? order.indexOf(me) : 0;
  const around = order.map((_, k) => order[(start + k) % order.length]);
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const myTurn = playing && !!v && v.turn === me;
  const passing = v?.phase === 'pass' && !!me && !v.yourPass;
  const card = (p: string) => v?.trick.find((t) => t.seat === p)?.card;

  return (
    <div className="board-stage">
      <div className="felt hearts-felt">
        <div className="ht-table">
          {around.map((p, k) => {
            if (k === 0 && me) return null;
            const seat = snap.seats.find((s) => s.id === p);
            return (
              <div key={p} className={`ht-seat ${POS[k]}${v?.turn === p ? ' to-move' : ''}`}>
                <div className="spot-head"><Disc colour={p} size={16} />{seat?.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{name(p)}</strong><MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} /></div>
                <div className="fan">{Array.from({ length: Math.min(v?.counts[p] ?? 0, 13) }, (_, i) => <span key={i} style={{ marginLeft: i ? -24 : 0 }}><Card code={null} width={30} /></span>)}</div>
                <span className="stack">{v ? `${v.handPoints[p]} this hand · ${v.scores[p]} total` : ''}{v?.phase === 'pass' && v.passed.includes(p) ? ' · passed' : ''}</span>
              </div>
            );
          })}
          <div className="ht-trick" aria-label="The trick">
            {around.map((p, k) => <div key={p} className={`ht-played ${POS[k]}`}>{card(p) ? <Card code={card(p)!} width={60} /> : null}</div>)}
            {v && !v.trick.length && v.phase === 'play' && v.lastTrick && (
              <div className="ht-last">Last trick: {name(v.lastTrick.winner)}</div>
            )}
          </div>
        </div>

        {me && v?.cards && (
          <div className={`my-hand${myTurn || passing ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your hand</strong>
              <span className="stack">{v.handPoints[me]} this hand · {v.scores[me]} total</span>
              <MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            <div className="hand-row">
              {v.cards.map((c) => {
                const canPlayIt = myTurn && v.legal.includes(c);
                const on = picked.includes(c) || v.yourPass?.includes(c);
                return (
                  <button key={c} className={`hand-card${on ? ' picked' : ''}${canPlayIt ? ' playable' : ''}`}
                    disabled={!(passing || canPlayIt)}
                    onClick={() => (passing
                      ? setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length < 3 ? [...p, c] : p))
                      : act(send, { type: 'play', card: c }))}>
                    <Card code={c} width={54} highlight={on} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={4}>
          {v && v.phase === 'pass' && <span className="note">Hand {v.hand}: pass three cards {v.pass}{me ? ` (to ${name(passTarget(v.order, me, v.pass))})` : ''}</span>}
          {passing && <button className="btn small primary" disabled={picked.length !== 3} onClick={() => act(send, { type: 'pass', cards: picked })}>{picked.length === 3 ? 'Pass these three' : `Pick ${3 - picked.length} more`}</button>}
          {v?.phase === 'pass' && v.yourPass && <span className="note">Passed: waiting for the others</span>}
          {myTurn && <span className="note">Your turn: {v!.trick.length ? 'follow suit if you can' : v!.legal.includes('2C') && v!.legal.length === 1 ? 'lead the 2 of clubs' : 'lead a card'}{!v!.broken ? ' · hearts not broken yet' : ''}</span>}
        </GameActions>
      </div>
    </div>
  );
}

function ScoresTab({ snap }: StageProps) {
  const v = snap.game.view as HeartsView | null;
  if (!v) return <p className="empty">The scores appear when the game starts.</p>;
  const name = (p: string) => snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p;
  return (
    <div className="tab-body">
      <table className="board-table ht-scores">
        <thead><tr><th className="l">Player</th><th>This hand</th><th>Last hand</th><th>Total</th></tr></thead>
        <tbody>
          {[...v.order].sort((a, b) => v.scores[a] - v.scores[b]).map((p) => (
            <tr key={p}><td className="l"><Disc colour={p} size={14} /> {name(p)}</td><td>{v.handPoints[p]}</td><td>{v.lastHand ? v.lastHand.points[p] : '–'}</td><td className="pts">{v.scores[p]}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Hand {v.hand}. First to 100 ends the game; the lowest total wins.{v.lastHand?.moon ? ` ${name(v.lastHand.moon)} shot the moon last hand!` : ''}</p>
    </div>
  );
}

export const heartsClient: GameClient = {
  id: 'hearts',
  Stage: HeartsStage,
  tab: { label: 'Scores', Component: ScoresTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as HeartsView | null;
    return v && seatId in v.scores ? <span className="piece-count">{v.scores[seatId]} pts</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">Four players (bots can fill seats). Pass three, avoid hearts and the queen of spades; first to 100 ends it.</p>,
};
