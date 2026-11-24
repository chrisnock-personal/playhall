import { useEffect, useState, type FormEvent } from 'react';
import {
  MAX_PLAYERS, MIN_PLAYERS, type FillBlankConfig, type FillBlankView,
} from '../../shared/games/filltheblank';
import type { GameClient, StageProps } from './types';
import { GameActions, PlayerStrip } from '../kit/kit';
import './filltheblank.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const nameOf = (snap: StageProps['snap'], seat: string) => snap.seats.find((s) => s.id === seat)?.name ?? seat;
const asText = (v: unknown) => Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : '';

function BlankStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as FillBlankView | null;
  if (!v) return <div className="board-stage"><p className="ftb-intro">Fill the Blank: one judge, five secret cards and a question with a blank.</p><GameActions snap={snap} send={send} /></div>;

  const playing = snap.game.status === 'playing';
  const me = v.you;
  const judge = v.judge;
  const isJudge = !!me && me === judge;
  const mayPlay = playing && v.phase === 'play' && !!me && me !== judge && v.due.includes(me);
  const mayPick = playing && v.phase === 'judge' && isJudge;

  return (
    <div className="board-stage">
      <div className="ftb-table">
        <div className="ftb-players">
          {v.order.map((p) => <PlayerStrip key={p} snap={snap} send={send} seatId={p} toMove={playing && v.due.includes(p)} receivedAt={receivedAt}
            extra={<span className="ftb-role">{p === judge ? 'judge' : `${v.points[p]} ${v.points[p] === 1 ? 'point' : 'points'}`}</span>} />)}
        </div>

        <div className="ftb-status" role="status">
          {v.result ? (v.result.winner ? `${nameOf(snap, v.result.winner)} wins with the most points` : `${v.result.placings?.[0]?.map((p) => nameOf(snap, p)).join(' & ')} share first`) : null}
          {!v.result && playing && `Round ${v.round} of ${v.rounds}: ${judge ? `${nameOf(snap, judge)} is the judge.` : ''}`}
          {!playing && !v.result && 'Start a game to deal the cards.'}
        </div>

        <div className="ftb-question" aria-label="The question">
          <small>The question</small>
          <strong>{v.question}</strong>
        </div>

        {me && <div className="ftb-hand">
          <small>{isJudge ? 'Your cards (you don’t play this round)' : 'Your hand'}</small>
          <div className="ftb-cards">
            {(v.hand ?? []).map((text, i) => <button key={i} className="ftb-card" disabled={!mayPlay}
              aria-label={`Card ${i + 1}: ${text}`} onClick={() => act(send, { type: 'play', card: i })}>
              {text}
            </button>)}
          </div>
          {v.played && <p className="hint">You played: <strong>{v.played}</strong></p>}
          {isJudge && v.phase === 'play' && <p className="hint">{v.due.length} {v.due.length === 1 ? 'player is' : 'players are'} still choosing a card.</p>}
          {mayPlay && <p className="hint">Pick one card to slip in. Nobody sees who played which card.</p>}
        </div>}

        {v.phase === 'judge' && <div className="ftb-readout" aria-label="The anonymous answers">
          <h3>{isJudge ? 'Pick your favourite' : 'The read-out'}</h3>
          <div className="ftb-answers">
            {v.plays.map((p) => <button key={p.label} className="ftb-answer" disabled={!mayPick}
              onClick={() => act(send, { type: 'pick', play: Number(p.label.charCodeAt(0) - 65) })}>
              <b>{p.label}</b><span>{p.text}</span>
            </button>)}
          </div>
          {!isJudge && <p className="hint">Waiting for the judge to choose.</p>}
        </div>}
        {v.phase === 'play' && !!me && !isJudge && !mayPlay && <p className="hint">Your card is in. Wait for the others.</p>}
        {v.phase === 'play' && !me && <p className="hint">Cards are being played. Watchers see the read-out when all are in.</p>}

        <GameActions snap={snap} send={send} />
      </div>
    </div>
  );
}

function ReadoutTab({ snap }: StageProps) {
  const v = snap.game.view as FillBlankView | null;
  if (!v || !v.log.length) return <p className="empty">Rounds and winning answers will appear here.</p>;
  return <div className="tab-body">{[...v.log].reverse().map((line, i) => <p key={i} className="chat-line">{line}</p>)}</div>;
}

function ConfigPicker({ value, onChange, disabled }: { value: unknown; onChange(v: unknown): void; disabled?: boolean }) {
  const c = { players: 4, questions: [], answers: [], ...(value as Partial<FillBlankConfig> | null) } as FillBlankConfig;
  const [questions, setQuestions] = useState(asText(c.questions));
  const [answers, setAnswers] = useState(asText(c.answers));
  useEffect(() => { setQuestions(asText(c.questions)); setAnswers(asText(c.answers)); }, [c.questions, c.answers]);
  return (
    <>
      <label className="field"><span>Players</span>
        <select value={c.players} disabled={disabled} onChange={(e) => onChange({ ...c, players: Number(e.target.value) })}>
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => <option key={n} value={n}>{n} players</option>)}
        </select>
      </label>
      <label className="field"><span>Your own question cards (optional)</span>
        <textarea value={questions} disabled={disabled} maxLength={4000} rows={3} placeholder={'One per line, with ___ for the blank'}
          onChange={(e: FormEvent<HTMLTextAreaElement>) => { setQuestions(e.currentTarget.value); onChange({ ...c, questions: e.currentTarget.value }); }} />
      </label>
      <label className="field"><span>Your own answer cards (optional)</span>
        <textarea value={answers} disabled={disabled} maxLength={4000} rows={3} placeholder="One per line, e.g. a rubber chicken"
          onChange={(e: FormEvent<HTMLTextAreaElement>) => { setAnswers(e.currentTarget.value); onChange({ ...c, answers: e.currentTarget.value }); }} />
      </label>
      <span className="hint">Your cards are added to our family deck, up to 80 of each. Watchers never see a player’s hand. No adult deck, bots or AI.</span>
    </>
  );
}

export const fillTheBlankClient: GameClient = {
  id: 'filltheblank',
  Stage: BlankStage,
  tab: { label: 'Read-out', Component: ReadoutTab },
  ConfigPicker,
};
