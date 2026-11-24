import { useEffect, useState } from 'react';
import { CREATURES, STYLES, attackValue, type Style } from '../../shared/games/realmduel';
import { STYLE_NAME, TEAM_NAMES, type BattleView } from '../../shared/games/realmbattle';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, PlayerStrip } from '../kit/kit';
import { CardBack, CreatureCard } from './realmduel';
import './realmduel.css';

const nameOf = (snap: StageProps['snap'], seat: string) => snap.seats.find((s) => s.id === seat)?.name ?? COLOURS[seat]?.label ?? seat;

function BattleStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as BattleView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const [creature, setCreature] = useState<number | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const round = v?.round ?? 1;
  useEffect(() => { setCreature(null); setStyle(null); setTarget(null); }, [round]);
  if (!v) return <div className="board-stage"><p className="rd-intro">Realm Battle: pick a creature, a style and a target; everyone fights at once.</p><GameActions snap={snap} send={send} /></div>;

  const myTeam = me !== null ? v.team[me] : 0;
  const foes = v.order.filter((p) => v.team[p] !== myTeam);
  const mates = v.order.filter((p) => v.team[p] === myTeam && p !== me);
  const choosing = playing && !!me && !v.locked[me] && !v.out.includes(me) && !v.result;
  const myHand = me ? v.hands[me] : [];
  const alive = myHand.map((f, i) => (f && f.hp > 0 ? i : -1)).filter((i) => i >= 0);
  const chosen = creature ?? (choosing && alive.length === 1 ? alive[0] : null);
  const liveFoes = foes.filter((p) => !v.out.includes(p));
  const aim = target ?? (liveFoes.length === 1 ? liveFoes[0] : null);
  const last = v.rounds.length ? v.rounds[v.rounds.length - 1] : null;
  const mine = me ? v.teamChoices[me] : undefined;
  const teamLabel = (p: string) => (v.mode === 'ffa' ? '' : ` · ${TEAM_NAMES[v.team[p]]}`);

  const side = (p: string, small: boolean) => (
    <div key={p} className={`rb-player${v.out.includes(p) ? ' out' : ''}${aim === p && choosing ? ' aimed' : ''}`}>
      <PlayerStrip snap={snap} send={send} seatId={p} toMove={playing && !v.locked[p] && !v.out.includes(p) && !v.result} receivedAt={receivedAt}
        extra={<span className="rd-locked">{v.out.includes(p) ? 'Out' : v.locked[p] && playing && !v.result ? 'Locked in' : ''}{teamLabel(p)}{v.teamChoices[p] && p !== me ? ` · ${CREATURES[v.hands[p][v.teamChoices[p].creature]!.kind].name} → ${nameOf(snap, v.teamChoices[p].target)}` : ''}</span>} />
      <div className="rd-row">
        {v.hands[p].map((f, i) => <div key={i} className={`rd-slot${small ? ' small' : ''}`}>{f ? <CreatureCard f={f} compact /> : <CardBack />}</div>)}
      </div>
    </div>
  );

  return (
    <div className="board-stage">
      <div className="rd-table rb-table">
        <section className="rb-side" aria-label="The other side">{foes.map((p) => side(p, true))}</section>

        <section className="rd-arena">
          {last ? (
            <div className="rb-log" aria-label={`Round ${last.n}`}>
              <strong>Round {last.n}</strong>
              {last.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          ) : <p className="rd-intro">Everyone secretly picks a creature, an attack style and who to attack; then they all fight at once, fastest first.</p>}
          {playing && !v.result && <p className="rd-status" role="status">{me && v.locked[me] ? `Waiting for ${v.order.filter((p) => !v.locked[p] && !v.out.includes(p)).map((p) => nameOf(snap, p)).join(', ')}…` : me && !v.out.includes(me) ? `Round ${round}: choose a creature, a style and a target.` : `Round ${round}.`}</p>}
        </section>

        {mates.length > 0 && <section className="rb-side mates" aria-label="Your team">{mates.map((p) => side(p, true))}</section>}

        {me && (
          <section className="rd-side mine" aria-label="Your creatures">
            <div className="rd-row">
              {myHand.map((f, i) => {
                if (!f) return <div key={i} className="rd-slot"><CardBack /></div>;
                const can = choosing && f.hp > 0;
                const sel = chosen === i || mine?.creature === i;
                return (
                  <button key={i} className={`rd-slot rd-pick${sel ? ' selected' : ''}${choosing && !can ? ' dim' : ''}`} disabled={!can} aria-pressed={sel}
                    aria-label={`${CREATURES[f.kind].name}, Health ${f.hp} of ${f.maxHp}`} onClick={() => setCreature(i)}>
                    <CreatureCard f={f} compact />
                  </button>
                );
              })}
            </div>
            {choosing && (
              <div className="rd-controls">
                <div className="rd-styles" role="group" aria-label="Attack style">
                  {STYLES.map((st) => {
                    const f = chosen !== null ? myHand[chosen] : null;
                    return <button key={st} className={`btn small${style === st ? ' primary' : ''}`} aria-pressed={style === st} onClick={() => setStyle(st)}>{STYLE_NAME[st]}{f ? ` ${attackValue(CREATURES[f.kind], st)}` : ''}</button>;
                  })}
                </div>
                <div className="rd-styles" role="group" aria-label="Attack whom">
                  {liveFoes.map((p) => <button key={p} className={`btn small${aim === p ? ' primary' : ''}`} aria-pressed={aim === p} onClick={() => setTarget(p)}><Disc colour={p} size={12} /> {nameOf(snap, p)}</button>)}
                </div>
                <button className="btn small primary" disabled={chosen === null || !style || !aim} onClick={() => send({ t: 'act', action: { type: 'choose', creature: chosen, style, target: aim } })}>Lock in</button>
              </div>
            )}
            {mine && playing && !v.result && <p className="rd-status">You chose {CREATURES[myHand[mine.creature]!.kind].name}, {STYLE_NAME[mine.style].toLowerCase()}, against {nameOf(snap, mine.target)}.</p>}
            <PlayerStrip snap={snap} send={send} seatId={me} toMove={choosing} receivedAt={receivedAt} extra={<span className="rd-locked">{teamLabel(me).replace(' · ', '')}</span>} />
          </section>
        )}
        <GameActions snap={snap} send={send} />
      </div>
    </div>
  );
}

