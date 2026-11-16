import { useEffect, useState } from 'react';
import { CAST, QUESTIONS, openQuestions, question, type WhoView } from '../../shared/games/whodat';
import type { GameClient, StageProps } from './types';
import { Disc, GameActions, PlayerStrip } from '../kit/kit';
import { FaceCard } from './whodat-art';
import './whodat.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

function WhoStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as WhoView | null;
  const playing = snap.game.status === 'playing';
  const me = v?.you ?? null;
  const myTurn = playing && !!v && v.turn === me;
  const [guessing, setGuessing] = useState(false);
  useEffect(() => { if (!myTurn) setGuessing(false); }, [myTurn]);
  const name = (seat: string) => (seat === me ? 'You' : snap.seats.find((s) => s.id === seat)?.name ?? seat);
  const open = me && v ? openQuestions(v.asked, me) : [];

  // Your board when you play; both boards for watchers (and everyone at the end).
  const boards: string[] = v ? (me && !v.result ? [me] : ['amber', 'teal']) : [];

  return (
    <div className="wd-stage">
      <div className="wd-layout">
        <div className={`wd-boards n${boards.length || 1}`}>
          {!v && <p className="wd-wait">Each player gets a secret face from these 24. The game starts when the host starts it.</p>}
          {(v ? boards : ['amber']).map((seat) => {
            const up = v?.up[seat] ?? CAST.map(() => true);
            const mine = seat === me && !v?.result;
            return (
              <div key={seat} className="wd-board-wrap">
                {boards.length > 1 && <div className="wd-board-head"><Disc colour={seat} size={14} /> {seat === me ? 'Your board' : `${name(seat)}’s board`}</div>}
                <div className={`wd-board${guessing && mine ? ' guessing' : ''}`} role="group" aria-label={`${name(seat)}’s faces`}>
                  {CAST.map((f, i) => (
                    <FaceCard key={f.name} face={f} down={!up[i]}
                      highlight={!!v?.result && (v.secret.amber === i || v.secret.teal === i)}
                      onClick={mine && playing ? () => {
                        if (guessing) { act(send, { type: 'guess', face: i }); setGuessing(false); }
                        else act(send, { type: 'flip', face: i, up: !up[i] });
                      } : undefined}
                      label={guessing && mine ? `Name ${f.name}` : undefined} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="wd-side">
          {v && me && v.secret[me] !== undefined && (
            <div className="wd-box wd-mine">
              <FaceCard face={CAST[v.secret[me]!]} />
              <div>
                <div className="muted small">Your secret face</div>
                <strong className="wd-turn">{v.result ? (v.result.winner === me ? 'You won!' : 'You lost') : myTurn ? 'Your turn: ask or name a face' : `${name(v.turn ?? '')} is asking…`}</strong>
                <div className="muted small">{v.left[me]} of 24 faces still up on your board</div>
              </div>
            </div>
          )}
          {v && me && playing && (
            <div className="wd-box">
              <h3 className="wd-h">Ask a question</h3>
              <div className="wd-qs">
                {QUESTIONS.map((q) => {
                  const asked = !open.some((o) => o.id === q.id);
                  return <button key={q.id} className={`wd-q${asked ? ' asked' : ''}`} disabled={!myTurn || asked || guessing} onClick={() => act(send, { type: 'ask', q: q.id })}>{q.text}</button>;
                })}
              </div>
              <div className="wd-row">
                <button className={`btn small${guessing ? ' primary' : ''}`} disabled={!myTurn} aria-pressed={guessing} onClick={() => setGuessing(!guessing)}>{guessing ? 'Cancel: back to asking' : 'Name the face…'}</button>
                {guessing && <span className="muted small">Click the face you think it is. Wrong, and you lose.</span>}
              </div>
            </div>
          )}
          <div className="wd-box wd-players">
            {(['amber', 'teal'] as const).map((seat) => (
              <PlayerStrip key={seat} snap={snap} send={send} seatId={seat} receivedAt={receivedAt} toMove={playing && v?.turn === seat}
                extra={v && <span className="wd-left" title="Faces still up">{v.left[seat]}<small> up</small></span>} />
            ))}
          </div>
          <div className="wd-box">
            <h3 className="wd-h">Questions asked</h3>
            {v && (v.asked.length || v.guesses.length) ? (
              <ol className="wd-log">
                {v.guesses.map((g, i) => <li key={`g${i}`}><Disc colour={g.seat} size={12} /> {name(g.seat)} named <strong>{CAST[g.face].name}</strong>: <b className={g.right ? 'yes' : 'no'}>{g.right ? 'right' : 'wrong'}</b></li>)}
                {[...v.asked].reverse().map((a, i) => <li key={i}><Disc colour={a.seat} size={12} /> {name(a.seat)}: {question(a.q).text} <b className={a.yes ? 'yes' : 'no'}>{a.yes ? 'Yes' : 'No'}</b></li>)}
              </ol>
            ) : <p className="muted small">Nothing asked yet.</p>}
          </div>
          <GameActions snap={snap} send={send} minPlayers={2} />
        </div>
      </div>
    </div>
  );
}

export const whoDatClient: GameClient = {
  id: 'whodat',
  Stage: WhoStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as WhoView | null;
    return v ? <span className="piece-count">{v.left[seatId]} up</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: () => <p className="hint">Two players, 24 faces. Ask yes/no questions and name the other player’s face first.</p>,
};
