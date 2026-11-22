import { useState } from 'react';
import { BETS, BET_NAMES, ODDS, cantBet, type Bet, type CrapsView } from '../../shared/games/craps';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Die, Disc, GameActions, MoveTimer } from '../kit/kit';
import './casino.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const VALUES = [5, 25, 100];
const HINT: Record<Bet, (point: number | null) => string> = {
  pass: () => 'Wins on 7 or 11, then on the point',
  dontpass: () => 'Wins on 2 or 3, then on a 7',
  odds: (p) => (p ? `Pays ${ODDS[p][0]} to ${ODDS[p][1]} on the ${p}` : 'Once there’s a point'),
  field: () => '2, 3, 4, 9, 10, 11, 12 · 2 and 12 pay double',
};

function CrapsStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as CrapsView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [value, setValue] = useState(25);
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const betting = playing && !!v && !!me && !v.ready.includes(me);
  const mine = me && v ? v.bets[me] : null;
  const fresh = me && v ? v.fresh[me] : null;

  return (
    <div className="board-stage">
      <div className="cs-felt">
        <div className="cp-top">
          <div className="cp-dice">
            <Die value={v?.last?.dice[0] ?? null} rollKey={v?.roll} />
            <Die value={v?.last?.dice[1] ?? null} rollKey={v?.roll} second />
          </div>
          <div className="rl-info">
            <strong className="cp-words">{v?.last?.words ?? 'Bets down for the come-out roll'}</strong>
            {v?.last && me && <span>{v.last.net[me] > 0 ? `You won ${v.last.net[me]}` : v.last.net[me] < 0 ? `You lost ${-v.last.net[me]}` : 'No change for you'}</span>}
            <span className="muted small">{v ? `Roll ${v.roll} of ${v.config.rolls} · ${name(v.order[v.shooter])} ${v.order[v.shooter] === me ? 'are' : 'is'} the shooter` : ''}</span>
          </div>
          <span className={`cp-puck${v?.point ? ' on' : ''}`} aria-label={v?.point ? `The point is ${v.point}` : 'No point: the come-out roll'}>{v?.point ? <>ON<b>{v.point}</b></> : 'OFF'}</span>
        </div>

        <div className="cp-layout">
          {BETS.map((b) => {
            const why = v && me ? cantBet(v, me, b, value) : 'Not playing';
            return (
              <button key={b} className={`cp-bet ${b}`} disabled={!betting || !!why} title={why ?? undefined}
                onClick={() => act(send, { type: 'bet', bet: b, amount: value })}>
                <strong>{BET_NAMES[b]}</strong>
                <span className="small">{HINT[b](v?.point ?? null)}</span>
                {mine && mine[b] > 0 && <span className="rl-chip">{mine[b]}</span>}
                <span className="rl-others">{(v?.order ?? []).filter((p) => p !== me && v!.bets[p][b]).map((p) => <Disc key={p} colour={p} size={8} />)}</span>
              </button>
            );
          })}
        </div>

        <div className="cs-players">
          {(v?.order ?? []).map((p, i) => (
            <span key={p} className={`cs-player${playing && v && !v.ready.includes(p) ? ' to-move' : ''}`}>
              <Disc colour={p} size={14} /> {name(p)}{v!.shooter === i ? ' 🎲' : ''} · {v!.chips[p]}{v!.ready.includes(p) ? ' · done' : ''} <MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} />
            </span>
          ))}
        </div>

        <GameActions snap={snap} send={send} minPlayers={1}>
          {betting && (
            <>
              <span className="cs-values" role="group" aria-label="Chip value">
                {VALUES.map((x) => <button key={x} className={`cs-value${value === x ? ' on' : ''}`} onClick={() => setValue(x)}>{x}</button>)}
              </span>
              <button className="btn small" disabled={!fresh || !Object.values(fresh).some(Boolean)} onClick={() => act(send, { type: 'clear' })}>Clear</button>
              <button className="btn small primary" onClick={() => act(send, { type: 'done' })}>{fresh && Object.values(fresh).some(Boolean) ? 'Done: roll' : 'No more bets: roll'}</button>
            </>
          )}
          {playing && me && v && v.ready.includes(me) && <span className="note">Waiting for the others to finish betting</span>}
        </GameActions>
      </div>
    </div>
  );
}

export const crapsClient: GameClient = {
  id: 'craps',
  Stage: CrapsStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as CrapsView | null;
    return v && seatId in v.chips ? <span className="piece-count">{v.chips[seatId]} chips</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: ({ value, onChange, disabled }) => {
    const c = { rolls: 20, ...(value as object) } as { rolls: number };
    return (
      <label className="hint">Rolls: <select disabled={disabled} value={c.rolls} onChange={(e) => onChange({ rolls: Number(e.target.value) })}>
        {[20, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
      </select> · 1,000 play chips each</label>
    );
  },
};
