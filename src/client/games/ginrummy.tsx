import { useEffect, useState } from 'react';
import { TARGET, type GinView, type HandOutcome } from '../../shared/games/ginrummy';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card, Deck } from '../kit/cards';
import { Avatar } from '../ui';
import './cardtable.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

/** Melds side by side, then the deadwood, as small cards. */
function Arranged({ melds, deadwood, laid = [], width = 26 }: { melds: string[][]; deadwood: string[]; laid?: string[]; width?: number }) {
  return (
    <span className="gr-arranged">
      {melds.map((m, i) => <span key={i} className="gr-meld">{m.map((c) => <span key={c} className={laid.includes(c) ? 'gr-laid' : ''}><Card code={c} width={width} /></span>)}</span>)}
      {deadwood.length > 0 && <span className="gr-dead">{deadwood.map((c) => <Card key={c} code={c} width={width} />)}</span>}
    </span>
  );
}

function outcomeWords(h: HandOutcome, name: (p: string) => string): string {
  if (h.kind === 'draw') return 'The last hand was a draw: the deck ran low';
  const w = name(h.winner!);
  if (h.kind === 'gin') return `${w} went gin: +${h.points}`;
  if (h.kind === 'undercut') return `${w} undercut ${name(h.knocker!)}’s knock: +${h.points}`;
  return `${w} knocked and won the hand: +${h.points}`;
}

function GinStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as GinView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [v?.cards?.length, v?.phase]);
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const them = order.find((p) => p !== me) ?? order[1];
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const myTurn = playing && !!v && !!me && v.turn === me;
  const drawing = myTurn && v!.phase === 'draw';
  const discarding = myTurn && v!.phase === 'discard';
  const seat = snap.seats.find((s) => s.id === them);
  const last = v?.lastHand;

  return (
    <div className="board-stage">
      <div className="felt gr-felt">
        {them && (
          <div className={`opponent${v?.turn === them ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={them} size={16} />{seat?.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{name(them)}</strong><MoveTimer snap={snap} seatId={them} receivedAt={receivedAt} /></div>
            <div className="fan">{Array.from({ length: v?.counts[them] ?? 0 }, (_, i) => <span key={i} style={{ marginLeft: i ? -22 : 0 }}><Card code={null} width={34} /></span>)}</div>
            {v && <span className="stack">{v.scores[them]} points · {v.handsWon[them]} hands won{v.dealer === them ? ' · dealer' : ''}</span>}
          </div>
        )}

        <div className="piles">
          <button className="pile to-pile" disabled={!drawing} onClick={() => act(send, { type: 'draw', from: 'deck' })} aria-label="Take from the deck">
            <Deck width={64} name="deck" /><span className="stack">{v?.deckCount ?? 0} left</span>
          </button>
          <button className="pile to-pile" disabled={!drawing || !v?.discardTop} onClick={() => act(send, { type: 'draw', from: 'discard' })} aria-label="Take the top discard">
            {v?.discardTop ? <Card code={v.discardTop} width={64} /> : <span className="sh-empty">Empty</span>}
            <span className="stack">Discard</span>
          </button>
        </div>

        {last && (
          <div className="to-showdown" aria-label="The last hand">
            <strong>Hand {v!.hand - (v!.result ? 0 : 1)}: {outcomeWords(last, name)}</strong>
            {Object.entries(last.shown).map(([p, x]) => (
              <span key={p} className="to-hand"><Disc colour={p} size={12} /> {name(p)}: {x.points} deadwood{x.laid.length ? `, laid off ${x.laid.length}` : ''}
                <Arranged melds={x.melds} deadwood={x.deadwood} laid={x.laid} /></span>
            ))}
          </div>
        )}

        {me && v?.cards && (
          <div className={`my-hand${myTurn ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your hand: {v.deadwoodPoints} deadwood</strong>
              <span className="stack">{v.scores[me]} points · {v.handsWon[me]} hands won{v.dealer === me ? ' · dealer' : ''}</span>
              <MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            <div className="gr-hand">
              {[...v.melds, v.deadwood].map((group, gi) => group.length > 0 && (
                <div key={gi} className={gi < v.melds.length ? 'gr-group meld' : 'gr-group dead'}>
                  <span className="gr-label">{gi < v.melds.length ? 'Meld' : 'Deadwood'}</span>
                  <div className="hand-row">
                    {group.map((c) => {
                      const can = discarding && c !== v.took;
                      return (
                        <button key={c} className={`hand-card${picked === c ? ' picked' : ''}${can ? ' playable' : ''}`} disabled={!can}
                          onClick={() => setPicked(picked === c ? null : c)}>
                          <Card code={c} width={54} highlight={picked === c || c === v.took} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={2}>
          {discarding && (
            <>
              <button className="btn small primary" disabled={!picked} onClick={() => act(send, { type: 'discard', card: picked })}>Throw away</button>
              <button className="btn small" disabled={!picked || !v!.knockWith.includes(picked)} onClick={() => act(send, { type: 'discard', card: picked, knock: true })}>
                {picked && v!.knockWith.includes(picked) ? 'Throw it and knock' : 'Knock'}
              </button>
              <span className="note">{v!.knockWith.length ? 'You can knock: pick the card to throw away' : 'Pick a card to throw away'}{v!.took ? ' (not the one you just took)' : ''}</span>
            </>
          )}
          {drawing && <span className="note">Your turn: take from the deck or the discard</span>}
          {playing && !myTurn && <span className="note">First to {TARGET}</span>}
        </GameActions>
      </div>
    </div>
  );
}

export const ginRummyClient: GameClient = {
  id: 'ginrummy',
  Stage: GinStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as GinView | null;
    return v && seatId in v.scores ? <span className="piece-count">{v.scores[seatId]} pts</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">Two players (a bot can take the other seat). Runs and sets, knock at 10 or less, gin for a bonus; first to 100.</p>,
};
