import { useEffect, useState } from 'react';
import { FLEET, SIZE, cellsFor, type SeaView, type Shot, type Ship } from '../../shared/games/seabattle';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, PlayerStrip, SquareBoard } from '../kit/kit';
import { ShipArt } from '../kit/ships';

const FILES = 'ABCDEFGHIJ';
const sizeOf = (name: string) => FLEET.find((f) => f.name === name)?.size ?? 2;
const isVertical = (cells: number[]) => cells.length > 1 && cells[1] - cells[0] === SIZE;

/** Where a run of cells sits on screen, as percentages of the board. Square
 *  0 is the bottom-left (the kit's board draws row 0 at the bottom). */
function box(cells: number[]) {
  const start = Math.min(...cells);
  const vertical = isVertical([...cells].sort((a, b) => a - b));
  const r = Math.floor(start / SIZE), c = start % SIZE;
  const n = cells.length;
  return vertical
    ? { left: `${c * 10}%`, top: `${(SIZE - (r + n)) * 10}%`, width: '10%', height: `${n * 10}%`, vertical }
    : { left: `${c * 10}%`, top: `${(SIZE - 1 - r) * 10}%`, width: `${n * 10}%`, height: '10%', vertical };
}

function ShipLayer({ ships, sunk, faded }: { ships: Ship[]; sunk: string[]; faded?: string | null }) {
  return (
    <div className="ship-layer" aria-hidden="true">
      {ships.map((ship) => {
        const b = box(ship.cells);
        return (
          <div key={ship.name} className={`ship-pos${faded === ship.name ? ' lifted' : ''}`} style={{ left: b.left, top: b.top, width: b.width, height: b.height }}>
            <ShipArt name={ship.name} size={ship.cells.length} vertical={b.vertical} sunk={sunk.includes(ship.name)} />
          </div>
        );
      })}
    </div>
  );
}

/** One player's waters: their ships (when you may see them) and the shots fired into them. */
function Waters({ title, fleet, shots, sunk, onFire, label }: {
  title: string; fleet?: Ship[]; shots: Shot[]; sunk: string[]; onFire?(cell: number): void; label: string;
}) {
  const shotAt = new Map(shots.map((s) => [s.cell, s]));
  const last = shots[shots.length - 1]?.cell;
  return (
    <div className="waters">
      <div className="waters-head"><strong>{title}</strong><span className="muted">{FLEET.length - sunk.length} of {FLEET.length} ships afloat</span></div>
      <div className="waters-board">
        <SquareBoard
          size={SIZE} files={FILES} variant="sea" label={label}
          onSquare={onFire ? (i) => { if (!shotAt.has(i)) onFire(i); } : undefined}
          mark={(i) => [i === last ? 'last' : '', onFire && !shotAt.has(i) ? 'aim' : ''].join(' ')}
          render={(i) => {
            const shot = shotAt.get(i);
            return shot ? <span className={`peg ${shot.hit ? 'hit' : 'miss'}`} aria-label={shot.hit ? 'hit' : 'miss'} /> : null;
          }}
        />
        {fleet && <ShipLayer ships={fleet} sunk={sunk} />}
      </div>
      <ul className="fleet-list">
        {FLEET.map((f) => <li key={f.name} className={sunk.includes(f.name) ? 'sunk' : ''}>{f.name} ({f.size})</li>)}
      </ul>
    </div>
  );
}

