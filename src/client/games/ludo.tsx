import { HOME, SAFE, START, type LudoView } from '../../shared/games/ludo';
import type { GameClient, StageProps } from './types';
import { COLOURS, Die, GameActions, Pawn, PlayerStrip } from '../kit/kit';
import { Mover, usePrevious, type Point } from '../kit/motion';
import { pathTime } from '../kit/cues';

// The board is a 15×15 grid: four yards in the corners, a 52-square track
// round a cross, a coloured home column for each player and home in the
// middle. TRACK[i] is the [row, col] of track square i (0 = Amber's start).
const TRACK: [number, number][] = [
  ...[1, 2, 3, 4, 5].map((c) => [6, c]), ...[5, 4, 3, 2, 1, 0].map((r) => [r, 6]), [0, 7], [0, 8],
  ...[1, 2, 3, 4, 5].map((r) => [r, 8]), ...[9, 10, 11, 12, 13, 14].map((c) => [6, c]), [7, 14], [8, 14],
  ...[13, 12, 11, 10, 9].map((c) => [8, c]), ...[9, 10, 11, 12, 13, 14].map((r) => [r, 8]), [14, 7], [14, 6],
  ...[13, 12, 11, 10, 9].map((r) => [r, 6]), ...[5, 4, 3, 2, 1, 0].map((c) => [8, c]), [7, 0], [6, 0],
] as [number, number][];

const HOME_COL: Record<string, [number, number][]> = {
  amber: [1, 2, 3, 4, 5].map((c) => [7, c]),
  teal: [1, 2, 3, 4, 5].map((r) => [r, 7]),
  violet: [13, 12, 11, 10, 9].map((c) => [7, c]),
  rose: [13, 12, 11, 10, 9].map((r) => [r, 7]),
};
const YARD: Record<string, [number, number]> = { amber: [0, 0], teal: [0, 9], violet: [9, 9], rose: [9, 0] };
const HOME_SPOT: Record<string, [number, number]> = { amber: [7, 6.3], teal: [6.3, 7], violet: [7, 7.7], rose: [7.7, 7] };

/** Where a token is drawn: [row, col] centre in grid units. */
function place(seat: string, progress: number, index: number): [number, number] {
  if (progress === -1) {
    const [r, c] = YARD[seat];
    return [r + 1.75 + Math.floor(index / 2) * 2.5, c + 1.75 + (index % 2) * 2.5];
  }
  if (progress === HOME) return HOME_SPOT[seat];
  if (progress > 50) { const [r, c] = HOME_COL[seat][progress - 51]; return [r + 0.5, c + 0.5]; }
  const [r, c] = TRACK[(START[seat] + progress) % 52];
  return [r + 0.5, c + 0.5];
}

const tint = (seat: string, a = 0.55) => {
  const hex = COLOURS[seat].fill;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function Board() {
  return (
    <svg className="ludo-art" viewBox="0 0 15 15" aria-hidden="true">
      <rect width="15" height="15" fill="#E6D5B3" />
      {Object.entries(YARD).map(([seat, [r, c]]) => (
        <g key={seat}>
          <rect x={c} y={r} width="6" height="6" fill={tint(seat, 0.75)} />
          <rect x={c + 0.8} y={r + 0.8} width="4.4" height="4.4" rx="0.5" fill="#F4EFE4" />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={c + 1.75 + (i % 2) * 2.5} cy={r + 1.75 + Math.floor(i / 2) * 2.5} r="0.75" fill={tint(seat, 0.45)} />)}
        </g>
      ))}
      {TRACK.map(([r, c], i) => (
        <rect key={i} x={c + 0.03} y={r + 0.03} width="0.94" height="0.94"
          fill={Object.entries(START).find(([, s]) => s === i) ? tint(Object.entries(START).find(([, s]) => s === i)![0]) : (r + c) % 2 ? '#D3B98F' : '#E6D5B3'}
          stroke="#A97F57" strokeWidth="0.04" />
      ))}
      {[...SAFE].filter((i) => !Object.values(START).includes(i)).map((i) => {
        const [r, c] = TRACK[i];
        return <path key={i} transform={`translate(${c + 0.5} ${r + 0.5}) scale(0.32)`} d="M0-1l.29.6.66.1-.48.46.11.66L0 1.5l-.58.32.11-.66-.48-.46.66-.1z" fill="#8A6440" />;
      })}
      {Object.entries(HOME_COL).map(([seat, cells]) => cells.map(([r, c], i) => (
        <rect key={`${seat}${i}`} x={c + 0.03} y={r + 0.03} width="0.94" height="0.94" fill={tint(seat)} stroke="#A97F57" strokeWidth="0.04" />
      )))}
      <path d="M6 6 L7.5 7.5 L6 9 Z" fill={tint('amber', 0.85)} />
      <path d="M6 6 L7.5 7.5 L9 6 Z" fill={tint('teal', 0.85)} />
      <path d="M9 6 L7.5 7.5 L9 9 Z" fill={tint('violet', 0.85)} />
      <path d="M6 9 L7.5 7.5 L9 9 Z" fill={tint('rose', 0.85)} />
    </svg>
  );
}

/** Changes when the die is rolled (not when the token is then moved), so the die tumbles once per roll. */
function dieKey(v: LudoView | null): string | undefined {
  if (!v) return undefined;
  const j = (x: unknown) => JSON.stringify(x ?? null);
  if (v.roll !== null) return `p:${j(v.last)}`;
  if (!v.last) return undefined;
  return v.last.token === null ? `n:${j(v.last)}` : `p:${j(v.log[v.log.length - 2])}`;
}

function LudoStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as LudoView | null;
  const playing = snap.game.status === 'playing';
  const mine = snap.you.seat;
  const myTurn = playing && !!mine && v?.turn === mine;
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const movable = new Set(myTurn ? v?.movable ?? [] : []);
  const last = v?.last;
  const lastKey = last ? `${v?.log.length}:${JSON.stringify(last)}` : undefined;
  const before = usePrevious(v);

  // Tokens on the same spot are nudged apart.
  const spots = new Map<string, number>();
  const tokens = order.flatMap((seat) => (v?.tokens[seat] ?? [-1, -1, -1, -1]).map((p, i) => {
    const [r, c] = place(seat, p, i);
    const key = `${r},${c}`;
    const k = spots.get(key) ?? 0;
    spots.set(key, k + 1);
    return { seat, i, p, r: r + (k ? -0.15 * k : 0), c: c + (k ? 0.2 * k : 0) };
  }));

  return (
    <div className="board-stage">
      <div className="track-layout">
        <div className="track-board ludo-board" role="img" aria-label={`Ludo board. ${order.map((s) => `${COLOURS[s].label}: ${(v?.tokens[s] ?? []).filter((p) => p === HOME).length} home`).join(', ')}`}>
          <Board />
          {tokens.map((t) => {
            const at: Point = [(t.c / 15) * 100, (t.r / 15) * 100];
            const pct = ([r, c]: [number, number]): Point => [(c / 15) * 100, (r / 15) * 100];
            // The token just moved steps square by square; one it captured goes back to the yard (#28).
            const was = before?.tokens[t.seat]?.[t.i];
            let path: Point[] | null = null, delay = 0;
            if (last && was !== undefined && was !== t.p) {
              if (last.seat === t.seat && last.token === t.i) {
                const steps = was === -1 ? [-1, 0] : Array.from({ length: t.p - was + 1 }, (_, k) => was + k);
                path = [...steps.slice(0, -1).map((p) => pct(place(t.seat, p, t.i))), at];
              } else if (t.p === -1 && was >= 0) {
                const moved = before?.tokens[last.seat]?.[last.token ?? 0] ?? 0;
                delay = pathTime(Math.max(1, (v?.tokens[last.seat]?.[last.token ?? 0] ?? 0) - moved));
                path = [pct(place(t.seat, was, t.i)), at];
              }
            }
            const movableHere = t.seat === mine && movable.has(t.i);
            return (
              <Mover key={`${t.seat}${t.i}`} className={`track-token ludo-token${movableHere ? ' movable' : ''}`} x={at[0]} y={at[1]}
                path={path} play={path ? lastKey : undefined} delay={delay} hop={!!path && !delay}>
                {movableHere
                  ? (
                    <button className="ludo-token-btn" aria-label={`Move token ${t.i + 1}`} onClick={() => send({ t: 'act', action: { type: 'move', token: t.i } })}>
                      <Pawn colour={t.seat} size="100%" />
                    </button>
                  )
                  : <Pawn colour={t.seat} size="100%" />}
              </Mover>
            );
          })}
        </div>
        <div className="track-side">
          {order.map((seat) => (
            <PlayerStrip key={seat} snap={snap} send={send} seatId={seat} toMove={playing && v?.turn === seat} receivedAt={receivedAt}
              extra={<span className="piece-count">{v ? `${v.tokens[seat].filter((p) => p === HOME).length} home` : ''}</span>} />
          ))}
          {snap.seats.filter((s) => !order.includes(s.id)).map((s) => <PlayerStrip key={s.id} snap={snap} send={send} seatId={s.id} toMove={false} />)}
          <div className="dice-row">
            <Die value={v?.roll ?? last?.roll ?? null} rollKey={dieKey(v)} />
            <div className="roll-note">
              {myTurn && v?.roll !== null ? <strong>You rolled {v?.roll}: pick a token</strong>
                : last ? (
                  <>
                    <strong>{COLOURS[last.seat].label} rolled {last.roll}</strong>
                    <span>{last.note ?? (last.captured.length ? `and sent ${last.captured.map((s) => COLOURS[s].label).join(' and ')} back to the yard` : 'and moved')}</span>
                  </>
                ) : <span className="muted">No rolls yet.</span>}
            </div>
            {myTurn && v?.roll === null && <button className="btn primary" onClick={() => send({ t: 'act', action: { type: 'roll' } })}>Roll</button>}
          </div>
          <GameActions snap={snap} send={send} minPlayers={2} />
        </div>
      </div>
    </div>
  );
}

function LogTab({ snap }: StageProps) {
  const v = snap.game.view as LudoView | null;
  if (!v?.log.length) return <p className="empty">No rolls yet.</p>;
  return (
    <ol className="moves four-moves">
      {[...v.log].reverse().map((l, i) => (
        <li key={i}><span className="n">{l.roll}</span><Pawn colour={l.seat} size={18} />
          <span>{l.note ?? (l.token !== null ? `token ${l.token + 1}${l.captured.length ? `, captured ${l.captured.map((s) => COLOURS[s].label).join(', ')}` : ''}` : '')}</span></li>
      ))}
    </ol>
  );
}

export const ludoClient: GameClient = {
  id: 'ludo',
  Stage: LudoStage,
  tab: { label: 'Rolls', Component: LogTab },
  seatExtra: (_props, seatId) => <Pawn colour={seatId} size={22} />,
  ConfigPicker: () => <p className="hint">2-4 players. A 6 to come out; exact roll to get home.</p>,
};
