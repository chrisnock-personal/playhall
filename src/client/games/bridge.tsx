import { COMPASS, SEATS, STRAINS, STRAIN_SIGN, callWords, contractWords, partnerOf, sideOf, type BridgeView, type Strain } from '../../shared/games/bridge';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card } from '../kit/cards';
import { Avatar } from '../ui';
import './cardtable.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const POS = ['bottom', 'left', 'top', 'right'] as const;
const callLabel = (c: string) => (c === 'P' ? 'Pass' : c === 'X' ? 'X' : c === 'XX' ? 'XX' : `${c[0]}${STRAIN_SIGN[c[1] as Strain]}`);
const red = (c: string) => c[1] === 'H' || c[1] === 'D';

function Auction({ v }: { v: BridgeView }) {
  // Four columns, North to West; the dealer's first call in its own column.
  const start = SEATS.indexOf(v.dealer);
  const cells: (string | null)[] = [...Array(start).fill(null), ...v.auction.map((a) => a.call)];
  return (
    <div className="br-auction" aria-label="The auction">
      {SEATS.map((p) => <span key={p} className="br-auction-head">{COMPASS[p][0]}{p === v.dealer ? '*' : ''}</span>)}
      {cells.map((c, i) => <span key={i} className={`br-call${c && red(c) && c.length === 2 ? ' red' : ''}`} title={c ? callWords(c) : ''}>{c ? callLabel(c) : ''}</span>)}
      {v.phase === 'auction' && <span className="br-call next">?</span>}
    </div>
  );
}

function BridgeStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as BridgeView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const start = me ? SEATS.indexOf(me) : 0;
  const around = SEATS.map((_, k) => SEATS[(start + k) % 4]);
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const myTurn = playing && !!v && !!me && v.actor === me;
  const playingFor = myTurn && v!.phase === 'play' ? v!.turn : null;
  const card = (p: string) => v?.trick.find((t) => t.seat === p)?.card;
  const side = (p: string) => (v ? (sideOf(p) === 'NS' ? 'NS' : 'EW') : 'NS');

  const handRow = (cards: string[], clickable: boolean, width: number) => (
    <div className="hand-row">
      {cards.map((c) => {
        const can = clickable && !!v?.legal.includes(c);
        return (
          <button key={c} className={`hand-card${can ? ' playable' : ''}`} disabled={!can} onClick={() => act(send, { type: 'play', card: c })}>
            <Card code={c} width={width} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="board-stage">
      <div className="felt hearts-felt">
        <div className="ht-table">
          {around.map((p, k) => {
            if (k === 0 && me) return null;
            const seat = snap.seats.find((s) => s.id === p);
            const isDummy = v?.dummy === p && !!v.dummyHand;
            return (
              <div key={p} className={`ht-seat ${POS[k]}${v?.turn === p ? ' to-move' : ''}${isDummy ? ' br-dummy' : ''}`}>
                <div className="spot-head"><Disc colour={p} size={16} />{seat?.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{name(p)} · {COMPASS[p]}{me && partnerOf(me) === p ? ' (partner)' : ''}{isDummy ? ' · dummy' : ''}</strong><MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} /></div>
                {isDummy
                  ? handRow(v!.dummyHand!, playingFor === p, 40)
                  : <div className="fan">{Array.from({ length: v?.counts[p] ?? 0 }, (_, i) => <span key={i} style={{ marginLeft: i ? -24 : 0 }}><Card code={null} width={30} /></span>)}</div>}
              </div>
            );
          })}
          <div className="ht-trick" aria-label="The trick">
            {around.map((p, k) => <div key={p} className={`ht-played ${POS[k]}`}>{card(p) ? <Card code={card(p)!} width={60} /> : null}</div>)}
            {v && v.phase === 'auction' && <div className="ht-last br-center"><Auction v={v} /></div>}
            {v && v.phase === 'play' && !v.trick.length && v.lastTrick && <div className="ht-last">Last trick: {name(v.lastTrick.winner)}</div>}
          </div>
        </div>

        {me && v?.hand && (
          <div className={`my-hand${myTurn ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your hand · {COMPASS[me]}{v.dummy === me ? ' (dummy: your partner plays it)' : ''}</strong>
              <span className="stack">{v.contract ? `${contractWords(v.contract)} · tricks: you ${v.tricks[side(me)]}, them ${v.tricks[side(me) === 'NS' ? 'EW' : 'NS']}` : `Deal ${v.deal} of 4 · ${v.vul.NS && v.vul.EW ? 'both' : v.vul.NS ? 'North-South' : v.vul.EW ? 'East-West' : 'nobody'} vulnerable`}</span>
              <MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            {handRow(v.hand, playingFor === me, 52)}
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={4}>
          {myTurn && v!.phase === 'auction' && (
            <span className="br-box" role="group" aria-label="Your call">
              {[1, 2, 3, 4, 5, 6, 7].map((l) => (
                <span key={l} className="br-level">
                  {STRAINS.map((s) => {
                    const c = `${l}${s}`;
                    return v!.calls.includes(c) ? <button key={c} className={`btn tiny br-bid${s === 'H' || s === 'D' ? ' red' : ''}`} title={callWords(c)} onClick={() => act(send, { type: 'call', call: c })}>{l}{STRAIN_SIGN[s]}</button> : null;
                  })}
                </span>
              )).filter((_, i) => v!.calls.some((c) => c[0] === String(i + 1)))}
              <span className="br-level">
                <button className="btn tiny primary" onClick={() => act(send, { type: 'call', call: 'P' })}>Pass</button>
                {v!.calls.includes('X') && <button className="btn tiny" onClick={() => act(send, { type: 'call', call: 'X' })}>Double</button>}
                {v!.calls.includes('XX') && <button className="btn tiny" onClick={() => act(send, { type: 'call', call: 'XX' })}>Redouble</button>}
              </span>
            </span>
          )}
          {v && v.phase === 'auction' && v.auction.length > 0 && <span className="note">Last call: {COMPASS[v.auction[v.auction.length - 1].seat]}, {callWords(v.auction[v.auction.length - 1].call)}</span>}
          {myTurn && v!.phase === 'play' && <span className="note">{v!.turn === me ? 'Your turn: play a card' : `Play a card from dummy (${COMPASS[v!.turn!]})`}</span>}
        </GameActions>
      </div>
    </div>
  );
}

function SheetTab({ snap }: StageProps) {
  const v = snap.game.view as BridgeView | null;
  if (!v) return <p className="empty">The score sheet appears when the game starts.</p>;
  return (
    <div className="tab-body">
      <table className="board-table ht-scores">
        <thead><tr><th className="l">Deal</th><th className="l">Contract</th><th>Tricks</th><th>N-S</th><th>E-W</th></tr></thead>
        <tbody>
          {v.sheet.map((d) => (
            <tr key={d.deal}><td className="l">{d.deal}</td><td className="l">{d.contract ? contractWords(d.contract) : 'Passed out'}</td><td>{d.tricks}</td><td>{d.NS || ''}</td><td>{d.EW || ''}</td></tr>
          ))}
          <tr className="br-total"><td className="l" colSpan={3}>Total</td><td className="pts">{v.scores.NS}</td><td className="pts">{v.scores.EW}</td></tr>
        </tbody>
      </table>
      <p className="muted small">Chicago: four deals. Deal {v.deal}: {v.vul.NS && v.vul.EW ? 'both sides' : v.vul.NS ? 'North-South' : v.vul.EW ? 'East-West' : 'nobody'} vulnerable. Hover a call to see what it means.</p>
      {v.sheet.length > 0 && (
        <details>
          <summary>The last deal’s hands</summary>
          <div className="br-hands">
            {SEATS.map((p) => <div key={p}><strong>{COMPASS[p]}</strong><div className="br-mini">{v.sheet[v.sheet.length - 1].hands[p].map((c) => <Card key={c} code={c} width={24} />)}</div></div>)}
          </div>
        </details>
      )}
    </div>
  );
}

export const bridgeClient: GameClient = {
  id: 'bridge',
  Stage: BridgeStage,
  tab: { label: 'Score sheet', Component: SheetTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as BridgeView | null;
    return v ? <span className="piece-count">{COMPASS[seatId]} · {v.scores[sideOf(seatId)]}</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">Four players in two pairs: North-South (Amber, Violet) against East-West (Teal, Rose). Bots can fill any seat. Chicago scoring, four deals.</p>,
};
