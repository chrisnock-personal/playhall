import { FLEET, SIZE, type SeaView, type Shot, type Ship } from '../../shared/games/seabattle';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, PlayerStrip, SquareBoard } from '../kit/kit';

const FILES = 'ABCDEFGHIJ';

/** One player's waters: their ships (if you may see them) and the shots fired into them. */
function Waters({ title, fleet, shots, sunk, onFire, label }: {
  title: string; fleet?: Ship[]; shots: Shot[]; sunk: string[]; onFire?(cell: number): void; label: string;
}) {
  const shipAt = new Map<number, Ship>();
  for (const ship of fleet ?? []) for (const c of ship.cells) shipAt.set(c, ship);
  const shotAt = new Map(shots.map((s) => [s.cell, s]));
  const last = shots[shots.length - 1]?.cell;
  return (
    <div className="waters">
      <div className="waters-head"><strong>{title}</strong><span className="muted">{FLEET.length - sunk.length} of {FLEET.length} ships afloat</span></div>
      <SquareBoard
        size={SIZE}
        files={FILES}
        variant="sea"
        flipped={false}
        label={label}
        onSquare={onFire ? (i) => { if (!shotAt.has(i)) onFire(i); } : undefined}
        mark={(i) => {
          const ship = shipAt.get(i);
          return [
            ship ? (sunk.includes(ship.name) ? 'ship sunk' : 'ship') : '',
            i === last ? 'last' : '',
            onFire && !shotAt.has(i) ? 'aim' : '',
          ].join(' ');
        }}
        render={(i) => {
          const shot = shotAt.get(i);
          return shot ? <span className={`peg ${shot.hit ? 'hit' : 'miss'}`} aria-label={shot.hit ? 'hit' : 'miss'} /> : null;
        }}
      />
      <ul className="fleet-list">
        {FLEET.map((f) => <li key={f.name} className={sunk.includes(f.name) ? 'sunk' : ''}>{f.name} ({f.size})</li>)}
      </ul>
    </div>
  );
}

function SeaStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as SeaView | null;
  const playing = snap.game.status === 'playing';
  const me = snap.you.seat;
  const them = me === 'amber' ? 'teal' : me === 'teal' ? 'amber' : null;
  const placing = playing && v?.phase === 'placing';
  const myTurn = playing && v?.phase === 'firing' && v.turn === me;
  const lastShot = v && v.turn ? v.shots[v.turn === 'amber' ? 'teal' : 'amber'].at(-1) : null;

  const left = me ?? 'amber', right = them ?? 'teal';
  return (
    <div className="board-stage">
      <div className="sea-layout">
        <div className="sea-strips">
          <PlayerStrip snap={snap} send={send} seatId="amber" toMove={!!playing && (placing ? !v?.ready.amber : v?.turn === 'amber')} receivedAt={receivedAt}
            extra={placing && <span className="piece-count">{v?.ready.amber ? 'ready' : 'placing ships'}</span>} />
          <PlayerStrip snap={snap} send={send} seatId="teal" toMove={!!playing && (placing ? !v?.ready.teal : v?.turn === 'teal')} receivedAt={receivedAt}
            extra={placing && <span className="piece-count">{v?.ready.teal ? 'ready' : 'placing ships'}</span>} />
        </div>
        <div className="sea-boards">
          <Waters
            title={me ? 'Your fleet' : `${COLOURS[left].label}’s waters`}
            fleet={v?.fleets[left]} shots={v?.shots[right] ?? []} sunk={v?.sunk[left] ?? []}
            label={me ? 'Your fleet and the shots fired at it' : `${COLOURS[left].label}'s waters`}
          />
          <Waters
            title={me ? 'Enemy waters' : `${COLOURS[right].label}’s waters`}
            fleet={v?.fleets[right]} shots={v?.shots[left] ?? []} sunk={v?.sunk[right] ?? []}
            label={me ? 'Enemy waters: pick a square to fire at' : `${COLOURS[right].label}'s waters`}
            onFire={myTurn ? (cell) => send({ t: 'act', action: { type: 'fire', cell } }) : undefined}
          />
        </div>
        <GameActions snap={snap} send={send}>
          {placing && me && !v?.ready[me] && (
            <>
              <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'shuffle' } })}>Shuffle my fleet</button>
              <button className="btn small primary" onClick={() => send({ t: 'act', action: { type: 'ready' } })}>Ready</button>
            </>
          )}
          {placing && me && v?.ready[me] && <span className="note">Waiting for your opponent to place their fleet</span>}
          {myTurn && <span className="note">Your shot: pick a square in the enemy’s waters</span>}
          {lastShot && playing && v?.phase === 'firing' && (
            <span className="note">Last shot: {FILES[lastShot.cell % SIZE]}{SIZE - Math.floor(lastShot.cell / SIZE)}, {lastShot.sunk ? `sank the ${lastShot.sunk}!` : lastShot.hit ? 'a hit' : 'a miss'}</span>
          )}
        </GameActions>
      </div>
    </div>
  );
}

function ShotsTab({ snap }: StageProps) {
  const v = snap.game.view as SeaView | null;
  if (!v) return <p className="empty">No shots yet.</p>;
  const all = (['amber', 'teal'] as const).flatMap((seat) => v.shots[seat].map((s, i) => ({ seat, s, i })));
  if (!all.length) return <p className="empty">No shots yet.</p>;
  return (
    <ol className="moves four-moves">
      {all.sort((a, b) => b.i - a.i || (a.seat === 'teal' ? -1 : 1)).map(({ seat, s }, k) => (
        <li key={k}><span className="n">{FILES[s.cell % SIZE]}{SIZE - Math.floor(s.cell / SIZE)}</span><Disc colour={seat} size={16} />
          <span>{s.sunk ? `sank the ${s.sunk}` : s.hit ? 'hit' : 'miss'}</span></li>
      ))}
    </ol>
  );
}

export const seaBattleClient: GameClient = {
  id: 'seabattle',
  Stage: SeaStage,
  tab: { label: 'Shots', Component: ShotsTab },
  seatExtra: (_props, seatId) => <Disc colour={seatId} size={20} />,
  ConfigPicker: () => <p className="hint">Five ships each on a 10 × 10 grid. Amber fires first.</p>,
};
