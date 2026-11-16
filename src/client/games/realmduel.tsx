import { useEffect, useState, type ReactElement } from 'react';
import {
  CREATURES, STYLES, STYLE_NAME, attackValue,
  type CreatureId, type Element, type FighterView, type Pick, type RealmView, type RoundView, type Style,
} from '../../shared/games/realmduel';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, PlayerStrip } from '../kit/kit';
import './realmduel.css';

/** Each element's colour; the icon's shape and the written name carry it without colour too. */
const ELEMENT: Record<Element, { colour: string; name: string }> = {
  fire: { colour: '#D9582B', name: 'Fire' },
  water: { colour: '#2F6FB5', name: 'Water' },
  earth: { colour: '#7B8B3A', name: 'Earth' },
  air: { colour: '#5FB3CC', name: 'Air' },
  light: { colour: '#D9A920', name: 'Light' },
  shadow: { colour: '#5A4686', name: 'Shadow' },
};

const ICON: Record<Element, ReactElement> = {
  fire: <path d="M12 4c1 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.4 2.2-4.4.1 2 1 3.2 2.3 3.4-.9-3-.4-6 0-8.5z" />,
  water: <path d="M12 4c3.2 4.2 5.2 7.2 5.2 10a5.2 5.2 0 0 1-10.4 0c0-2.8 2-5.8 5.2-10z" />,
  earth: <path d="M3.5 18.5l5.5-9 3.2 4.6 2.3-3.3 6 7.7z" />,
  air: <g fill="none" strokeWidth="2" strokeLinecap="round"><path d="M4 9h9.5a2.5 2.5 0 1 0-2.5-2.5" /><path d="M4 13h13a2.5 2.5 0 1 1-2.5 2.5" /><path d="M4 17h6" /></g>,
  light: <g strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.6" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M12 3.5v2.5" transform={`rotate(${a} 12 12)`} />)}</g>,
  shadow: <path d="M15.5 4.5a7.5 7.5 0 1 0 4 13.2A6.4 6.4 0 0 1 15.5 4.5z" />,
};

export function ElementIcon({ element, size = 20 }: { element: Element; size?: number }) {
  return (
    <svg className="rd-icon" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={ELEMENT[element].name}>
      <circle cx="12" cy="12" r="11.5" fill={ELEMENT[element].colour} />
      <g fill="#FBF8F1" stroke="#FBF8F1">{ICON[element]}</g>
    </svg>
  );
}