/** Your own waters while placing: pick a ship up, turn it, put it down. */
function Harbour({ fleet, onPlace }: { fleet: Ship[]; onPlace(ships: Ship[]): void }) {
  const [lifted, setLifted] = useState<string | null>(null);
  const [vertical, setVertical] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const others = fleet.filter((s) => s.name !== lifted);
  const taken = new Set(others.flatMap((s) => s.cells));
  const shipAt = (i: number) => fleet.find((s) => s.cells.includes(i));
  const ghost = lifted !== null && hover !== null ? cellsFor(hover, sizeOf(lifted), vertical) : null;
  const fits = !!ghost && ghost.every((c) => !taken.has(c));

  const pick = (name: string) => {
    const ship = fleet.find((s) => s.name === name)!;
    setLifted(name);
    setVertical(isVertical(ship.cells));
  };
  const click = (i: number) => {
    if (lifted === null) { const s = shipAt(i); if (s) pick(s.name); return; }
    const cells = cellsFor(i, sizeOf(lifted), vertical);
    if (!cells || cells.some((c) => taken.has(c))) { const s = shipAt(i); if (s && s.name !== lifted) pick(s.name); return; }
    onPlace(fleet.map((s) => (s.name === lifted ? { name: s.name, cells } : s)));
    setLifted(null);
  };

  return (
    <div className="waters">
      <div className="waters-head"><strong>Your fleet</strong><span className="muted">{lifted ? `Moving the ${lifted}: click where its ${vertical ? 'top' : 'left'} end goes` : 'Click a ship to move it'}</span></div>
      <div className="waters-board placing">
        <SquareBoard
          size={SIZE} files={FILES} variant="sea" label="Your fleet: click a ship, then click where it goes"
          onSquare={click} onHover={setHover}
          mark={(i) => (lifted && ghost?.includes(i) ? (fits ? 'fits' : 'clash') : '')}
          render={() => null}
        />
        <ShipLayer ships={fleet} sunk={[]} faded={lifted} />
        {ghost && lifted && (
          <div className="ship-layer" aria-hidden="true">
            <div className="ship-pos" style={(() => { const b = box(ghost); return { left: b.left, top: b.top, width: b.width, height: b.height }; })()}>
              <ShipArt name={lifted} size={ghost.length} vertical={vertical} ghost bad={!fits} />
            </div>
          </div>
        )}
      </div>
      <div className="dock">
        {FLEET.map((f) => (
          <button key={f.name} className={`btn tiny${lifted === f.name ? ' on' : ''}`} onClick={() => (lifted === f.name ? setLifted(null) : pick(f.name))}>
            {f.name} ({f.size})
          </button>
        ))}
        <button className="btn tiny" disabled={!lifted} onClick={() => setVertical((v) => !v)}>Rotate</button>
      </div>
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
  // Your fleet as you're arranging it; follows the server (e.g. after Shuffle).
  const serverFleet = me ? v?.fleets[me] : undefined;
  const [draft, setDraft] = useState<Ship[] | null>(null);
  useEffect(() => { setDraft(serverFleet ?? null); }, [JSON.stringify(serverFleet)]);

  const left = me ?? 'amber', right = them ?? 'teal';
  const arranging = placing && me && !v?.ready[me] && draft;
  return (
    <div className="board-stage">
      <div className="sea-layout">
        <div className="sea-strips">
          {(['amber', 'teal'] as const).map((seat) => (
            <PlayerStrip key={seat} snap={snap} send={send} seatId={seat} toMove={!!playing && (placing ? !v?.ready[seat] : v?.turn === seat)} receivedAt={receivedAt}
              extra={placing && <span className="piece-count">{v?.ready[seat] ? 'ready' : 'placing ships'}</span>} />
          ))}
        </div>
        <div className="sea-boards">
          {arranging ? (
            <Harbour fleet={draft} onPlace={(ships) => { setDraft(ships); send({ t: 'act', action: { type: 'place', ships } }); }} />
          ) : (
            <Waters
              title={me ? 'Your fleet' : `${COLOURS[left].label}’s waters`}
              fleet={v?.fleets[left]} shots={v?.shots[right] ?? []} sunk={v?.sunk[left] ?? []}
              label={me ? 'Your fleet and the shots fired at it' : `${COLOURS[left].label}'s waters`}
            />
          )}
          <Waters
            title={me ? 'Enemy waters' : `${COLOURS[right].label}’s waters`}
            fleet={v?.fleets[right]} shots={v?.shots[left] ?? []} sunk={v?.sunk[right] ?? []}
            label={me ? 'Enemy waters: pick a square to fire at' : `${COLOURS[right].label}'s waters`}
            onFire={myTurn ? (cell) => send({ t: 'act', action: { type: 'fire', cell } }) : undefined}
          />
        </div>
        <GameActions snap={snap} send={send}>
          {arranging && (
            <>
              <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'shuffle' } })}>Shuffle</button>
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
  ConfigPicker: () => <p className="hint">Five ships each on a 10 × 10 grid; place them yourself or shuffle. Amber fires first.</p>,
};
