import { useEffect, useState, type FormEvent } from 'react';
import { CATEGORIES, CATEGORY_LABEL, MAX_PLAYERS, MIN_PLAYERS, QUESTION_MAX, type WhatAmIConfig, type WhatAmIView } from '../../shared/games/whatami';
import type { GameClient, StageProps } from './types';
import { GameActions, PlayerStrip } from '../kit/kit';
import './whatami.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });
const nameOf = (snap: StageProps['snap'], seat: string) => snap.seats.find((s) => s.id === seat)?.name ?? seat;

function WhatAmIStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as WhatAmIView | null;
  const round = v?.round ?? 0;
  const phase = v?.phase ?? 'question';
  const [question, setQuestion] = useState('');
  const [guess, setGuess] = useState('');
  useEffect(() => { setQuestion(''); setGuess(''); }, [round, phase]);
  if (!v) return <div className="board-stage"><p className="wa-intro">What Am I?: everyone sees your word but you. Ask the table questions and guess it.</p><GameActions snap={snap} send={send} /></div>;

  const playing = snap.game.status === 'playing';
  const me = v.you;
  const asker = v.guesser;
  const isAsker = !!me && me === asker;
  const canAsk = playing && isAsker && v.phase === 'question';
  const canGuess = canAsk && v.roundQuestions > 0;
  const canAnswer = !!me && playing && v.phase === 'answers' && me !== asker && !v.answers[me];
  const waiting = v.due.length;

  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim()) act(send, { type: 'question', text: question.trim() });
  };
  const submitGuess = (e: FormEvent) => {
    e.preventDefault();
    if (guess.trim()) act(send, { type: 'guess', word: guess.trim() });
  };

  return (
    <div className="board-stage">
      <div className="wa-table">
        <div className="wa-players">
          {v.order.map((p) => <PlayerStrip key={p} snap={snap} send={send} seatId={p} toMove={playing && v.due.includes(p)} receivedAt={receivedAt}
            extra={<span className="wa-role">{p === asker ? 'hidden word · asking' : v.words[p] ? `sees ${v.words[p]}` : 'word hidden'}</span>} />)}
        </div>

        <div className="wa-status" role="status">
          {v.result ? (v.result.nobodyWins ? 'Nobody guessed their word' : `${nameOf(snap, v.result.placings?.[0]?.[0] ?? v.order[0])} led with the fewest questions`) : null}
          {!v.result && playing && `Round ${v.round} of ${v.order.length}: ${asker ? `${nameOf(snap, asker)} is trying to guess their word.` : ''}`}
          {!playing && !v.result && 'Start a game to hand out the words.'}
        </div>

        <div className="wa-words" aria-label="The words">
          {v.order.map((p) => {
            const word = v.words[p];
            return <div key={p} className={`wa-card${p === asker ? ' asking' : ''}${word ? '' : ' masked'}`}>
              <strong>{nameOf(snap, p)}</strong>
              <span>{word ?? 'Your word'}</span>
              {v.correct[p] !== undefined && <small>guessed in {v.correct[p]} {v.correct[p] === 1 ? 'question' : 'questions'}</small>}
            </div>;
          })}
        </div>

        {v.phase === 'answers' && <div className="wa-answers">
          <p><strong>{v.question}</strong> — {waiting ? `waiting for ${waiting} ${waiting === 1 ? 'answer' : 'answers'}` : 'all answers in'}</p>
          <div className="wa-tallies">
            {v.order.filter((p) => p !== asker).map((p) => <span key={p} className={v.answers[p] ? `answered ${v.answers[p]}` : ''}>{nameOf(snap, p)}: {v.answers[p] ?? '…'}</span>)}
          </div>
          {canAnswer && <div className="wa-buttons">
            {(['yes', 'no', 'maybe'] as const).map((answer) => <button key={answer} className="btn" onClick={() => act(send, { type: 'answer', answer })}>{answer}</button>)}
          </div>}
          {me && !canAnswer && me !== asker && v.answers[me] && <p className="hint">You answered {v.answers[me]}.</p>}
        </div>}

        {canAsk && <>
          <form className="wa-form" onSubmit={ask}>
            <label className="sr-only" htmlFor="wa-question">Your question</label>
            <input id="wa-question" value={question} maxLength={QUESTION_MAX} placeholder="Ask the table a question" onChange={(e) => setQuestion(e.target.value)} />
            <button className="btn primary" disabled={!question.trim()}>Ask</button>
          </form>
          {canGuess && <form className="wa-form" onSubmit={submitGuess}>
            <label className="sr-only" htmlFor="wa-guess">Your guess</label>
            <input id="wa-guess" value={guess} maxLength={24} placeholder="What's your word?" onChange={(e) => setGuess(e.target.value)} />
            <button className="btn" disabled={!guess.trim()}>Guess</button>
          </form>}
        </>}
        {canAsk && v.roundQuestions === 0 && <p className="hint">Ask at least one question before guessing.</p>}
        {isAsker && v.phase === 'answers' && <p className="hint">Wait for everyone to answer, then ask again or guess.</p>}

        <GameActions snap={snap} send={send} />
      </div>
    </div>
  );
}

function LogTab({ snap }: StageProps) {
  const v = snap.game.view as WhatAmIView | null;
  if (!v || !v.log.length) return <p className="empty">Questions and guesses will appear here.</p>;
  return <div className="tab-body">{[...v.log].reverse().map((line, i) => <p key={i} className="chat-line">{line}</p>)}</div>;
}

function ConfigPicker({ value, onChange, disabled }: { value: unknown; onChange(v: unknown): void; disabled?: boolean }) {
  const c: WhatAmIConfig = { players: 4, category: 'mixed', custom: [], ...(value as Partial<WhatAmIConfig> | null) };
  const [custom, setCustom] = useState(c.custom.join('\n'));
  useEffect(() => { setCustom(c.custom.join('\n')); }, [c.custom]);
  return (
    <>
      <label className="field"><span>Players</span>
        <select value={c.players} disabled={disabled} onChange={(e) => onChange({ ...c, players: Number(e.target.value) })}>
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => <option key={n} value={n}>{n} players</option>)}
        </select>
      </label>
      <label className="field"><span>Words</span>
        <select value={c.category} disabled={disabled} onChange={(e) => onChange({ ...c, category: e.target.value })}>
          {CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}
        </select>
      </label>
      <label className="field"><span>Your own words (optional)</span>
        <textarea value={custom} disabled={disabled} maxLength={2000} rows={3} placeholder="One word per line, or separated by commas"
          onChange={(e) => { setCustom(e.target.value); onChange({ ...c, custom: e.target.value }); }} />
        <span className="hint">Added to the built-in list, up to 60 words. Everyone sees each other's word but not their own.</span>
      </label>
    </>
  );
}

export const whatAmIClient: GameClient = {
  id: 'whatami',
  Stage: WhatAmIStage,
  tab: { label: 'Questions', Component: LogTab },
  ConfigPicker,
};
