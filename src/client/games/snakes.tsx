import { LADDERS, SNAKES, type SnakesView } from '../../shared/games/snakes';
import type { GameClient, StageProps } from './types';
import { COLOURS, Die, GameActions, Pawn, PlayerStrip } from '../kit/kit';

/** Centre of square n (1-100) in a 100×100 drawing: 1 is bottom left and the
 *  rows snake back and forth. */
function centre(n: number): [number, number] {
  const row = Math.floor((n - 1) / 10);
  const col = row % 2 === 0 ? (n - 1) % 10 : 9 - ((n - 1) % 10);
  return [col * 10 + 5, (9 - row) * 10 + 5];
}

function Ladder({ from, to }: { from: number; to: number }) {
  const [x1, y1] = centre(from), [x2, y2] = centre(to);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = ((y1 - y2) / len) * 1.8, ny = ((x2 - x1) / len) * 1.8;
  const rungs = Math.max(2, Math.round(len / 4));
  return (
    <g className="ladder">
      <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} />
      <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} />
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.5) / rungs;
        const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
        return <line key={i} x1={x + nx} y1={y + ny} x2={x - nx} y2={y - ny} />;
      })}
    </g>
  );
}

function Snake({ from, to, n }: { from: number; to: number; n: number }) {
  const [x1, y1] = centre(from), [x2, y2] = centre(to);
  const mx = (x1 + x2) / 2;
  const bend = n % 2 ? 9 : -9;
  const d = `M${x1} ${y1} C${mx + bend} ${y1 + (y2 - y1) * 0.2} ${mx - bend} ${y1 + (y2 - y1) * 0.8} ${x2} ${y2}`;
  return (
    <g className={`snake s${n % 3}`}>
      <path d={d} className="body" />
      <path d={d} className="belly" />
      <circle cx={x1} cy={y1} r="2.6" className="head" />
    </g>
  );
}

function SnakesStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as SnakesView | null;
  const playing = snap.game.status === 'playing';
  const mine = snap.you.seat;
  const myTurn = playing && !!mine && v?.turn === mine;
  const seated = snap.seats.filter((s) => s.userId).map((s) => s.id);
  const order = v?.order ?? seated;
  // Tokens sharing a square sit side by side.
  const bySquare = new Map<number, string[]>();
  for (const seat of order) {
    const p = v?.pos[seat] ?? 0;
    if (p > 0) bySquare.set(p, [...(bySquare.get(p) ?? []), seat]);
  }
  const last = v?.last;

  return (
    <div className="board-stage">
      <div className="track-layout">
        <div className="track-board" role="img" aria-label={`Snakes and Ladders board. ${order.map((s) => `${COLOURS[s]?.label}: square ${v?.pos[s] ?? 0}`).join(', ')}`}>
          <div className="track-grid">
            {Array.from({ length: 100 }, (_, i) => {
              const vr = Math.floor(i / 10), vc = i % 10;
              const row = 9 - vr;
              const n = row * 10 + (row % 2 === 0 ? vc : 9 - vc) + 1;
              return <div key={n} className={`cell ${(vr + vc) % 2 ? 'dark' : 'light'}${last?.to === n ? ' last' : ''}`}><span>{n}</span></div>;
            })}
          </div>
          <svg className="track-art" viewBox="0 0 100 100" aria-hidden="true">
            {Object.entries(LADDERS).map(([a, b]) => <Ladder key={a} from={+a} to={b} />)}
            {Object.entries(SNAKES).map(([a, b], i) => <Snake key={a} from={+a} to={b} n={i} />)}
          </svg>
          {[...bySquare].map(([sq, seats]) => {
            const [x, y] = centre(sq);
            return seats.map((seat, k) => (
              <span key={seat} className="track-token" style={{ left: `${x + (k - (seats.length - 1) / 2) * 3}%`, top: `${y}%` }}>
                <Pawn colour={seat} size="100%" />
              </span>
            ));
          })}
        </div>
        <div className="track-side">
          {order.map((seat) => (
            <PlayerStrip key={seat} snap={snap} send={send} seatId={seat} toMove={playing && v?.turn === seat} receivedAt={receivedAt}
              extra={<span className="piece-count">{v ? (v.pos[seat] ? `square ${v.pos[seat]}` : 'not on yet') : ''}</span>} />
          ))}
          {snap.seats.filter((s) => !order.includes(s.id)).map((s) => (
            <PlayerStrip key={s.id} snap={snap} send={send} seatId={s.id} toMove={false} />
          ))}
          <div className="dice-row">
            <Die value={last?.value ?? null} rollKey={v?.rolls.length} />
            <div className="roll-note">
              {last ? (
                <>
                  <strong>{COLOURS[last.seat]?.label} rolled {last.value}</strong>
                  <span>
                    {last.from === 0 ? 'onto the board' : `from ${last.from}`} to {last.to}
                    {last.via === 'ladder' ? ' up a ladder' : last.via === 'snake' ? ' down a snake' : ''}
                    {last.bounced ? ', bouncing back off 100' : ''}
                  </span>
                </>
              ) : <span className="muted">No rolls yet.</span>}
            </div>
            {myTurn && <button className="btn primary" onClick={() => send({ t: 'act', action: { type: 'roll' } })}>Roll</button>}
          </div>
          <GameActions snap={snap} send={send} minPlayers={2} />
        </div>
      </div>
    </div>
  );
}

function RollsTab({ snap }: StageProps) {
  const v = snap.game.view as SnakesView | null;
  if (!v?.rolls.length) return <p className="empty">No rolls yet.</p>;
  return (
    <ol className="moves four-moves">
      {[...v.rolls].reverse().map((r, i) => (
        <li key={i}><span className="n">{r.value}</span><Pawn colour={r.seat} size={18} /><span>{r.from} → {r.to}{r.via ? ` (${r.via})` : ''}</span></li>
      ))}
    </ol>
  );
}

export const snakesClient: GameClient = {
  id: 'snakes',
  Stage: SnakesStage,
  tab: { label: 'Rolls', Component: RollsTab },
  seatExtra: (_props, seatId) => <Pawn colour={seatId} size={22} />,
  ConfigPicker: () => <p className="hint">2-4 players. Land exactly on 100 to win.</p>,
};
