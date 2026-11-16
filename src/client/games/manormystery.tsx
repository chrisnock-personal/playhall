import { useEffect, useState } from 'react';
import {
  CARDS, OBJECTS, ROOMS, SUSPECTS, describeSuggestion, exits, passageFrom,
  type CardId, type LogEntry, type ManorView, type ObjectId, type Room, type Suspect,
} from '../../shared/games/manormystery';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, Pawn, PlayerStrip } from '../kit/kit';
import { Envelope, ManorCard } from './manormystery-art';
import './manormystery.css';

type Mark = '' | '✓' | '✗' | '?';
const CYCLE: Mark[] = ['', '✓', '✗', '?'];
const GROUPS: { title: string; cards: readonly CardId[] }[] = [
  { title: 'Who', cards: SUSPECTS }, { title: 'What', cards: OBJECTS }, { title: 'Where', cards: ROOMS },
];
const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

/** Your own notebook marks, kept in this browser per game. */
function useMarks(key: string | null) {
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  useEffect(() => {
    let saved: Record<string, Mark> = {};
    try { if (key) saved = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}; } catch { saved = {}; }
    setMarks(saved);
  }, [key]);
  const cycle = (cell: string) => setMarks((m) => {
    const next = { ...m, [cell]: CYCLE[(CYCLE.indexOf(m[cell] ?? '') + 1) % CYCLE.length] };
    if (!next[cell]) delete next[cell];
    try { if (key) localStorage.setItem(key, JSON.stringify(next)); } catch { /* private window: marks last this visit only */ }
    return next;
  });
  return [marks, cycle] as const;
}

