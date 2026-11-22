import { useState } from 'react';
import { bidWords, pairKey, type SpadesView } from '../../shared/games/spades';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card } from '../kit/cards';
import { Avatar } from '../ui';
import './cardtable.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const POS = ['bottom', 'left', 'top', 'right'] as const;

/** "Bid 3 · 1 taken", or "Nil · 0 taken", or "bidding…". */
function bidLine(v: SpadesView, p: string): string {
  const b = v.bids[p];
  if (b === null) return v.phase === 'bid' && v.turn === p ? 'bidding…' : 'to bid';
  return `${b === 0 ? 'Nil' : `Bid ${b}`} · ${v.tricks[p]} taken`;
}

function SpadesStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as SpadesView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [bid, setBid] = useState<number | null>(null);
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const start = me ? order.indexOf(me) : 0;
  const around = order.map((_, k) => order[(start + k) % order.length]);
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const myTurn = playing && !!v && v.turn === me;
  const bidding = myTurn && v!.phase === 'bid';
  const card = (p: string) => v?.trick.find((t) => t.seat === p)?.card;
  const partnerTag = (p: string) => (v && me && v.partner === p ? ' (partner)' : '');

  return (
    <div className="board-stage">
      <div className="felt hearts-felt">
        <div className="ht-table">
          {around.map((p, k) => {
            if (k === 0 && me) return null;
            const seat = snap.seats.find((s) => s.id === p);
            return (
              <div key={p} className={`ht-seat ${POS[k]}${v?.turn === p ? ' to-move' : ''}`}>
                <div className="spot-head"><Disc colour={p} size={16} />{seat?.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{name(p)}{partnerTag(p)}</strong><MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} /></div>
                <div className="fan">{Array.from({ length: Math.min(v?.counts[p] ?? 0, 13) }, (_, i) => <span key={i} style={{ marginLeft: i ? -24 : 0 }}><Card code={null} width={30} /></span>)}</div>
                <span className="stack">{v ? bidLine(v, p) : ''}{v?.dealer === p ? ' · dealer' : ''}</span>
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
          <div className={`my-hand${myTurn ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your hand</strong>
              <span className="stack">{bidLine(v, me)}{v.dealer === me ? ' · dealer' : ''}</span>
              <MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            <div className="hand-row">
              {v.cards.map((c) => {
                const canPlayIt = myTurn && v.legal.includes(c);
                return (
                  <button key={c} className={`hand-card${canPlayIt ? ' playable' : ''}`} disabled={!canPlayIt}
                    onClick={() => act(send, { type: 'play', card: c })}>
                    <Card code={c} width={54} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={4}>
          {bidding && (
            <span className="sp-bids" role="group" aria-label="Your bid">
              {Array.from({ length: 14 }, (_, n) => (
                <button key={n} className={`btn small${bid === n ? ' primary' : ''}`} onClick={() => setBid(n)}>{n === 0 ? 'Nil' : n}</button>
              ))}
              <button className="btn small primary" disabled={bid === null} onClick={() => { act(send, { type: 'bid', bid }); setBid(null); }}>
                {bid === null ? 'Pick a bid' : `Bid ${bidWords(bid)}`}
              </button>
            </span>
          )}
          {v && v.phase === 'bid' && !bidding && <span className="note">Hand {v.hand}: bidding{v.turn ? `, ${name(v.turn)} next` : ''}</span>}
          {myTurn && v!.phase === 'play' && <span className="note">Your turn: {v!.trick.length ? 'follow suit if you can' : 'lead a card'}{!v!.broken ? ' · spades not broken yet' : ''}</span>}
        </GameActions>
      </div>
    </div>
  );
}

function ScoresTab({ snap }: StageProps) {
  const v = snap.game.view as SpadesView | null;
  if (!v) return <p className="empty">The scores appear when the game starts.</p>;
  const name = (p: string) => snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p;
  return (
    <div className="tab-body">
      <table className="board-table ht-scores">
        <thead><tr><th className="l">Pair</th><th>Bid</th><th>Won</th><th>Score</th></tr></thead>
        <tbody>
          {v.pairs.map((pair) => {
            const k = pairKey(v.pairs, pair[0]);
            const bids = pair.map((p) => v.bids[p]);
            return (
              <tr key={k}>
                <td className="l">{pair.map((p) => <div key={p}><Disc colour={p} size={14} /> {name(p)}</div>)}</td>
                <td>{bids.includes(null) ? '–' : bids.map((b) => bidWords(b!)).join(' + ')}</td>
                <td>{pair.reduce((n, p) => n + v.tricks[p], 0)}</td>
                <td className="pts">{v.scores[k]}<div className="muted small">{v.bags[k]} bag{v.bags[k] === 1 ? '' : 's'}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {v.lastHand && <p className="muted small">Last hand: {v.pairs.map((pair) => `${pair.map(name).join(' & ')} ${v.lastHand!.points[pair[0]] >= 0 ? '+' : ''}${v.lastHand!.points[pair[0]]} (${v.lastHand!.notes[pair[0]] || 'no contract'})`).join('; ')}.</p>}
      <p className="muted small">Hand {v.hand}. The first pair to 500 wins; every 10 bags cost 100.</p>
    </div>
  );
}

export const spadesClient: GameClient = {
  id: 'spades',
  Stage: SpadesStage,
  tab: { label: 'Scores', Component: ScoresTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as SpadesView | null;
    if (!v || !v.order.includes(seatId)) return <Disc colour={seatId} size={20} />;
    return <span className="piece-count">{v.scores[pairKey(v.pairs, seatId)]} pts</span>;
  },
  ConfigPicker: () => <p className="hint">Four players in two pairs: partners sit across (Amber with Violet, Teal with Rose). Bots can fill seats. First pair to 500.</p>,
};