/** Simple silhouettes, Playhall's own, in the element's colour. */
function CreatureArt({ kind }: { kind: CreatureId }) {
  const c = ELEMENT[CREATURES[kind].element].colour;
  const dark = 'rgba(0,0,0,.38)';
  const eye = '#FBF8F1';
  const art: Record<CreatureId, ReactElement> = {
    emberfox: (
      <>
        <path d="M58 46c10-2 16-10 14-20-3 6-8 8-12 8z" fill={c} opacity=".7" />
        <path d="M18 8l8 14h28l8-14-4 22-22 20-22-20z" fill={c} />
        <path d="M22 13l5 9h-3zM58 13l-5 9h3z" fill={dark} />
        <path d="M32 38l8 10 8-10-8 3z" fill="#FBF8F1" />
        <circle cx="40" cy="47" r="2.5" fill="#2A2219" />
        <ellipse cx="31" cy="30" rx="2.6" ry="1.8" fill={eye} /><ellipse cx="49" cy="30" rx="2.6" ry="1.8" fill={eye} />
      </>
    ),
    tidecaller: (
      <>
        <path d="M30 52c-6-10 2-16 10-20s10-12 4-18" fill="none" stroke={c} strokeWidth="9" strokeLinecap="round" />
        <path d="M38 6c8-2 16 4 14 11-4 0-9-1-14-4z" fill={c} />
        <path d="M43 5l-4-4M47 5l-1-5M51 7l2-5" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="47" cy="11" r="1.8" fill={eye} />
        <path d="M4 52c5-5 9-5 14 0s9 5 14 0 9-5 14 0 9 5 14 0 9-5 16 0" fill="none" stroke={c} strokeWidth="3" opacity=".7" />
      </>
    ),
    stonehorn: (
      <>
        <path d="M14 42c-4-14 4-26 22-26 14 0 22 6 26 14l10 2c2 6-2 12-10 12H18z" fill={c} />
        <path d="M66 31l8-16-1 18z" fill={dark} />
        <path d="M24 22l6 6M36 18l4 7M48 20l2 7" stroke={dark} strokeWidth="2" strokeLinecap="round" />
        <rect x="20" y="42" width="8" height="10" rx="2" fill={c} /><rect x="48" y="42" width="8" height="10" rx="2" fill={c} />
        <circle cx="62" cy="34" r="2" fill={eye} />
      </>
    ),
    galewing: (
      <>
        <path d="M40 30L4 10l12 16-10 2 22 6zM40 30l36-20-12 16 10 2-22 6z" fill={c} />
        <ellipse cx="40" cy="34" rx="7" ry="13" fill={c} />
        <path d="M34 46l6 8 6-8z" fill={c} opacity=".8" />
        <circle cx="40" cy="22" r="6" fill={c} /><path d="M40 25l-3 5h6z" fill={dark} />
        <circle cx="37.5" cy="21" r="1.4" fill={eye} /><circle cx="42.5" cy="21" r="1.4" fill={eye} />
      </>
    ),
    lumenstag: (
      <>
        <g stroke={c} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M34 22C28 14 26 8 28 2M30 12l-8-4M28 6l-6 0" />
          <path d="M46 22c6-8 8-14 6-20M50 12l8-4M52 6l6 0" />
        </g>
        <path d="M30 22c4-2 16-2 20 0l-2 16-8 14-8-14z" fill={c} />
        <path d="M26 24l-8-2 8 8zM54 24l8-2-8 8z" fill={c} />
        <circle cx="35" cy="30" r="1.9" fill={eye} /><circle cx="45" cy="30" r="1.9" fill={eye} />
        <path d="M37 47l3 4 3-4z" fill={dark} />
      </>
    ),
    duskmaw: (
      <>
        <path d="M10 22l14-16 6 10h20l6-10 14 16-6 8H16z" fill={c} />
        <path d="M16 34h48l-10 18H26z" fill={c} />
        <path d="M16 30h48l-2 4H18z" fill={dark} />
        <path d="M22 30l3 7 3-7zM52 30l3 7 3-7zM30 34l2 5 2-5zM46 34l2 5 2-5z" fill="#FBF8F1" />
        <path d="M26 21l8 3-8 1zM54 21l-8 3 8 1z" fill="#E7D36A" />
      </>
    ),
  };
  return (
    <svg className="rd-art" viewBox="0 0 80 56" aria-hidden="true">
      <rect x="0" y="0" width="80" height="56" fill={c} opacity=".14" />
      {art[kind]}
    </svg>
  );
}

/** The violet back with the logo's arch (the playing cards' back is amber). */
function CardBack() {
  return (
    <svg className="rd-back" viewBox="0 0 70 100" role="img" aria-label="A face-down creature">
      <rect x="1" y="1" width="68" height="98" rx="7" fill="#2A2140" stroke="#9B7BE0" strokeWidth="2" />
      <rect x="6" y="6" width="58" height="88" rx="4" fill="none" stroke="#4A3B72" strokeWidth="1.5" />
      <path d="M22 66V46a13 13 0 0 1 26 0v20" fill="none" stroke="#9B7BE0" strokeWidth="4" strokeLinecap="round" />
      <circle cx="35" cy="47" r="4" fill="#C9B6F2" />
      <path d="M31.5 52h7l2 9h-11z" fill="#C9B6F2" />
    </svg>
  );
}

