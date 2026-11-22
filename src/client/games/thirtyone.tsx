import { handScore, scoreWords, type ThirtyOneView } from '../../shared/games/thirtyone';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card, Deck } from '../kit/cards';
import { Avatar } from '../ui';
import './cardtable.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

/** Lives as tokens: full for each one left, faded for each one lost. */
function Lives({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="to-lives" aria-label={`${n} ${n === 1 ? 'life' : 'lives'} left`}>
      {Array.from({ length: of }, (_, i) => <span key={i} className={i < n ? 'on' : ''}>●</span>)}
    </span>
  );
}

function ThirtyOneStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as ThirtyOneView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.cards ? v.you : null;
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const others = order.filter((p) => p !== v?.you);
  const name = (p: string) => (p === v?.you ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const myTurn = playing && !!v && !!me && v.turn === me;
  const drawing = myTurn && v!.phase === 'draw';
  const discarding = myTurn && v!.phase === 'discard';
  const isOut = (p: string) => !!v && v.lives[p] <= 0;
  const shown = v?.lastRound;

  return (
    <div className="board-stage">
      <div className="felt sh-felt">
        <div className="opponents">
          {others.map((p) => {
            const seat = snap.seats.find((s) => s.id === p);
            return (
              <div key={p} className={`opponent${v?.turn === p ? ' to-move' : ''}${isOut(p) ? ' out' : ''}`}>
                <div className="spot-head"><Disc colour={p} size={16} />{seat?.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{name(p)}</strong><MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} /></div>
                {v && (isOut(p) ? <span className="stack">Out</span> : <>
                  <div className="fan">{Array.from({ length: v.counts[p] }, (_, i) => <span key={i} style={{ marginLeft: i ? -20 : 0 }}><Card code={null} width={34} /></span>)}</div>
                  <span className="stack"><Lives n={v.lives[p]} />{v.knocker === p ? ' · knocked' : ''}{v.dealer === p ? ' · dealer' : ''}</span>
                </>)}
              </div>
            );
          })}
        </div>

        <div className="piles">
          <button className="pile to-pile" disabled={!drawing} onClick={() => act(send, { type: 'draw', from: 'deck' })} aria-label="Take from the deck">
            <Deck width={64} name="deck" /><span className="stack">{v?.deckCount ?? 0} left</span>
          </button>
          <button className="pile to-pile" disabled={!drawing || !v?.discardTop} onClick={() => act(send, { type: 'draw', from: 'discard' })} aria-label="Take the top discard">
            {v?.discardTop ? <Card code={v.discardTop} width={64} /> : <span className="sh-empty">Empty</span>}
            <span className="stack">Discard</span>
          </button>
        </div>

        {shown && (
          <div className="to-showdown" aria-label="The last round">
            <strong>Round {v!.round - (v!.result ? 0 : 1)}: {shown.why}</strong>
            <div className="to-hands">
              {Object.entries(shown.hands).map(([p, cards]) => (
                <span key={p} className={`to-hand${shown.losers.includes(p) ? ' lost' : ''}`}>
                  <Disc colour={p} size={12} /> {name(p)} {scoreWords(shown.scores[p])}
                  <span className="to-cards">{cards.map((c) => <Card key={c} code={c} width={26} />)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {me && v?.cards && (
          <div className={`my-hand${myTurn ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your hand: {scoreWords(handScore(v.cards))}</strong>
              <span className="stack"><Lives n={v.lives[me]} />{v.dealer === me ? ' · dealer' : ''}</span>
              <MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            <div className="hand-row">
              {v.cards.map((c) => (
                <button key={c} className={`hand-card${discarding && c !== v.took ? ' playable' : ''}`} disabled={!discarding || c === v.took}
                  onClick={() => act(send, { type: 'discard', card: c })}>
                  <Card code={c} width={64} highlight={c === v.took} />
                </button>
              ))}
            </div>
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={2}>
          {v?.canKnock && <button className="btn small primary" onClick={() => act(send, { type: 'knock' })}>Knock</button>}
          {drawing && <span className="note">Your turn: take from the deck or the discard{v!.canKnock ? ', or knock' : ''}</span>}
          {discarding && <span className="note">Throw one card away{v!.took ? ' (not the one you just took)' : ''}</span>}
          {v?.knocker && !myTurn && <span className="note">{name(v.knocker)} knocked: last turns</span>}
        </GameActions>
      </div>
    </div>
  );
}

export const thirtyOneClient: GameClient = {
  id: 'thirtyone',
  Stage: ThirtyOneStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as ThirtyOneView | null;
    return v && seatId in v.lives ? <Lives n={v.lives[seatId]} /> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">2-8 players (bots can fill seats), three lives each. Get the highest total in one suit; knock when you’re ahead.</p>,
};
