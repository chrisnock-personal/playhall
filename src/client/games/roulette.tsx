import { useState } from 'react';
import { MIN_BET, WHEEL, colourOf, spotNumbers, spotWords, type RouletteView } from '../../shared/games/roulette';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions, MoveTimer } from '../kit/kit';
import './casino.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const VALUES = [5, 25, 100];
const FILL: Record<string, string> = { red: '#b3261e', black: '#1f1f24', green: '#1d7a3e' };

/** The wheel, turned so the last winning number sits under the pointer at the top. */
function Wheel({ n, spins }: { n: number | null; spins: number }) {
  const step = 360 / WHEEL.length;
  const turn = n === null ? 0 : -WHEEL.indexOf(n) * step - spins * 720;
  return (
    <svg viewBox="-110 -115 220 225" className="rl-wheel" aria-label={n === null ? 'The wheel' : `The ball landed on ${n}`}>
      <polygon points="-7,-112 7,-112 0,-98" fill="#f0a53c" />
      <g style={{ transform: `rotate(${turn}deg)`, transition: 'transform 2.6s cubic-bezier(.15,.7,.2,1)' }}>
        <circle r="100" fill="#5a3a1e" />
        {WHEEL.map((x, i) => {
          const a0 = ((i - 0.5) * step - 90) * (Math.PI / 180), a1 = ((i + 0.5) * step - 90) * (Math.PI / 180);
          const p = (r: number, a: number) => `${Math.cos(a) * r},${Math.sin(a) * r}`;
          const mid = (i * step - 90) * (Math.PI / 180);
          return (
            <g key={x}>
              <path d={`M${p(58, a0)} L${p(94, a0)} A94,94 0 0 1 ${p(94, a1)} L${p(58, a1)} A58,58 0 0 0 ${p(58, a0)}`} fill={FILL[colourOf(x)]} stroke="#c9a46a" strokeWidth=".6" />
              <text x={Math.cos(mid) * 84} y={Math.sin(mid) * 84} fontSize="7" fill="#fff" textAnchor="middle" dominantBaseline="central"
                transform={`rotate(${i * step} ${Math.cos(mid) * 84} ${Math.sin(mid) * 84})`}>{x}</text>
            </g>
          );
        })}
        <circle r="56" fill="#3d2817" stroke="#c9a46a" />
        <circle r="10" fill="#c9a46a" />
      </g>
      {n !== null && <circle cx="0" cy="-74" r="5" fill="#fff" stroke="#999" />}
    </svg>
  );
}

function RouletteStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as RouletteView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [value, setValue] = useState(25);
  // Inside bets (#55): pick the kind, then tap numbers.
  const [kind, setKind] = useState<'n' | 's' | 't' | 'q' | 'x'>('n');
  const [firstOfSplit, setFirstOfSplit] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const name = (p: string) => (p === me ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const betting = playing && !!v && !!me && !v.ready.includes(me);
  const mine = (me && v?.bets[me]) || {};
  const others = (spot: string) => (v ? v.order.filter((p) => p !== me && v.bets[p]?.[spot]) : []);
  const last = v?.last?.number ?? null;
  const bet = (spot: string) => betting && v!.chips[me!] >= Math.max(MIN_BET, value) && act(send, { type: 'bet', spot, amount: value });
  /** A number was tapped: a straight bet, or part of an inside bet. */
  const tapNumber = (n: number) => {
    setHint(null);
    if (kind === 'n' || n === 0 && kind !== 's') { bet(`n${n}`); return; }
    const street = n - ((n - 1) % 3);
    if (kind === 't') { bet(`t${street}`); return; }
    if (kind === 'x') { const st = Math.min(street, 31); bet(`x${st}`); return; }
    if (kind === 'q') {
      // The corner with this number in it, going right and down where there's room.
      const tl = (n % 3 === 0 ? n - 1 : n) - (n > 33 ? 3 : 0);
      if (spotNumbers(`q${tl}`)) bet(`q${tl}`); else setHint('No corner there');
      return;
    }
    // A split: two taps on numbers side by side.
    if (firstOfSplit === null) { setFirstOfSplit(n); setHint(`Now tap a number next to ${n}`); return; }
    const [a, b] = [Math.min(firstOfSplit, n), Math.max(firstOfSplit, n)];
    setFirstOfSplit(null);
    if (spotNumbers(`s${a}-${b}`)) bet(`s${a}-${b}`); else setHint(`${a} and ${b} aren’t side by side`);
  };

  const insides = Object.keys(mine).filter((k) => spotNumbers(k) && !k.startsWith('n'));
  const insideOn = (spot: string) => spot[0] === 'n' && insides.some((k) => spotNumbers(k)!.includes(Number(spot.slice(1))));
  const Spot = ({ spot, label, className = '' }: { spot: string; label: string; className?: string }) => (
    <button className={`rl-spot ${className}${last !== null && v?.last && spot === `n${last}` ? ' won' : ''}${spot === `n${firstOfSplit}` ? ' picking' : ''}${insideOn(spot) ? ' inside' : ''}`} disabled={!betting} onClick={() => (spot[0] === 'n' ? tapNumber(Number(spot.slice(1))) : bet(spot))}
      aria-label={`Bet on ${spotWords(spot)}${mine[spot] ? `: ${mine[spot]} on it` : ''}`}>
      {label}
      {mine[spot] ? <span className="rl-chip">{mine[spot]}</span> : null}
      {others(spot).length > 0 && <span className="rl-others">{others(spot).map((p) => <Disc key={p} colour={p} size={7} />)}</span>}
    </button>
  );

  return (
    <div className="board-stage">
      <div className="cs-felt">
        <div className="rl-top">
          <Wheel n={last} spins={v?.numbers.length ?? 0} />
          <div className="rl-info">
            {v?.last ? <strong className={`rl-result ${colourOf(v.last.number)}`}>{v.last.number} {colourOf(v.last.number)}</strong> : <strong>Place your bets</strong>}
            {v?.last && me && <span>{v.last.net[me] > 0 ? `You won ${v.last.net[me]}` : v.last.net[me] < 0 ? `You lost ${-v.last.net[me]}` : 'No change for you'}</span>}
            <span className="rl-history">{(v?.numbers ?? []).slice(-12).reverse().map((x, i) => <span key={i} className={colourOf(x)}>{x}</span>)}</span>
            <span className="muted small">{v ? `Spin ${v.spin} of ${v.config.spins}` : ''}</span>
          </div>
        </div>

        <div className="rl-table">
          <Spot spot="n0" label="0" className="zero green" />
          <div className="rl-numbers">
            {[3, 2, 1].map((row) => Array.from({ length: 12 }, (_, k) => {
              const n = k * 3 + row;
              return <Spot key={n} spot={`n${n}`} label={String(n)} className={colourOf(n)} />;
            }))}
          </div>
          <div className="rl-cols">{[3, 2, 1].map((c) => <Spot key={c} spot={`c${c}`} label="2:1" />)}</div>
          <div className="rl-dozens">{[1, 2, 3].map((d) => <Spot key={d} spot={`d${d}`} label={`${d === 1 ? '1st' : d === 2 ? '2nd' : '3rd'} 12`} />)}</div>
          <div className="rl-even">
            <Spot spot="low" label="1-18" /><Spot spot="even" label="Even" /><Spot spot="red" label="Red" className="red" />
            <Spot spot="black" label="Black" className="black" /><Spot spot="odd" label="Odd" /><Spot spot="high" label="19-36" />
          </div>
        </div>

        {betting && (
          <div className="rl-kinds" role="group" aria-label="Kind of bet">
            {([['n', 'Single number'], ['s', 'Split (2)'], ['t', 'Street (3)'], ['q', 'Corner (4)'], ['x', 'Six line (6)']] as const).map(([k, label]) => (
              <button key={k} className={`btn tiny${kind === k ? ' primary' : ''}`} onClick={() => { setKind(k); setFirstOfSplit(null); setHint(null); }}>{label}</button>
            ))}
            {hint && <span className="note">{hint}</span>}
          </div>
        )}
        {Object.keys(mine).length > 0 && <p className="rl-mine">Your bets: {Object.entries(mine).map(([k, n]) => `${spotWords(k)} (${n})`).join(' · ')}</p>}

        <div className="cs-players">
          {(v?.order ?? []).map((p) => (
            <span key={p} className={`cs-player${playing && v && !v.ready.includes(p) ? ' to-move' : ''}`}>
              <Disc colour={p} size={14} /> {name(p)} · {v!.chips[p]}{v!.ready.includes(p) ? ' · done' : ''} <MoveTimer snap={snap} seatId={p} receivedAt={receivedAt} />
            </span>
          ))}
        </div>

        <GameActions snap={snap} send={send} minPlayers={1}>
          {betting && (
            <>
              <span className="cs-values" role="group" aria-label="Chip value">
                {VALUES.map((x) => <button key={x} className={`cs-value${value === x ? ' on' : ''}`} onClick={() => setValue(x)}>{x}</button>)}
              </span>
              <button className="btn small" disabled={!Object.keys(mine).length} onClick={() => act(send, { type: 'clear' })}>Clear</button>
              <button className="btn small primary" onClick={() => act(send, { type: 'done' })}>{Object.keys(mine).length ? 'Done' : 'Sit this spin out'}</button>
            </>
          )}
          {playing && me && v && v.ready.includes(me) && <span className="note">Waiting for the others to finish betting</span>}
        </GameActions>
      </div>
    </div>
  );
}

export const rouletteClient: GameClient = {
  id: 'roulette',
  Stage: RouletteStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as RouletteView | null;
    return v && seatId in v.chips ? <span className="piece-count">{v.chips[seatId]} chips</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: ({ value, onChange, disabled }) => {
    const c = { spins: 10, ...(value as object) } as { spins: number };
    return (
      <label className="hint">Spins: <select disabled={disabled} value={c.spins} onChange={(e) => onChange({ spins: Number(e.target.value) })}>
        {[10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
      </select> · 1,000 play chips each</label>
    );
  },
};
