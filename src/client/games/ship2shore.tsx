import { useEffect, useState, type ReactNode } from 'react';
import {
  ACTIONS, CHARTS, FACTIONS, HEADINGS, ORDERS, ROLES, orderHeading, orderKind, orderName,
  type Faction, type LogEntry, type Secret, type ShipView, type TargetKind,
} from '../../shared/games/ship2shore';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, PlayerStrip } from '../kit/kit';
import { FlyIn, useLive } from '../kit/motion';
import { TIMING } from '../kit/cues';
import { FactionBadge, Marker, OrderCard, RankMarker, RoleCard, RoundToken, SeaChart } from './ship2shore-art';
import './ship2shore.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
type Name = (seat: string) => string;

const TARGET_ASK: Record<TargetKind, string> = {
  inspect: 'Kit inspection: whose kit do you inspect? Only you will see their allegiance.',
  interrogate: 'Interrogation: who is questioned? Everyone will see one faction they are not.',
  silence: 'Radio silence: who must keep quiet (and can’t become captain)?',
  sharks: 'Sharks: who goes overboard? If it’s the Fixer, the Black Market wins.',
  intercept: 'Radio intercept: who reads the last three discarded orders?',
  spotter: 'Spotter: who looks at the top order?',
};

function ShipStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as ShipView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you?.seat ?? null;
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const name: Name = (seat) => (seat === me ? 'You' : snap.seats.find((s) => s.id === seat)?.name ?? COLOURS[seat]?.label ?? seat);

  return (
    <div className="s2s-stage">
      <div className="s2s-layout">
        {/* The chart takes the full height; what you must do, then the crew
            and the log, run down a column beside it (above it on phones). */}
        <div className="s2s-box s2s-chart-box">
          <div className="s2s-chart-head">
            <strong>{v ? `Round ${v.round}` : 'The SS Marigold'}</strong>
            {v && <span className="muted small" data-fly="s2s-deck">{CHARTS[v.chart].name} · {v.deckCount} orders in the deck · mutiny needs {v.threshold} rounds</span>}
          </div>
          <SeaChart chartId={v?.chart ?? 'short'} ship={v ? v.ship : { q: 0, r: 0 }} next={!!v && !v.result} />
        </div>
        <div className="s2s-side">
          <div className="s2s-act">
            {v?.you && <RolePanel v={v} name={name} />}
            <div className="s2s-box s2s-controls" aria-live="polite">
              {!v && <p className="s2s-status">The ship sails when the host starts the game. 5 to 11 players.</p>}
              {v && <Controls v={v} send={send} name={name} playing={playing} />}
            </div>
            {v?.result && v.reveal && <Reveal v={v} name={name} />}
          </div>
          <div className="s2s-box s2s-crew">
            {order.map((p) => (
              <PlayerStrip key={p} snap={snap} send={send} seatId={p} receivedAt={receivedAt}
                toMove={playing && !!v?.waiting.includes(p)} extra={v && <CrewMarks v={v} seat={p} />} />
            ))}
          </div>
          {v?.you && v.you.secrets.length > 0 && (
            <div className="s2s-box">
              <h3 className="s2s-h">Only you know</h3>
              <ul className="s2s-secrets">
                {[...v.you.secrets].reverse().map((x, i) => <li key={i}><span className="muted">R{x.round}</span> {secretText(x, name)}</li>)}
              </ul>
            </div>
          )}
          <div className="s2s-box">
            <h3 className="s2s-h">Ship’s log</h3>
            <ShipLog v={v} name={name} />
          </div>
          <GameActions snap={snap} send={send} minPlayers={5} />
        </div>
      </div>
    </div>
  );
}

/** Your role card and who you know, with a button to hide it from anyone
 *  looking over your shoulder. */
