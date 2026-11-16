import { useEffect, useState } from 'react';
import { canPlay, rankName, rankOf, type PoopView } from '../../shared/games/poophead';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import { Card, Deck } from '../kit/cards';
import { Avatar } from '../ui';
import './cardtable.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

/** A player's table cards: face-up ones lying on the face-down ones. */
function TableCards({ up, down, width, onUp, onDown, picked }: {
  up: string[]; down: number; width: number; onUp?(c: string): void; onDown?(i: number): void; picked?: string[];
}) {
  return (
    <div className="sh-table">
      {Array.from({ length: Math.max(up.length, down) }, (_, i) => (
        <div key={i} className="sh-stack" style={{ width }}>
          {i < down && (onDown
            ? <button className="hand-card sh-down" onClick={() => onDown(i)} aria-label={`Turn over face-down card ${i + 1}`}><Card code={null} width={width} /></button>
            : <span className="sh-down"><Card code={null} width={width} /></span>)}
          {up[i] && (onUp
            ? <button className={`hand-card sh-up${picked?.includes(up[i]) ? ' picked' : ''}`} onClick={() => onUp(up[i])}><Card code={up[i]} width={width} /></button>
            : <span className="sh-up"><Card code={up[i]} width={width} /></span>)}
        </div>
      ))}
    </div>
  );
}

function PoopStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as PoopView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const myTurn = playing && !!v && v.turn === me;
  const [picked, setPicked] = useState<string[]>([]);
  const [swapHand, setSwapHand] = useState<string | null>(null);
  useEffect(() => { setPicked([]); }, [v?.turn, v?.from, v?.pile.length, v?.hand?.length]);
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const others = order.filter((p) => p !== me);
  const name = (p: string) => snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p;
  const top = v?.pile[v.pile.length - 1];
  const swapping = v?.phase === 'swap' && !!me && !v.ready.includes(me);

  // Picking cards to play: one rank at a time, from where you play now.
  const pick = (c: string) => {
    if (!myTurn || !v) return;
    if (!canPlay(rankOf(c), v.pile)) return;
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length && rankOf(p[0]) !== rankOf(c) ? [c] : [...p, c]));
  };
  const hint = !top ? 'The pile is empty: play anything' : rankOf(top) === '2' ? 'A 2 is on top: play anything'
    : rankOf(top) === '7' ? 'A 7 is on top: play 7 or lower (or a 2 or 10)' : `Play a ${rankName(rankOf(top))} or higher (or a 2 or 10)`;

  return (
    <div className="board-stage">
      <div className="felt sh-felt">
        <div className="opponents">
          {others.map((p) => {
            const seat = snap.seats.find((s) => s.id === p);
            const out = v?.out.includes(p);
            return (
              <div key={p} className={`opponent${v?.turn === p ? ' to-move' : ''}${out ? ' out' : ''}`}>
                <div className="spot-head"><Disc colour={p} size={16} />{seat?.userId && <Avatar name={seat.name ?? '?'} id={seat.userId} size={22} />}<strong>{name(p)}</strong><MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} /></div>
                {v && (out ? <span className="stack">Out{v.out.indexOf(p) === 0 ? ': first!' : ` (${v.out.indexOf(p) + 1})`}</span> : <>
                  <TableCards up={v.up[p]} down={v.downCount[p]} width={34} />
                  <span className="stack">{v.handCount[p]} in hand{v.phase === 'swap' ? (v.ready.includes(p) ? ' · ready' : ' · swapping') : ''}</span>
                </>)}
              </div>
            );
          })}
        </div>

        <div className="piles">
          <div className="pile"><Deck width={64} name="deck" /><span className="stack">{v?.deckCount ?? 0} left</span></div>
          <div className="pile sh-pile">
            {top ? <Card code={top} width={84} /> : <span className="sh-empty">Empty</span>}
            <span className="stack">{v?.pile.length ?? 0} in the pile{v?.burned ? ` · ${v.burned} burned` : ''}</span>
          </div>
        </div>

        {me && v && !v.out.includes(me) && (
          <div className={`my-hand${myTurn || swapping ? ' to-move' : ''}`}>
            <div className="spot-head"><Disc colour={me} size={16} /><strong>Your cards</strong><MoveTimer snap={snap} seatId={me} receivedAt={receivedAt} /></div>
            <div className="sh-mine">
              <div>
                <div className="sh-label">On the table{v.from === 'up' ? ': play these now' : v.from === 'down' ? ': turn one over' : ''}</div>
                <TableCards up={v.up[me]} down={v.downCount[me]} width={52} picked={picked}
                  onUp={swapping && swapHand ? (c) => { act(send, { type: 'swap', hand: swapHand, up: c }); setSwapHand(null); } : myTurn && v.from === 'up' ? pick : undefined}
                  onDown={myTurn && v.from === 'down' ? (i) => act(send, { type: 'blind', index: i }) : undefined} />
              </div>
              <div>
                <div className="sh-label">In your hand ({v.hand?.length ?? 0})</div>
                <div className="hand-row">
                  {(v.hand ?? []).map((c, i) => {
                    const selectable = swapping || (myTurn && v.from === 'hand' && canPlay(rankOf(c), v.pile));
                    const on = swapping ? swapHand === c : picked.includes(c);
                    return (
                      <button key={`${c}${i}`} className={`hand-card${on ? ' picked' : ''}`} disabled={!selectable}
                        onClick={() => (swapping ? setSwapHand(swapHand === c ? null : c) : pick(c))}>
                        <Card code={c} width={52} highlight={on} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={2}>
          {swapping && <>
            <span className="note">{swapHand ? 'Now click a face-up card to swap it with' : 'Swap: click a hand card, then a face-up card'}</span>
            <button className="btn small primary" onClick={() => act(send, { type: 'ready' })}>Ready</button>
          </>}
          {v?.phase === 'swap' && me && v.ready.includes(me) && <span className="note">Ready: waiting for the others to swap</span>}
          {myTurn && v?.from !== 'down' && <>
            <span className="note">{hint}</span>
            <button className="btn small primary" disabled={!picked.length} onClick={() => act(send, { type: 'play', cards: picked })}>
              {picked.length ? `Play ${picked.length > 1 ? `${picked.length} ` : 'the '}${rankName(rankOf(picked[0]))}${picked.length > 1 ? 's' : ''}` : 'Pick cards to play'}
            </button>
            <button className="btn small" disabled={!v?.pile.length} onClick={() => act(send, { type: 'pickup' })}>Pick up the pile</button>
          </>}
          {myTurn && v?.from === 'down' && <span className="note">Turn over one of your face-down cards</span>}
          {v?.log.length ? <span className="note">{name(v.log[v.log.length - 1].seat)} {v.log[v.log.length - 1].text}</span> : null}
        </GameActions>
      </div>
    </div>
  );
}

function LogTab({ snap }: StageProps) {
  const v = snap.game.view as PoopView | null;
  if (!v?.log.length) return <p className="empty">Nothing played yet.</p>;
  const name = (p: string) => snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p;
  return (
    <ol className="moves four-moves">
      {[...v.log].reverse().map((l, i) => <li key={i}><span className="n" /><Disc colour={l.seat} size={16} /><span>{name(l.seat)} {l.text}</span></li>)}
    </ol>
  );
}

export const poopheadClient: GameClient = {
  id: 'poophead',
  Stage: PoopStage,
  tab: { label: 'Plays', Component: LogTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as PoopView | null;
    if (!v || !v.order.includes(seatId)) return <Disc colour={seatId} size={20} />;
    if (v.out.includes(seatId)) return <span className="piece-count">out</span>;
    return <span className="piece-count">{v.handCount[seatId] + v.up[seatId].length + v.downCount[seatId]} cards</span>;
  },
  ConfigPicker: () => <p className="hint">2-5 players, one deck. 2 resets, 7 means lower, 10 and four of a kind burn.</p>,
};
