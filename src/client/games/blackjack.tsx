import { useEffect, useState } from 'react';
import { handValue, MIN_BET, type BlackjackView } from '../../shared/games/blackjack';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card, Chip } from '../kit/cards';
import { Avatar } from '../ui';

const WORD: Record<string, string> = { stand: 'Stands', bust: 'Bust', blackjack: 'Blackjack!', double: 'Doubled' };

function BlackjackStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as BlackjackView | null;
  const playing = snap.game.status === 'playing';
  const me = snap.you.seat;
  const [bet, setBet] = useState(50);
  const myChips = me && v ? v.chips[me] : 0;
  useEffect(() => { if (myChips && bet > myChips) setBet(Math.max(MIN_BET, myChips)); }, [myChips, bet]);
  const betting = playing && v?.phase === 'betting' && !!me && v.bets[me] === null && myChips >= MIN_BET;
  const myTurn = playing && v?.phase === 'playing' && v.turn === me;
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const dealerShown = (v?.dealer ?? []).filter((c): c is string => !!c);
  const dealerTotal = dealerShown.length ? handValue(dealerShown).total : null;

  return (
    <div className="board-stage">
      <div className="felt">
        <div className="felt-top">
          <span className="muted">{v ? `Hand ${v.hand} of ${v.hands}` : 'Blackjack'}</span>
          <span className="muted">Dealer stands on 17 · Blackjack pays 3 to 2</span>
        </div>
        <div className="dealer">
          <span className="label">Dealer{dealerTotal !== null && v?.phase === 'playing' ? ` · ${v.dealer.includes(null) ? `${dealerTotal} showing` : dealerTotal}` : ''}</span>
          <div className="hand">
            {(v?.dealer.length ? v.dealer : [null, null]).map((c, i) => <Card key={i} code={v?.dealer.length ? c : null} />)}
          </div>
          {v?.last && v.phase === 'betting' && (
            <p className="last-hand">
              Last hand: dealer {handValue(v.last.dealer).total > 21 ? 'bust' : handValue(v.last.dealer).total}.{' '}
              {order.filter((p) => p in v.last!.deltas).map((p) => `${COLOURS[p].label} ${v.last!.deltas[p] > 0 ? '+' : ''}${v.last!.deltas[p]}`).join(' · ')}
            </p>
          )}
        </div>
        <div className="spots" style={{ gridTemplateColumns: `repeat(${Math.max(order.length, 1)}, minmax(0, 1fr))` }}>
          {order.map((p) => {
            const seat = snap.seats.find((s) => s.id === p)!;
            const cards = v?.cards[p] ?? [];
            const total = cards.length ? handValue(cards).total : null;
            const status = v?.done[p];
            const out = v && v.chips[p] < MIN_BET;
            return (
              <div key={p} className={`spot${v?.turn === p ? ' to-move' : ''}${p === me ? ' mine' : ''}${out ? ' out' : ''}`}>
                <div className="spot-head">
                  <Disc colour={p} size={18} />
                  {seat.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={24} />}
                  <strong>{seat.name ?? COLOURS[p].label}</strong>
                  <MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} />
                </div>
                <div className="hand small">{cards.map((c, i) => <Card key={i} code={c} width={46} />)}</div>
                <div className="spot-foot">
                  <span>{total !== null ? total : ''}{status ? ` · ${WORD[status] ?? status}` : ''}</span>
                  <span className="bet">{v?.bets[p] ? <><Chip amount={v.bets[p]!} size={26} /></> : v?.phase === 'betting' && !out ? 'betting…' : ''}</span>
                </div>
                <div className="stack">{v ? (out ? 'out of chips' : `${v.chips[p].toLocaleString()} chips`) : ''}</div>
              </div>
            );
          })}
        </div>
        <GameActions snap={snap} send={send} minPlayers={1}>
          {betting && (
            <div className="bet-row">
              {[10, 25, 100, 500].filter((c) => c <= myChips).map((c) => (
                <button key={c} className="chip-btn" aria-label={`Add ${c}`} onClick={() => setBet((b) => Math.min(myChips, b + c))}>
                  <Chip amount={c} size={36} />
                </button>
              ))}
              <button className="btn tiny" onClick={() => setBet(MIN_BET)}>Clear</button>
              <label className="sr-only" htmlFor="bet">Bet</label>
              <input id="bet" type="number" min={MIN_BET} max={myChips} step={5} value={bet} onChange={(e) => setBet(Number(e.target.value))} />
              <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'bet', amount: bet } })}>Bet {bet}</button>
            </div>
          )}
          {myTurn && v && (
            <>
              <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'hit' } })}>Hit</button>
              <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'stand' } })}>Stand</button>
              {v.cards[me!].length === 2 && v.chips[me!] >= (v.bets[me!] ?? 0) * 2 && (
                <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'double' } })}>Double</button>
              )}
            </>
          )}
          {playing && v?.phase === 'betting' && me && v.bets[me] !== null && <span className="note">Waiting for the other bets</span>}
        </GameActions>
      </div>
    </div>
  );
}

function ChipsTab({ snap }: StageProps) {
  const v = snap.game.view as BlackjackView | null;
  if (!v) return <p className="empty">The session hasn’t started.</p>;
  return (
    <ol className="moves four-moves">
      {[...v.order].sort((a, b) => v.chips[b] - v.chips[a]).map((p, i) => (
        <li key={p}><span className="n">{i + 1}.</span><Disc colour={p} size={16} /><span>{COLOURS[p].label}: {v.chips[p].toLocaleString()}</span></li>
      ))}
    </ol>
  );
}

export const blackjackClient: GameClient = {
  id: 'blackjack',
  Stage: BlackjackStage,
  tab: { label: 'Chips', Component: ChipsTab },
  seatExtra: (_props, seatId) => <Disc colour={seatId} size={20} />,
  ConfigPicker: ({ value, onChange, disabled }) => (
    <label className="field"><span>Hands in a session</span>
      <select value={(value as { hands?: number })?.hands ?? 10} disabled={disabled} onChange={(e) => onChange({ hands: Number(e.target.value) })}>
        {[5, 10, 20].map((h) => <option key={h} value={h}>{h} hands</option>)}
      </select>
    </label>
  ),
};
