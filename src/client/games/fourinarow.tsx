import { useRef, useState } from 'react';
import { landing, type FourSeat, type FourView } from '../../shared/games/fourinarow';
import type { GameClient, StageProps } from './types';
import { Disc, GameActions, PlayerStrip } from '../kit/kit';

function FourStage(props: StageProps) {
  const { snap, send } = props;
  const v = snap.game.view as FourView | null;
  const cols = v?.cols ?? 7, rows = v?.rows ?? 6;
  const grid = v?.grid ?? Array(cols * rows).fill(null);
  const playing = snap.game.status === 'playing';
  const mine = snap.you.seat as FourSeat | null;
  const myTurn = playing && !!mine && v?.turn === mine;
  const [hover, setHover] = useState<number | null>(null);
  // Only animate discs dropped while you're watching, not the last one on arrival.
  const firstSeen = useRef(v?.lastCell ?? null);
  const animate = v?.lastCell !== null && v?.lastCell !== undefined && v.lastCell !== firstSeen.current;
  const win = new Set(v?.winLine ?? []);
  const turn: FourSeat = v?.turn ?? 'amber';
  // Players see their own colour at the bottom of the screen.
  const top: FourSeat = mine === 'teal' ? 'amber' : 'teal';

  return (
    <div className="board-stage">
      <div className="four-col">
        <PlayerStrip snap={snap} send={send} seatId={top} toMove={playing && turn === top} receivedAt={props.receivedAt} />
        <div className="four-board" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => {
            const full = landing(grid, c) < 0;
            const preview = myTurn && hover === c && !full ? landing(grid, c) : -1;
            return (
              <button
                key={c}
                className={`four-column${myTurn && !full ? ' playable' : ''}`}
                disabled={!myTurn || full}
                aria-label={`Drop a disc in column ${c + 1}${full ? ' (full)' : ''}`}
                onMouseEnter={() => setHover(c)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(c)}
                onBlur={() => setHover(null)}
                onClick={() => send({ t: 'act', action: { type: 'drop', col: c } })}
              >
                {Array.from({ length: rows }, (_, i) => {
                  const r = rows - 1 - i;
                  const cell = r * cols + c;
                  const who = grid[cell];
                  return (
                    <span key={cell} className="four-hole">
                      {who && <Disc colour={who} size="100%" ring={win.has(cell)} className={animate && cell === v?.lastCell ? `drop d${rows - r}` : undefined} />}
                      {!who && cell === preview && mine && <Disc colour={mine} size="100%" className="ghost" />}
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
        <PlayerStrip snap={snap} send={send} seatId={top === 'amber' ? 'teal' : 'amber'} toMove={playing && turn !== top} receivedAt={props.receivedAt} />
        <GameActions snap={snap} send={send} />
      </div>
    </div>
  );
}

function MovesTab({ snap }: StageProps) {
  const v = snap.game.view as FourView | null;
  if (!v?.moves.length) return <p className="empty">No discs dropped yet.</p>;
  return (
    <ol className="moves four-moves">
      {v.moves.map((c, i) => (
        <li key={i}><span className="n">{i + 1}.</span><Disc colour={i % 2 === 0 ? 'amber' : 'teal'} size={16} /><span>column {c + 1}</span></li>
      ))}
    </ol>
  );
}

export const fourInARowClient: GameClient = {
  id: 'fourinarow',
  Stage: FourStage,
  tab: { label: 'Moves', Component: MovesTab },
  seatExtra: (_props, seatId) => <Disc colour={seatId} size={20} />,
  ConfigPicker: () => <p className="hint">Classic 7 × 6 frame. Amber drops first.</p>,
};