function ManorStage(props: StageProps) {
  const { snap, send, receivedAt } = props;
  const v = snap.game.view as ManorView | null;
  const playing = snap.game.status === 'playing';
  const me = snap.you.seat && v?.order.includes(snap.you.seat) ? snap.you.seat : null;
  const order = v?.order ?? snap.seats.filter((s) => s.userId).map((s) => s.id);
  const name = (seat: string) => (seat === me ? 'You' : snap.seats.find((s) => s.id === seat)?.name ?? COLOURS[seat]?.label ?? seat);
  const myTurn = playing && !!me && v?.turn === me && !v.pending;
  const mustShow = playing ? v?.mustShow ?? null : null;
  const here = me && v ? v.positions[me] : null;
  const canMove = myTurn && !v!.moved;
  const reach = canMove && here ? exits(here) : [];

  const [suspect, setSuspect] = useState<Suspect>('hale');
  const [object, setObject] = useState<ObjectId>('hatpin');
  const [accusing, setAccusing] = useState(false);
  const [room, setRoom] = useState<Room>('observatory');
  useEffect(() => { setAccusing(false); }, [v?.turn]);
  useEffect(() => { if (here) setRoom(here); }, [here]);

  // The card shown to you after your latest suggestion.
  const lastSuggest = v ? v.log.map((e, i) => [e, i] as const).filter(([e]) => e.kind === 'suggest' && e.seat === me).pop() : undefined;
  const shownToMe = lastSuggest && v ? v.log.slice(lastSuggest[1]).find((e): e is Extract<LogEntry, { kind: 'show' }> => e.kind === 'show' && e.to === me) : undefined;
  const nobody = lastSuggest && v ? v.log.slice(lastSuggest[1]).some((e) => e.kind === 'nobody') : false;
  const latestTurnSuggest = myTurn && v?.suggested;

  return (
    <div className="mm-stage">
      <div className="mm-layout">
        <div className="mm-main">
          <HallMap v={v} me={me} reach={reach} onMove={(r) => act(send, { type: 'move', room: r })} />

          <div className="mm-box mm-controls" aria-live="polite">
            {!v && <p className="muted small">The case opens when the host starts the game. 3 to 6 players.</p>}
            {v && v.result && <p className="mm-status">The case is closed.</p>}
            {v && !v.result && mustShow && v.pending && (
              <div className="mm-show">
                <p className="mm-status"><strong>{name(v.pending.suggester)}</strong> suggested {describeSuggestion(v.pending)}. Choose a card to show them (only they will see it):</p>
                <div className="mm-cards">
                  {mustShow.map((c) => (
                    <button key={c} className="mm-card-btn" onClick={() => act(send, { type: 'show', card: c })} aria-label={`Show ${CARDS[c].title}`}>
                      <ManorCard id={c} width={64} raised />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {v && !v.result && v.pending && !mustShow && (
              <p className="mm-status">{name(v.pending.suggester)} suggested {describeSuggestion(v.pending)}. Waiting for <strong>{name(v.pending.refuter)}</strong> to choose a card to show.</p>
            )}
            {v && !v.result && !v.pending && !myTurn && v.turn && (
              <p className="mm-status">{me && v.out.includes(me) ? 'You’re out of the running, but you still show cards when asked. ' : ''}{name(v.turn)}’s turn.</p>
            )}
            {myTurn && v && here && (
              <>
                {canMove ? (
                  <>
                    <p className="mm-status">Your turn. You’re in {CARDS[here].name}: move to a room next door{passageFrom(here) ? ', or take the hidden passage' : ''}.</p>
                    <div className="mm-row">
                      {reach.map((r) => (
                        <button key={r} className="btn small" onClick={() => act(send, { type: 'move', room: r })}>
                          {r === passageFrom(here) ? '⤡ ' : ''}{CARDS[r].title}
                        </button>
                      ))}
                    </div>
                  </>
                ) : !v.suggested ? (
                  <>
                    <p className="mm-status">You’re in {CARDS[here].name}. Make a suggestion, or end your turn.</p>
                    <div className="mm-row mm-suggest">
                      <label><span className="sr-only">Suspect</span>
                        <select value={suspect} onChange={(e) => setSuspect(e.target.value as Suspect)}>{SUSPECTS.map((x) => <option key={x} value={x}>{CARDS[x].name}</option>)}</select>
                      </label>
                      <span className="muted">with</span>
                      <label><span className="sr-only">Object</span>
                        <select value={object} onChange={(e) => setObject(e.target.value as ObjectId)}>{OBJECTS.map((x) => <option key={x} value={x}>{CARDS[x].name}</option>)}</select>
                      </label>
                      <span className="muted">in {CARDS[here].name}</span>
                      <button className="btn small primary" onClick={() => act(send, { type: 'suggest', suspect, object })}>Suggest</button>
                    </div>
                  </>
                ) : (
                  <p className="mm-status">
                    {shownToMe ? <>{name(shownToMe.seat)} showed you <strong>{shownToMe.card ? CARDS[shownToMe.card].title : 'a card'}</strong>. </> : nobody ? <>Nobody could show you a card. </> : null}
                    Accuse now, or end your turn.
                  </p>
                )}
                {shownToMe?.card && latestTurnSuggest && <div className="mm-cards"><ManorCard id={shownToMe.card} width={64} /></div>}
                {accusing ? (
                  <div className="mm-accuse" role="group" aria-label="Accuse">
                    <p className="mm-status"><strong>Accuse:</strong> one accusation per game. If you’re wrong, you’re out of the running.</p>
                    <div className="mm-row">
                      <select aria-label="Who" value={suspect} onChange={(e) => setSuspect(e.target.value as Suspect)}>{SUSPECTS.map((x) => <option key={x} value={x}>{CARDS[x].name}</option>)}</select>
                      <select aria-label="With what" value={object} onChange={(e) => setObject(e.target.value as ObjectId)}>{OBJECTS.map((x) => <option key={x} value={x}>{CARDS[x].name}</option>)}</select>
                      <select aria-label="Where" value={room} onChange={(e) => setRoom(e.target.value as Room)}>{ROOMS.map((x) => <option key={x} value={x}>{CARDS[x].name}</option>)}</select>
                    </div>
                    <div className="mm-row">
                      <button className="btn small danger" onClick={() => { act(send, { type: 'accuse', suspect, object, room }); setAccusing(false); }}>Accuse: it was {CARDS[suspect].name}, with {CARDS[object].name}, in {CARDS[room].name}</button>
                      <button className="btn small" onClick={() => setAccusing(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mm-row">
                    <button className="btn small" onClick={() => setAccusing(true)}>Accuse…</button>
                    {v.moved && <button className="btn small" onClick={() => act(send, { type: 'end' })}>End turn</button>}
                  </div>
                )}
              </>
            )}
            {v?.result && v.envelope && (
              <div className="mm-solution">
                <Envelope open width={56} />
                <div>
                  <p className="mm-status">It was <strong>{describeSuggestion(v.envelope)}</strong>.</p>
                  <div className="mm-cards">{[v.envelope.suspect, v.envelope.object, v.envelope.room].map((c) => <ManorCard key={c} id={c} width={58} />)}</div>
                </div>
              </div>
            )}
          </div>

          {v?.hand && (
            <div className="mm-box">
              <h3 className="mm-h">Your cards</h3>
              <div className="mm-cards">{v.hand.map((c) => <ManorCard key={c} id={c} width={64} />)}</div>
            </div>
          )}
          {v && Object.keys(v.faceUp).length > 0 && (
            <div className="mm-box">
              <h3 className="mm-h">Face up (resigned players)</h3>
              {Object.entries(v.faceUp).map(([p, cards]) => (
                <div key={p} className="mm-faceup"><Disc colour={p} size={16} /> {name(p)}
                  <div className="mm-cards">{cards.map((c) => <ManorCard key={c} id={c} width={44} />)}</div>
                </div>
              ))}
            </div>
          )}
          {v?.result && v.hands && (
            <div className="mm-box">
              <h3 className="mm-h">Everyone’s cards</h3>
              {v.order.map((p) => (
                <div key={p} className="mm-faceup"><Disc colour={p} size={16} /> {name(p)}
                  <div className="mm-cards">{v.hands![p].map((c) => <ManorCard key={c} id={c} width={40} />)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mm-side">
          <div className="mm-box mm-players">
            {order.map((p) => (
              <PlayerStrip key={p} snap={snap} send={send} seatId={p} receivedAt={receivedAt}
                toMove={playing && (v?.pending ? v.pending.refuter === p : v?.turn === p)}
                extra={v && (
                  <span className="piece-count">
                    {v.counts[p]} cards · {CARDS[v.positions[p]].title}
                    {v.resigned.includes(p) ? ' · resigned' : v.out.includes(p) ? ' · out' : ''}
                  </span>
                )} />
            ))}
            {!v?.result && (
              <div className="mm-envelope-row"><Envelope width={44} /><span className="muted small">The envelope: who, what and where.</span></div>
            )}
          </div>
          <Notebook v={v} me={me} roomId={snap.room.id} name={name} />
          <div className="mm-box">
            <h3 className="mm-h">What’s happened</h3>
            <CaseLog v={v} name={name} me={me} />
          </div>
          <GameActions snap={snap} send={send} minPlayers={3} />
        </div>
      </div>
    </div>
  );
}

/** The plan of Blackthorn Hall: nine rooms, doors between neighbours, two
 *  hidden passages between opposite corners, and everyone's pawn. */
function HallMap({ v, me, reach, onMove }: { v: ManorView | null; me: string | null; reach: Room[]; onMove(r: Room): void }) {
  return (
    <div className="mm-map" role="group" aria-label="The plan of Blackthorn Hall">
      {ROOMS.map((r, i) => {
        const pawns = v ? v.order.filter((p) => v.positions[p] === r) : [];
        const canGo = reach.includes(r);
        const mine = !!me && v?.positions[me] === r;
        const passage = passageFrom(r);
        const label = `${CARDS[r].title}${mine ? ', you are here' : ''}${pawns.length ? `: ${pawns.map((p) => COLOURS[p]?.label ?? p).join(', ')}` : ''}${canGo ? '. Move here' : ''}`;
        const content = (
          <>
            <span className="mm-room-name">{CARDS[r].title}</span>
            {passage && <span className={`mm-passage c${i}`} title={`Hidden passage to ${CARDS[passage].name}`}>⤡ {CARDS[passage].title}</span>}
            {i % 3 < 2 && <span className="mm-door right" aria-hidden="true" />}
            {i < 6 && <span className="mm-door down" aria-hidden="true" />}
            <span className="mm-pawns">{pawns.map((p) => <Pawn key={p} colour={p} size={22} />)}</span>
          </>
        );
        const cls = `mm-room${mine ? ' here' : ''}${canGo ? ' reach' : ''}`;
        return canGo
          ? <button key={r} className={cls} aria-label={label} onClick={() => onMove(r)}>{content}</button>
          : <div key={r} className={cls} aria-label={label} role="img">{content}</div>;
      })}
    </div>
  );
}

function entryText(e: LogEntry, name: (s: string) => string, me: string | null): string {
  const late = e.auto ? ' (out of time)' : '';
  switch (e.kind) {
    case 'move': return `moved to ${CARDS[e.room].name}${late}`;
    case 'suggest': return `suggested ${describeSuggestion(e)}`;
    case 'pass': return 'couldn’t show a card';
    case 'show':
      if (e.to === me) return `showed you ${e.card ? CARDS[e.card].title : 'a card'}${late}`;
      if (e.seat === me) return `showed ${name(e.to)} ${e.card ? CARDS[e.card].title : 'a card'}${late}`;
      return `showed ${name(e.to)} a card${late}`;
    case 'nobody': return 'nobody could show them a card';
    case 'accuse': return `accused ${describeSuggestion(e)}: ${e.right ? 'right! Case solved' : 'wrong, out of the running'}`;
    case 'end': return `ended the turn${late}`;
    case 'resign': return 'resigned: their cards are face up';
  }
}

function CaseLog({ v, name, me }: { v: ManorView | null; name: (s: string) => string; me: string | null }) {
  const entries = (v?.log ?? []).map((e, i) => [e, i] as const).filter(([e]) => e.kind !== 'end' || e.auto).reverse();
  if (!entries.length) return <p className="empty">Nothing yet. Everyone starts in the Chapel.</p>;
  return (
    <ol className="mm-log">
      {entries.map(([e, i]) => (
        <li key={i} className={`k-${e.kind}${e.kind === 'show' && (e.to === me || e.seat === me) ? ' private' : ''}`}>
          <Disc colour={e.seat} size={14} /><span><strong>{name(e.seat)}</strong> {entryText(e, name, me)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Your private notebook: what the game knows you've seen (bold, fixed),
 *  plus your own ✓ ✗ ? marks, kept in this browser. */
function Notebook({ v, me, roomId, name }: { v: ManorView | null; me: string | null; roomId: string; name: (s: string) => string }) {
  const [marks, cycle] = useMarks(v && me ? `playhall.manormystery.${roomId}.${v.key}.${me}` : null);
  if (!v || !me || !v.notebook) return null;
  const nb = v.notebook;
  return (
    <div className="mm-box mm-notebook">
      <h3 className="mm-h">Your notebook</h3>
      <p className="hint">Bold marks are what you’ve seen. Click a square to add your own ✓ ✗ ?</p>
      <table>
        <thead>
          <tr><th scope="col"><span className="sr-only">Card</span></th>{v.order.map((p) => <th key={p} scope="col" title={name(p)}><Disc colour={p} size={14} /><span className="sr-only">{name(p)}</span></th>)}</tr>
        </thead>
        {GROUPS.map((g) => (
          <tbody key={g.title}>
            <tr className="mm-group"><th colSpan={v.order.length + 1} scope="rowgroup">{g.title}</th></tr>
            {g.cards.map((c) => {
              const row = nb[c] ?? {};
              const solved = v.order.every((p) => row[p] === 'no');
              const held = v.order.some((p) => row[p] === 'yes');
              return (
                <tr key={c} className={solved ? 'solved' : held ? 'held' : ''}>
                  <th scope="row" title={solved ? 'Nobody holds it: it’s in the envelope' : undefined}>{CARDS[c].title}{solved ? ' ✉' : ''}</th>
                  {v.order.map((p) => {
                    const auto = row[p] === 'yes' ? '✓' : row[p] === 'no' ? '✗' : '';
                    const mark = marks[`${c}:${p}`] ?? '';
                    return (
                      <td key={p}>
                        {auto
                          ? <span className={`mm-mark auto ${auto === '✓' ? 'yes' : 'no'}`} aria-label={`${name(p)}: ${auto === '✓' ? 'has it' : 'doesn’t have it'}`}>{auto}</span>
                          : <button className={`mm-mark${mark === '✓' ? ' yes' : mark === '✗' ? ' no' : mark === '?' ? ' maybe' : ''}`} onClick={() => cycle(`${c}:${p}`)}
                            aria-label={`${CARDS[c].title}, ${name(p)}: ${mark || 'no mark'}`}>{mark}</button>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export const manorMysteryClient: GameClient = {
  id: 'manormystery',
  Stage: ManorStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as ManorView | null;
    return v && seatId in v.counts
      ? <span className="piece-count">{v.counts[seatId]} cards{v.out.includes(seatId) ? ' · out' : ''}</span>
      : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">3-6 players. Blackthorn Hall: six suspects, six objects, nine rooms.</p>,
};