function RoundsTab({ snap }: StageProps) {
  const v = snap.game.view as BattleView | null;
  if (!v || !v.rounds.length) return <p className="empty">Each round’s fights appear here.</p>;
  return (
    <div className="tab-body">
      {[...v.rounds].reverse().map((r) => (
        <div key={r.n} className="rb-log"><strong>Round {r.n}</strong>{r.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      ))}
    </div>
  );
}

export const realmBattleClient: GameClient = {
  id: 'realmbattle',
  Stage: BattleStage,
  tab: { label: 'Rounds', Component: RoundsTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as BattleView | null;
    if (!v || !(seatId in v.hands)) return <Disc colour={seatId} size={20} />;
    const left = v.hands[seatId].filter((f) => !f || f.hp > 0).length;
    return <span className="piece-count">{v.out.includes(seatId) ? 'Out' : `${left} standing`}</span>;
  },
  ConfigPicker: ({ value, onChange, disabled }) => {
    const c = { mode: '2v2', hand: 3, ...(value as object) } as { mode: string; hand: number };
    return (
      <div className="hint">
        <label>Battle: <select disabled={disabled} value={c.mode} onChange={(e) => onChange({ ...c, mode: e.target.value })}>
          <option value="2v2">2 against 2 (Amber & Violet v Teal & Rose)</option>
          <option value="3v3">3 against 3 (+ Lime v Blue)</option>
          <option value="ffa">Free-for-all (3 or 4 players)</option>
        </select></label>{' '}
        <label><select disabled={disabled} value={c.hand} onChange={(e) => onChange({ ...c, hand: Number(e.target.value) })}><option value={3}>3 creatures each</option><option value={2}>2 creatures each</option></select></label>
        <p>Bots can fill any seat.</p>
      </div>
    );
  },
};
