import { useEffect, useState } from 'react';
import type { CheckersMove, CheckersSide, CheckersView } from '../../shared/games/checkers';
import type { GameClient, StageProps } from './types';
import { Disc, GameActions, PlayerStrip, SquareBoard } from '../kit/kit';

const name = (i: number) => `${'abcdefgh'[i % 8]}${Math.floor(i / 8) + 1}`;

function CheckersStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as CheckersView | null;
  const playing = snap.game.status === 'playing';
  const mine = snap.you.seat as CheckersSide | null;
  const myTurn = playing && !!mine && v?.turn === mine;
  const [flip, setFlip] = useState(false);
  const flipped = mine ? mine === 'white' : flip;
  // The squares picked so far for the move being made (a jump can take several).
  const [path, setPath] = useState<number[]>([]);
  useEffect(() => { setPath([]); }, [v?.moveCount, snap.game.status]);

  const legal: CheckersMove[] = myTurn ? v?.legal ?? [] : [];
  const matches = legal.filter((m) => path.every((s, i) => m.path[i] === s));
  const targets = new Set(path.length ? matches.map((m) => m.path[path.length]).filter((s) => s !== undefined) : []);
  const movable = new Set(legal.map((m) => m.path[0]));
  const last = new Set(v?.lastMove ?? []);

  const click = (i: number) => {
    if (!myTurn) return;
    if (targets.has(i)) {
      const next = [...path, i];
      const done = legal.find((m) => m.path.length === next.length && m.path.every((s, k) => s === next[k]));
      const longer = legal.some((m) => m.path.length > next.length && next.every((s, k) => m.path[k] === s));
      if (done && !longer) { send({ t: 'act', action: { type: 'move', path: next } }); setPath([]); }
      else setPath(next);
      return;
    }
    setPath(movable.has(i) ? [i] : []);
  };

  const opp: CheckersSide | null = mine ? (mine === 'black' ? 'white' : 'black') : null;
  const top: CheckersSide = flipped ? 'black' : 'white';

  return (
    <div className="board-stage">
      <div className="checkers-col">
        <PlayerStrip snap={snap} send={send} seatId={top} toMove={playing && v?.turn === top} receivedAt={receivedAt}
          extra={v && <span className="piece-count">{v.counts[top]} left</span>} />
        <SquareBoard
          label="Checkers board"
          flipped={flipped}
          onSquare={myTurn ? click : undefined}
          mark={(i) => [
            last.has(i) ? 'last' : '',
            path[0] === i ? 'selected' : '',
            targets.has(i) ? 'target' : '',
            !path.length && movable.has(i) ? 'movable' : '',
          ].join(' ')}
          render={(i) => {
            const p = v?.board[i];
            return p ? <Disc colour={p.side} size="86%" crown={p.king} /> : null;
          }}
        />
        <PlayerStrip snap={snap} send={send} seatId={top === 'white' ? 'black' : 'white'} toMove={playing && v?.turn !== top} receivedAt={receivedAt}
          extra={v && <span className="piece-count">{v.counts[top === 'white' ? 'black' : 'white']} left</span>} />
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
          {myTurn && path.length > 0 && <span className="note">{targets.size ? 'Pick where it lands' : ''}</span>}
          {!mine && <button className="btn small" onClick={() => setFlip((f) => !f)}>Flip board</button>}
        </GameActions>
      </div>
    </div>
  );
}

function MovesTab({ snap }: StageProps) {
  const v = snap.game.view as (CheckersView & { moves?: number[][] }) | null;
  if (!v?.moveCount) return <p className="empty">No moves yet.</p>;
  return <p className="muted">{v.moveCount} moves so far. Last: {v.lastMove?.map(name).join(v.lastMove.length > 2 || Math.abs(v.lastMove[1] - v.lastMove[0]) > 9 ? '×' : '-')}</p>;
}

export const checkersClient: GameClient = {
  id: 'checkers',
  Stage: CheckersStage,
  tab: { label: 'Moves', Component: MovesTab },
  seatExtra: (_props, seatId) => <Disc colour={seatId} size={20} />,
  ConfigPicker: () => <p className="hint">English draughts: 8 × 8, compulsory captures. Black moves first.</p>,
};