function RolePanel({ v, name }: { v: ShipView; name: Name }) {
  const y = v.you!;
  const [hidden, setHidden] = useState(false);
  const r = ROLES[y.role];
  const bribed = y.faction === 'bm' && r.faction !== 'bm';
  const others = (xs: string[]) => xs.filter((p) => p !== y.seat);
  const list = (xs: string[]) => (xs.length ? xs.map(name).join(', ') : 'nobody');
  return (
    <div className="s2s-box s2s-role">
      {hidden ? <RoleCard role={null} width={60} /> : <RoleCard role={y.role} width={60} bribed={bribed} />}
      <div className="s2s-role-text">
        {hidden ? <p className="s2s-status">Your role is hidden.</p> : (
          <>
            <p className="s2s-status">
              You are <strong>{y.role === 'fixer' ? 'the Fixer' : y.role === 'navy' ? 'Royal Navy' : y.role === 'spy' ? 'a Spy' : 'the Smuggler'}</strong>
              {bribed && <> but you’ve been <strong>bribed</strong>: you win with the Black Market now</>}. {bribed ? ROLES.smuggler.line : r.line}
            </p>
            {y.spies && <p className="small">{others(y.spies).length ? <>Your fellow spies: <strong>{list(others(y.spies))}</strong>.</> : 'You are the only spy aboard.'}</p>}
            {y.role === 'fixer' && <p className="small">{y.partners.length ? <>On your payroll: <strong>{list(y.partners)}</strong>.</> : 'You work alone, for now. Contraband orders let you bribe others.'}</p>}
            {y.role !== 'fixer' && y.faction === 'bm' && <p className="small">The Fixer is <strong>{list(y.partners)}</strong>.</p>}
            <p className="small s2s-ammo" aria-label={`${y.ammo} rounds of ammunition`}>
              {y.ammo > 0 ? Array.from({ length: Math.min(y.ammo, 8) }, (_, i) => <RoundToken key={i} size={18} />) : <RoundToken size={18} spent />}
              <span>{y.ammo} round{y.ammo === 1 ? '' : 's'} (secret)</span>
            </p>
          </>
        )}
        <button className="btn small" onClick={() => setHidden(!hidden)}>{hidden ? 'Show my role' : 'Hide my role'}</button>
      </div>
    </div>
  );
}

/** Markers on a crew member's strip. */
function CrewMarks({ v, seat }: { v: ShipView; seat: string }) {
  const marks: ReactNode[] = [];
  if (v.captain === seat) marks.push(<RankMarker key="c" rank="captain" size={20} />);
  if (v.officer === seat) marks.push(<RankMarker key="o" rank="officer" size={20} />);
  if (v.helm === seat) marks.push(<RankMarker key="h" rank="helm" size={20} />);
  if (v.overboard.includes(seat)) marks.push(<Marker key="x" kind="sharks" size={18} />);
  if (v.silenced.includes(seat)) marks.push(<Marker key="r" kind="silence" size={18} />);
  if (v.checked.includes(seat)) marks.push(<Marker key="i" kind="inspect" size={18} />);
  if (v.offWatch.includes(seat) && v.phase === 'pick') marks.push(<Marker key="z" kind="offwatch" size={18} />);
  if (v.resigned.includes(seat)) marks.push(<Marker key="q" kind="resigned" size={18} />);
  if (v.reveal) marks.push(<FactionBadge key="f" faction={v.reveal.faction[seat]} size={20} title={`${ROLES[v.reveal.roles[seat]].title}${v.reveal.faction[seat] !== ROLES[v.reveal.roles[seat]].faction ? ', bribed' : ''}`} />);
  if (v.phase === 'vote' && v.voted.includes(seat)) marks.push(<span key="v" className="s2s-voted" title="Has voted">voted</span>);
  return <span className="s2s-marks">{marks}</span>;
}

function SeatChips({ seats, name, chosen, onPick, disabledFor }: { seats: string[]; name: Name; chosen?: string[]; onPick(s: string): void; disabledFor?: string[] }) {
  return (
    <div className="s2s-row">
      {seats.map((p) => (
        <button key={p} className={`btn small s2s-chip${chosen?.includes(p) ? ' on' : ''}`} aria-pressed={chosen?.includes(p) ?? undefined}
          disabled={disabledFor?.includes(p)} onClick={() => onPick(p)}>
          <Disc colour={p} size={16} /> {name(p)}
        </button>
      ))}
    </div>
  );
}