function HealthBar({ hp, max, from }: { hp: number; max: number; from?: number }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const lost = from !== undefined && from > hp ? ((from - hp) / max) * 100 : 0;
  const level = hp <= 0 ? 'out' : pct < 25 ? 'low' : pct < 50 ? 'mid' : 'high';
  return (
    <div className={`rd-hp ${level}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label={`Health ${hp} of ${max}`}>
      <span className="fill" style={{ width: `${pct}%` }} />
      {lost > 0 && <span className="lost" style={{ left: `${pct}%`, width: `${lost}%` }} />}
    </div>
  );
}

function Effects({ f }: { f: FighterView }) {
  if (f.hp <= 0) return <div className="rd-effects"><span className="rd-fx ko">Knocked out</span></div>;
  const list = [f.poison > 0 && <span key="p" className="rd-fx poison">☠ Poisoned · {f.poison} left</span>, f.stunned && <span key="s" className="rd-fx stun">✦ Stunned</span>, f.shielded && <span key="h" className="rd-fx shield">⛨ Shielded</span>].filter(Boolean);
  return list.length ? <div className="rd-effects">{list}</div> : null;
}

/** A creature in the kit's card frame: cream face, art, element, Health and stats. */
export function CreatureCard({ f, compact, from }: { f: FighterView; compact?: boolean; from?: number }) {
  const c = CREATURES[f.kind];
  return (
    <div className={`rd-card${compact ? ' compact' : ''}${f.hp <= 0 ? ' ko' : ''}`} style={{ ['--el' as string]: ELEMENT[c.element].colour }}>
      <div className="rd-card-head"><strong>{c.name}</strong><ElementIcon element={c.element} size={compact ? 16 : 20} /></div>
      <CreatureArt kind={f.kind} />
      <div className="rd-card-sub">{ELEMENT[c.element].name} · <span title={c.abilityText}>{c.abilityName}</span></div>
      <HealthBar hp={f.hp} max={f.maxHp} from={from} />
      <div className="rd-hp-text">{f.hp} / {f.maxHp}</div>
      {!compact && (
        <dl className="rd-stats">
          <div><dt>STR</dt><dd>{c.str}</dd></div><div><dt>AGI</dt><dd>{c.agi}</dd></div><div><dt>INT</dt><dd>{c.int}</dd></div>
          <div><dt>DEF</dt><dd>{c.def}</dd></div><div><dt>MAG</dt><dd>{c.mag}</dd></div>
        </dl>
      )}
      {!compact && <div className="rd-ability">{c.abilityText}</div>}
      <Effects f={f} />
    </div>
  );
}

const nameOf = (snap: StageProps['snap'], seat: string) => snap.seats.find((s) => s.id === seat)?.name ?? COLOURS[seat]?.label ?? seat;

/** One side of the last round's reveal. */
function RevealSide({ seat, pick, first, snap }: { seat: string; pick: Pick; first: boolean; snap: StageProps['snap'] }) {
  const c = CREATURES[pick.kind];
  const f: FighterView = { kind: pick.kind, hp: pick.hpAfter, maxHp: c.hp, poison: 0, stunned: false, shielded: false, revealed: true };
  return (
    <div className="rd-reveal-side">
      <div className="rd-reveal-who"><Disc colour={seat} size={16} /><span>{nameOf(snap, seat)}</span>{first && <span className="rd-tag">First strike</span>}</div>
      <CreatureCard f={f} compact from={pick.hpBefore} />
      <div className="rd-style">{STYLE_NAME[pick.style]}</div>
      <div className="rd-dealt">
        {pick.missed === 'stunned' ? 'Stunned: no attack' : pick.missed === 'knocked out' ? 'Knocked out before striking' : <>Hit for <strong>{pick.dealt}</strong>{pick.advantage ? ' (element +50%)' : ''}</>}
      </div>
    </div>
  );
}

function Reveal({ round, bottom, top, snap }: { round: RoundView; bottom: string; top: string; snap: StageProps['snap'] }) {
  return (
    <div className="rd-reveal" aria-live="polite">
      <div className="rd-reveal-title">Round {round.n}</div>
      <div className="rd-reveal-pair">
        <RevealSide seat={bottom} pick={round.picks[bottom]} first={round.first === bottom} snap={snap} />
        <span className="rd-vs" aria-hidden="true">vs</span>
        <RevealSide seat={top} pick={round.picks[top]} first={round.first === top} snap={snap} />
      </div>
      <ul className="rd-lines">{round.lines.slice(1).map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

function RealmStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as RealmView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? (snap.you.seat === 'amber' || snap.you.seat === 'teal' ? snap.you.seat : null);
  const bottom = me ?? 'amber';
  const top = bottom === 'amber' ? 'teal' : 'amber';
  const [creature, setCreature] = useState<number | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const round = v?.round ?? 1;
  useEffect(() => { setCreature(null); setStyle(null); }, [round]);

  const mine = v?.mine ?? null;
  const choosing = playing && !!me && !!v && !v.locked[me] && !v.result;
  const myHand = v?.hands[bottom] ?? [];
  const foeHand = v?.hands[top] ?? [];
  const last = v?.rounds.length ? v.rounds[v.rounds.length - 1] : null;
  // A lone creature standing is picked for you.
  const alive = myHand.map((f, i) => (f && f.hp > 0 ? i : -1)).filter((i) => i >= 0);
  const chosen = creature ?? (choosing && alive.length === 1 ? alive[0] : null);
  const lockIn = () => { if (chosen !== null && style) send({ t: 'act', action: { type: 'choose', creature: chosen, style } }); };

  let status: string | null = null;
  if (playing && v && !v.result) {
    if (me && v.locked[me]) status = v.locked[top] ? null : `Waiting for ${nameOf(snap, top)} to choose…`;
    else if (me) status = `Round ${round}: choose a creature and an attack style, then Lock in.${v.locked[top] ? ` ${nameOf(snap, top)} has locked in.` : ''}`;
    else status = `Round ${round}: ${[bottom, top].map((p) => `${nameOf(snap, p)} ${v.locked[p] ? 'has locked in' : 'is choosing'}`).join(', ')}.`;
  }

  return (
    <div className="board-stage">
      <div className="rd-table">
        <section className="rd-side" aria-label={`${nameOf(snap, top)}’s creatures`}>
          <PlayerStrip snap={snap} send={send} seatId={top} toMove={playing && !!v && !v.locked[top] && !v.result} receivedAt={receivedAt}
            extra={v?.locked[top] && playing && !v.result ? <span className="rd-locked">Locked in</span> : undefined} />
          <div className="rd-row">
            {foeHand.map((f, i) => <div key={i} className="rd-slot small">{f ? <CreatureCard f={f} compact /> : <CardBack />}</div>)}
          </div>
        </section>

        <section className="rd-arena">
          {last && top in last.picks ? <Reveal round={last} bottom={bottom} top={top} snap={snap} />
            : <p className="rd-intro">{v ? 'Both players secretly choose a creature and how it attacks. Both choices are revealed together.' : 'Realm Duel: secretly choose a creature and an attack style each round; last with creatures standing wins.'}</p>}
          {status && <p className="rd-status" role="status">{status}</p>}
        </section>

        <section className="rd-side mine" aria-label={me ? 'Your creatures' : `${nameOf(snap, bottom)}’s creatures`}>
          <div className="rd-row">
            {myHand.map((f, i) => {
              if (!f) return <div key={i} className="rd-slot"><CardBack /></div>;
              const can = choosing && f.hp > 0;
              const sel = chosen === i || (mine?.creature === i);
              return (
                <button key={i} className={`rd-slot rd-pick${sel ? ' selected' : ''}${choosing && !can ? ' dim' : ''}`} disabled={!can}
                  aria-pressed={sel} aria-label={`${CREATURES[f.kind].name}, Health ${f.hp} of ${f.maxHp}`} onClick={() => setCreature(i)}>
                  <CreatureCard f={f} />
                </button>
              );
            })}
          </div>
          {choosing && (
            <div className="rd-controls">
              <div className="rd-styles" role="group" aria-label="Attack style">
                {STYLES.map((st) => {
                  const f = chosen !== null ? myHand[chosen] : null;
                  return (
                    <button key={st} className={`btn small${style === st ? ' primary' : ''}`} aria-pressed={style === st} onClick={() => setStyle(st)}>
                      {STYLE_NAME[st]}{f ? ` ${attackValue(CREATURES[f.kind], st)}` : ''}
                    </button>
                  );
                })}
              </div>
              <button className="btn small primary" disabled={chosen === null || !style} onClick={lockIn}>Lock in</button>
            </div>
          )}
          {mine && playing && <p className="rd-status">You chose {CREATURES[myHand[mine.creature]!.kind].name}, {STYLE_NAME[mine.style].toLowerCase()}.</p>}
          <PlayerStrip snap={snap} send={send} seatId={bottom} toMove={playing && !!v && !v.locked[bottom] && !v.result} receivedAt={receivedAt}
            extra={v?.locked[bottom] && playing && !v.result ? <span className="rd-locked">Locked in</span> : undefined} />
        </section>

        <GameActions snap={snap} send={send} />
      </div>
    </div>
  );
}

function RoundsTab({ snap }: StageProps) {
  const v = snap.game.view as RealmView | null;
  if (!v?.rounds.length) return <p className="empty">No rounds fought yet.</p>;
  return (
    <ol className="rd-log">
      {[...v.rounds].reverse().map((r) => (
        <li key={r.n}>
          <strong>Round {r.n}</strong>
          <ul>{r.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </li>
      ))}
    </ol>
  );
}

export const realmDuelClient: GameClient = {
  id: 'realmduel',
  Stage: RealmStage,
  tab: { label: 'Rounds', Component: RoundsTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as RealmView | null;
    const hand = v?.hands[seatId];
    if (!hand) return <Disc colour={seatId} size={20} />;
    const up = hand.filter((f) => !f || f.hp > 0).length;
    return <span className="piece-count">{up} of {hand.length} standing</span>;
  },
  ConfigPicker: ({ value, onChange, disabled }) => (
    <label className="field"><span>Creatures each</span>
      <select value={(value as { hand?: number })?.hand ?? 3} disabled={disabled} onChange={(e) => onChange({ hand: Number(e.target.value) })}>
        <option value={3}>Three, drawn at random from the six</option>
        <option value={6}>All six</option>
      </select>
    </label>
  ),
};
