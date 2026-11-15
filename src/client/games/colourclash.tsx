import { useState } from 'react';
import { COLOURS, cardLabel, playable, type ClashCard, type ClashView, type Colour } from '../../shared/games/colourclash';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card, ClashCardArt } from '../kit/cards';
import { Avatar } from '../ui';

function ClashStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as ClashView | null;
  const playing = snap.game.status === 'playing';
  const me = snap.you.seat;
  const myTurn = playing && !!me && v?.turn === me;
  const [choosing, setChoosing] = useState<ClashCard | null>(null);
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const others = order.filter((p) => p !== me);
  const top = v?.top;
  const canPlay = (card: ClashCard) => myTurn && !!top && (v!.drawn === null || card.id === v!.drawn) && playable(card, top, v!.colour);

  const play = (card: ClashCard) => {
    if (!canPlay(card)) return;
    if (card.colour === 'wild') { setChoosing(card); return; }
    send({ t: 'act', action: { type: 'play', card: card.id } });
  };

  return (
    <div className="board-stage">
      <div className="felt clash">
        <div className="opponents">
          {others.map((p) => {
            const seat = snap.seats.find((s) => s.id === p)!;
            const n = v?.counts[p] ?? 0;
            return (
              <div key={p} className={`opponent${v?.turn === p ? ' to-move' : ''}`}>
                <div className="spot-head"><Disc colour={p} size={16} />{seat.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{seat.name ?? KIT[p].label}</strong><MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} /></div>
                <div className="fan" aria-label={`${n} cards`}>{Array.from({ length: Math.min(n, 12) }, (_, i) => <span key={i} style={{ marginLeft: i ? -26 : 0 }}><Card code={null} width={34} /></span>)}</div>
                <span className="stack">{n} {n === 1 ? 'card: last one!' : 'cards'}</span>
              </div>
            );
          })}
        </div>
        <div className="piles">
          <button className="pile" disabled={!myTurn || v?.drawn !== null} onClick={() => send({ t: 'act', action: { type: 'draw' } })} aria-label="Draw a card">
            <Card code={null} width={74} />
            <span className="stack">{v?.drawLeft ?? 0} left</span>
          </button>
          <div className="pile">
            {top ? <ClashCardArt colour={top.colour} value={top.value} width={92} /> : <Card code={null} width={74} />}
            {v && <span className="in-play"><Disc colour={v.colour} size={18} /> {KIT[v.colour].label} · {v.dir === 1 ? 'clockwise' : 'anticlockwise'}</span>}
          </div>
        </div>
        {me && v?.hand && (
          <div className={`my-hand${myTurn ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your hand ({v.hand.length})</strong><MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            <div className="hand-row">
              {v.hand.map((card) => (
                <button key={card.id} className="hand-card" disabled={!canPlay(card)} onClick={() => play(card)} aria-label={`Play ${cardLabel(card)}`}>
                  <ClashCardArt colour={card.colour} value={card.value} width={58} raised={canPlay(card)} dim={myTurn && !canPlay(card)} />
                </button>
              ))}
            </div>
          </div>
        )}
        {choosing && (
          <div className="colour-pick" role="dialog" aria-label="Choose a colour">
            <strong>Choose a colour</strong>
            <div className="row">
              {COLOURS.map((col: Colour) => (
                <button key={col} className="btn small" onClick={() => { send({ t: 'act', action: { type: 'play', card: choosing.id, colour: col } }); setChoosing(null); }}>
                  <Disc colour={col} size={18} /> {KIT[col].label}
                </button>
              ))}
              <button className="btn small" onClick={() => setChoosing(null)}>Cancel</button>
            </div>
          </div>
        )}
        <GameActions snap={snap} send={send}>
          {myTurn && v?.drawn === null && <span className="note">Your turn: play a card that matches, or draw</span>}
          {myTurn && v?.drawn !== null && (
            <><span className="note">The card you drew fits: play it, or</span><button className="btn small" onClick={() => send({ t: 'act', action: { type: 'pass' } })}>Keep it</button></>
          )}
          {v?.log.length ? <span className="note">{KIT[v.log[v.log.length - 1].seat].label} {v.log[v.log.length - 1].text}</span> : null}
        </GameActions>
      </div>
    </div>
  );
}

function LogTab({ snap }: StageProps) {
  const v = snap.game.view as ClashView | null;
  if (!v?.log.length) return <p className="empty">Nothing played yet.</p>;
  return (
    <ol className="moves four-moves">
      {[...v.log].reverse().map((l, i) => <li key={i}><span className="n" /><Disc colour={l.seat} size={16} /><span>{l.text}</span></li>)}
    </ol>
  );
}

export const colourClashClient: GameClient = {
  id: 'colourclash',
  Stage: ClashStage,
  tab: { label: 'Plays', Component: LogTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as ClashView | null;
    return v && seatId in v.counts ? <span className="piece-count">{v.counts[seatId]} {v.counts[seatId] === 1 ? 'card' : 'cards'}</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">2-4 players, 7 cards each, Playhall’s own 108-card deck.</p>,
};