function Controls({ v, send, name, playing }: { v: ShipView; send: StageProps['send']; name: Name; playing: boolean }) {
  const y = v.you;
  const mine = playing && !!y?.toAct;
  const [officer, setOfficer] = useState<string | null>(null);
  const [helm, setHelm] = useState<string | null>(null);
  const [gifts, setGifts] = useState<string[]>([]);
  const [bribing, setBribing] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const live = useLive();
  const key = `${v.round}.${v.phase}.${v.captain}`;
  useEffect(() => { setOfficer(null); setHelm(null); setGifts([]); setBribing(false); setAbandoning(false); }, [key]);

  if (v.result) {
    const f = [...v.log].reverse().find((e) => e.k === 'end');
    return <p className="s2s-status">{f && f.k === 'end' && f.faction ? <><FactionBadge faction={f.faction} size={22} /> {FACTIONS[f.faction].short} wins: {v.result.reason}.</> : `The voyage is over: ${v.result.reason}.`}</p>;
  }
  if (!playing) return <p className="s2s-status">The game is paused.</p>;
  const cap = name(v.captain);
  const waiting = v.waiting.length > 1 ? `Waiting for ${v.waiting.length} players` : v.waiting.length ? `Waiting for ${name(v.waiting[0])}` : '';

  switch (v.phase) {
    case 'pick':
      if (!mine) return <p className="s2s-status"><strong>{cap}</strong> {cap === 'You' ? 'pick' : 'picks'} the bridge watch{v.mutinied ? ' after the mutiny' : ''}.</p>;
      return (
        <>
          <p className="s2s-status">You’re the captain{v.mutinied ? ' (by mutiny: no vote this round)' : ''}. Pick a <strong>first officer</strong> and a <strong>helmsman</strong>.{v.offWatch.length ? ` Off watch: ${v.offWatch.map(name).join(', ')}.` : ''}</p>
          <div className="s2s-pick"><span className="s2s-label"><RankMarker rank="officer" size={20} /> First officer</span>
            <SeatChips seats={v.choices} name={name} chosen={officer ? [officer] : []} onPick={(p) => { setOfficer(p); if (helm === p) setHelm(null); }} /></div>
          <div className="s2s-pick"><span className="s2s-label"><RankMarker rank="helm" size={20} /> Helmsman</span>
            <SeatChips seats={v.choices} name={name} chosen={helm ? [helm] : []} disabledFor={officer ? [officer] : []} onPick={setHelm} /></div>
          <button className="btn small primary" disabled={!officer || !helm} onClick={() => act(send, { type: 'pick', officer, helm })}>Send them to the bridge</button>
        </>
      );
    case 'vote': {
      const intro = <>Vote of no confidence in <strong>{cap}</strong>: first officer {name(v.officer!)}, helmsman {name(v.helm!)}. {v.threshold} rounds overthrow the captain. {v.voted.length} of {v.voted.length + v.waiting.length} have voted.</>;
      if (!mine || !y) return <p className="s2s-status">{intro} {y?.vote !== null && y?.vote !== undefined ? `You committed ${y.vote}.` : ''}</p>;
      return (
        <>
          <p className="s2s-status">{intro} Commit rounds in secret (all are shown once everyone has voted; they’re lost only if the captain falls):</p>
          <div className="s2s-row">
            {Array.from({ length: y.ammo + 1 }, (_, n) => (
              <button key={n} className={`btn small${n === 0 ? '' : ' danger'}`} onClick={() => act(send, { type: 'vote', rounds: n })}>{n === 0 ? 'Back the captain (0)' : `Commit ${n}`}</button>
            ))}
          </div>
        </>
      );
    }
    case 'tiebreak':
      if (!mine) return <p className="s2s-status">The mutiny succeeded, with a tie: {cap} picks the new captain from {v.tied.map(name).join(' and ')}.</p>;
      return <><p className="s2s-status">You’ve been overthrown, and the biggest backers tied. Who takes command?</p><SeatChips seats={v.tied} name={name} onPick={(p) => act(send, { type: 'tiebreak', target: p })} /></>;
    case 'draw':
      if (mine && y?.hand) {
        return (
          <>
            <p className="s2s-status">Plotting the course (no talking on the bridge). Keep one order; the other is discarded unseen.</p>
            <div className="s2s-cards">
              {y.hand.map((o, i) => (
                <FlyIn key={`${key}.${i}`} from="s2s-deck" live={live} flip delay={i * TIMING.deal}>
                  <button className="s2s-card-btn" onClick={() => act(send, { type: 'keep', index: i })} aria-label={`Keep ${orderName(o)}`}>
                    <OrderCard order={o} width={84} /><span>Keep</span>
                  </button>
                </FlyIn>
              ))}
            </div>
          </>
        );
      }
      return <p className="s2s-status">Plotting the course: captain {cap} and first officer {name(v.officer!)} each keep one of two orders. {waiting}.</p>;
    case 'steer':
      if (mine && y?.helmCards) {
        return (
          <>
            <p className="s2s-status">You’re at the wheel. Pick the order to <strong>discard</strong>; the ship sails on the other. You don’t know who kept which.</p>
            <div className="s2s-cards">
              {y.helmCards.map((o, i) => (
                <FlyIn key={`${key}.${i}`} from="s2s-deck" live={live} flip delay={i * TIMING.deal}>
                  <button className="s2s-card-btn" onClick={() => act(send, { type: 'steer', index: i })} aria-label={`Discard ${orderName(o)}, sail on the other`}>
                    <OrderCard order={o} width={84} /><span>Discard</span>
                  </button>
                </FlyIn>
              ))}
            </div>
            {abandoning
              ? <div className="s2s-row"><button className="btn small danger" onClick={() => act(send, { type: 'abandon' })}>Yes, jump overboard</button><button className="btn small" onClick={() => setAbandoning(false)}>Stay at the wheel</button></div>
              : <button className="btn small" onClick={() => setAbandoning(true)}>Abandon post…</button>}
          </>
        );
      }
      return <p className="s2s-status">Helmsman {name(v.helm!)} chooses which of the two orders the ship sails on.</p>;
    case 'emergency':
      if (!mine) return <p className="s2s-status">The helmsman abandoned post: {cap} picks an emergency helmsman.</p>;
      return <><p className="s2s-status">Your helmsman jumped overboard. Pick an emergency helmsman:</p><SeatChips seats={v.choices} name={name} onPick={(p) => act(send, { type: 'emergency', target: p })} /></>;
    case 'target': {
      const kind = v.target!;
      if (!mine) return <p className="s2s-status">{kind in ACTIONS ? ACTIONS[kind as keyof typeof ACTIONS].title : ORDERS[kind as 'intercept' | 'spotter'].title}: {cap} picks a player.</p>;
      return <><p className="s2s-status">{TARGET_ASK[kind]}</p><SeatChips seats={v.choices} name={name} onPick={(p) => act(send, { type: 'target', target: p })} /></>;
    }
    case 'spot':
      if (mine && y?.spotCard) {
        return (
          <>
            <p className="s2s-status">Spotter: the top order of the deck. Leave it on top, or discard it?</p>
            <div className="s2s-cards"><OrderCard order={y.spotCard} width={84} /></div>
            <div className="s2s-row"><button className="btn small" onClick={() => act(send, { type: 'spot', keep: true })}>Leave it on top</button><button className="btn small" onClick={() => act(send, { type: 'spot', keep: false })}>Discard it</button></div>
          </>
        );
      }
      return <p className="s2s-status">{name(v.spotter!)} looks at the top order.</p>;
    case 'contraband': {
      if (!y || !v.waiting.includes(y.seat)) return <p className="s2s-status">Contraband aboard: the Fixer is making a move. {waiting}.</p>;
      if (!y.fixerMove) {
        return (
          <>
            <p className="s2s-status">Contraband aboard: the Fixer is making a secret move. Everyone answers, so nobody stands out.</p>
            <button className="btn small primary" onClick={() => act(send, { type: 'ack' })}>Carry on</button>
          </>
        );
      }
      const aboard = v.order.filter((p) => !v.overboard.includes(p));
      return (
        <>
          <p className="s2s-status"><FactionBadge faction="bm" size={20} /> Contraband: your move, Fixer. Choose one:</p>
          {bribing ? (
            <>
              <p className="small">Bribe whom? (Not anyone inspected or interrogated.) They’ll learn you’re the Fixer and win with you.</p>
              {y.bribable.length ? <SeatChips seats={y.bribable} name={name} onPick={(p) => act(send, { type: 'contraband', option: 'bribe', target: p })} /> : <p className="small muted">Nobody can be bribed.</p>}
              <button className="btn small" onClick={() => setBribing(false)}>Back</button>
            </>
          ) : (
            <>
              <div className="s2s-row">
                <button className="btn small" onClick={() => setBribing(true)} disabled={!y.bribable.length}>A bribe…</button>
                <button className="btn small" onClick={() => act(send, { type: 'contraband', option: 'bridge' })}>A look at the bridge</button>
              </div>
              <p className="small">Or a cash stash: hand out up to three rounds ({gifts.length ? gifts.map(name).join(', ') : 'click players'}):</p>
              <SeatChips seats={aboard} name={name} chosen={gifts} onPick={(p) => setGifts((g) => (g.length < 3 ? [...g, p] : g))} />
              <div className="s2s-row">
                <button className="btn small primary" disabled={!gifts.length} onClick={() => act(send, { type: 'contraband', option: 'cash', gifts: gifts.join(',') })}>Hand out {gifts.length || ''} round{gifts.length === 1 ? '' : 's'}</button>
                {gifts.length > 0 && <button className="btn small" onClick={() => setGifts([])}>Clear</button>}
              </div>
            </>
          )}
        </>
      );
    }
    default:
      return null;
  }
}

