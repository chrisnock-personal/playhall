import { useEffect, useState } from 'react';
import { HOLES, cube, pointHoles, type CheckersView } from '../../shared/games/chinesecheckers';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const R = 10;
const pos = (h: string): [number, number] => { const [x, , z] = cube(h); return [Math.sqrt(3) * (x + z / 2) * R, 1.5 * z * R]; };

function StarStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as CheckersView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [v?.moves]);
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const myTurn = playing && !!v && !!me && v.order[v.turn] === me;

  // Turn the star so your own point (or the first player's) is at the bottom.
  const homeIdx = v ? v.home[me ?? v.order[0]] : 0;
  const tip = pointHoles(homeIdx).reduce((a, b) => { const [ax, ay] = pos(a), [bx, by] = pos(b); return Math.hypot(bx, by) > Math.hypot(ax, ay) ? b : a; });
  const [tx, ty] = pos(tip);
  const angle = 90 - (Math.atan2(ty, tx) * 180) / Math.PI;
  const owner: Record<number, string> = {};
  if (v) for (const p of v.order) { owner[v.home[p]] = p; }
  const pointOf = new Map<string, number>();
  for (let i = 0; i < 6; i++) for (const h of pointHoles(i)) pointOf.set(h, i);
  const targets = picked && v ? new Set(v.options[picked] ?? []) : new Set<string>();
  const path = v?.last?.path.map(pos);

  const click = (h: string) => {
    if (!myTurn || !v) return;
    if (v.board[h] === me && v.options[h]) { setPicked(picked === h ? null : h); return; }
    if (picked && targets.has(h)) act(send, { type: 'move', from: picked, to: h });
  };

  return (
    <div className="board-stage">
      <div className="cc-wrap">
        <svg viewBox="-150 -150 300 300" className="cc-board" role="img" aria-label="The star board">
          <g transform={`rotate(${angle})`}>
            {HOLES.map((h) => {
              const [x, y] = pos(h);
              const pt = pointOf.get(h);
              const tint = pt !== undefined && owner[(pt + 3) % 6] ? KIT[owner[(pt + 3) % 6]]?.fill : null;
              return <circle key={`b${h}`} cx={x} cy={y} r={R * 0.62} fill={tint ? `${tint}33` : 'rgba(0,0,0,.25)'} stroke="rgba(255,255,255,.12)" strokeWidth={0.6} />;
            })}
            {path && path.length > 1 && <polyline points={path.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.4} strokeDasharray="3 2" strokeLinejoin="round" />}
            {HOLES.map((h) => {
              const [x, y] = pos(h);
              const p = v?.board[h];
              const mine = myTurn && p === me && !!v?.options[h];
              const dest = targets.has(h);
              return (
                <g key={h} onClick={() => click(h)} style={{ cursor: mine || dest ? 'pointer' : 'default' }}
                  role={mine || dest ? 'button' : undefined} aria-label={mine ? 'Your marble' : dest ? 'Move here' : undefined}>
                  <circle cx={x} cy={y} r={R * 0.9} fill="transparent" />
                  {p && <circle cx={x} cy={y} r={R * 0.58} fill={KIT[p]?.fill} stroke={h === picked ? '#fff' : KIT[p]?.rim} strokeWidth={h === picked ? 2 : 1.2} />}
                  {p && <circle cx={x - R * 0.18} cy={y - R * 0.2} r={R * 0.16} fill="rgba(255,255,255,.55)" />}
                  {dest && <circle cx={x} cy={y} r={R * 0.38} fill="rgba(255,255,255,.75)" className="cc-dest" />}
                  {v?.last?.to === h && !dest && <circle cx={x} cy={y} r={R * 0.75} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={0.8} />}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="cc-players">
          {(v?.order ?? []).map((p) => (
            <span key={p} className={`cc-player${v?.order[v.turn] === p && playing ? ' to-move' : ''}`}>
              <Disc colour={p} size={14} /> {name(p)} · {v!.homeCount[p]}/10 home <MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} />
            </span>
          ))}
        </div>
        <GameActions snap={snap} send={send} minPlayers={2}>
          {myTurn && <span className="note">{picked ? 'Tap where it should go (the white dots)' : 'Your turn: tap one of your marbles'}</span>}
        </GameActions>
      </div>
    </div>
  );
}

export const chineseCheckersClient: GameClient = {
  id: 'chinesecheckers',
  Stage: StarStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as CheckersView | null;
    return v && seatId in v.homeCount ? <span className="piece-count">{v.homeCount[seatId]}/10 home</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">2, 3, 4 or 6 players (bots can fill seats). Race your marbles to the opposite point.</p>,
};