/** The end: everyone's role card. */
function Reveal({ v, name }: { v: ShipView; name: Name }) {
  const r = v.reveal!;
  return (
    <div className="s2s-box">
      <h3 className="s2s-h">Who was who</h3>
      <div className="s2s-reveal">
        {v.order.map((p) => {
          const role = r.roles[p];
          const bribed = r.faction[p] !== ROLES[role].faction;
          return (
            <figure key={p} className={v.result?.placings?.[0]?.includes(p) && v.result.teamWin ? 'won' : ''}>
              <RoleCard role={role} width={56} bribed={bribed} />
              <figcaption><Disc colour={p} size={12} /> {name(p)}{v.overboard.includes(p) ? ' (in the water)' : ''}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function entryText(e: LogEntry, name: Name): ReactNode {
  const late = e.auto ? ' (out of time)' : '';
  switch (e.k) {
    case 'round': return <><strong>Round {e.n}</strong>: {name(e.captain)} {e.captain && name(e.captain) === 'You' ? 'are' : 'is'} captain.</>;
    case 'pick': return <>{name(e.seat)} picked {name(e.officer)} as first officer and {name(e.helm)} as helmsman{late}.</>;
    case 'vote': {
      const who = Object.entries(e.votes).filter(([, n]) => n > 0).map(([p, n]) => `${name(p)} ${n}`).join(', ');
      return <>Vote of no confidence: {e.total} of {e.need} rounds{who ? ` (${who})` : ''}. {e.mutiny ? <strong>Mutiny!{e.captain ? ` ${name(e.captain)} takes command.` : ''}</strong> : 'The captain stays.'}</>;
    }
    case 'tiebreak': return <>{name(e.seat)} handed command to {name(e.captain)}{late}.</>;
    case 'abandon': return <><strong>{name(e.seat)} abandoned post</strong> and jumped overboard.</>;
    case 'emergency': return <>{name(e.seat)} picked {name(e.helm)} as emergency helmsman{late}.</>;
    case 'order': return <>The ship sailed on the {HEADINGS[orderHeading(e.order)]}: <strong>{ORDERS[orderKind(e.order)].title}</strong>.</>;
    case 'resupply': return <>Resupplied: everyone aboard tops up to three rounds.</>;
    case 'action':
      if (!e.target) return <>{ACTIONS[e.action].title}: nobody could be picked.</>;
      switch (e.action) {
        case 'inspect': return <>{name(e.seat)} inspected {name(e.target)}’s kit{late}.</>;
        case 'interrogate': return <>{name(e.seat)} interrogated {name(e.target)}{late}: <strong>not {FACTIONS[e.not!].short}</strong>.</>;
        case 'silence': return <>{name(e.seat)} put {name(e.target)} under radio silence{late}.</>;
        case 'sharks': return <><strong>{name(e.seat)} threw {name(e.target)} to the sharks</strong>{late}.</>;
      }
      return null;
    case 'shoreleave': return <>Shore leave: {name(e.seat)} is relieved; {name(e.captain)} takes command.</>;
    case 'ammo': return <>{name(e.seat)} {e.delta > 0 ? 'gained a round (arms locker)' : 'lost a round, if they had one (confiscated)'}.</>;
    case 'intercept': return <>Radio intercept: {e.target ? `${name(e.target)} read the last three discards` : 'nobody'}{late}.</>;
    case 'spotter': return <>Spotter: {e.target ? `${name(e.target)} looks at the top order` : 'nobody'}{late}.</>;
    case 'spot': return <>{name(e.seat)} {e.kept ? 'left the top order there' : 'discarded the top order'}{late}.</>;
    case 'contraband': return <>Contraband: the Fixer made a secret move.</>;
    case 'resign': return <>{name(e.seat)} resigned.</>;
    case 'end': return <strong>{e.faction ? `${FACTIONS[e.faction].short} wins: ${e.reason}.` : `Nobody wins: ${e.reason}.`}</strong>;
  }
}

function secretText(x: Secret, name: Name): string {
  const f = (fa: Faction) => FACTIONS[fa].short;
  switch (x.k) {
    case 'drew': return `You drew ${x.cards.map(orderName).join(' and ')}; you kept ${orderName(x.kept)}.`;
    case 'steered': return `At the wheel you saw ${x.cards.map(orderName).join(' and ')}; the ship sailed on ${orderName(x.played)}.`;
    case 'inspect': return `Kit inspection: ${name(x.target)} is ${f(x.faction)}.`;
    case 'intercept': return x.cards.length ? `The last discards: ${x.cards.map(orderName).join(', ')}.` : 'There were no discards to read.';
    case 'spot': return `The top order was ${orderName(x.card)}; you ${x.kept ? 'left it there' : 'discarded it'}.`;
    case 'bridge': return `The bridge: ${Object.entries(x.seen).map(([p, fa]) => `${name(p)} ${f(fa)}`).join(', ')}.`;
    case 'bribe': return `You bribed ${name(x.target)}: they’re on the Black Market’s side now.`;
    case 'bribed': return `${name(x.by)} is the Fixer and bribed you: you win with the Black Market now.`;
    case 'stash': return `You handed out rounds to ${x.gifts.map(name).join(', ')}.`;
    case 'cash': return `Someone quietly handed you ${x.n} round${x.n === 1 ? '' : 's'}.`;
  }
}

function ShipLog({ v, name }: { v: ShipView | null; name: Name }) {
  const entries = (v?.log ?? []).map((e, i) => [e, i] as const).reverse();
  if (!entries.length) return <p className="empty">The Marigold waits at the start.</p>;
  return (
    <ol className="s2s-log">
      {entries.map(([e, i]) => <li key={i} className={`k-${e.k}`}>{'seat' in e ? <Disc colour={e.seat} size={12} /> : <span />}<span>{entryText(e, name)}</span></li>)}
    </ol>
  );
}

export const ship2shoreClient: GameClient = {
  id: 'ship2shore',
  Stage: ShipStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as ShipView | null;
    return v && v.order.includes(seatId) ? <CrewMarks v={v} seat={seatId} /> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">5-11 players. The short chart for 5-7, the long chart (with a resupply line) for 8-11.</p>,
};
