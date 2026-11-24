import { useEffect, useState, type FormEvent } from 'react';
import { TEAM_NAMES, targetOf, type ClueWordsView, type CwCard, type CwTeam } from '../../shared/games/cluewords';
import type { GameClient, StageProps } from './types';
import { GameActions, PlayerStrip } from '../kit/kit';
import './cluewords.css';

const kindName = (kind: CwCard['kind']) => kind === 'assassin' ? 'Spy' : kind === 'neutral' ? 'Neutral' : `${TEAM_NAMES[kind]} word`;
const kindClass = (kind: CwCard['kind']) => kind === 0 ? 'sun' : kind === 1 ? 'moon' : kind;
const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

function ClueWordsStage({ snap, send, receivedAt }: StageProps) {
  const v = snap.game.view as ClueWordsView | null;
  const phase = v?.phase ?? 'clue';
  const turnTeam = v?.turnTeam ?? 0;
  const [word, setWord] = useState('');
  const [count, setCount] = useState(1);
  useEffect(() => { setWord(''); setCount(1); }, [phase, turnTeam]);
  if (!v) return <div className="board-stage"><p className="cw-intro">Clue Words: two teams, one key, and one spy to avoid.</p><GameActions snap={snap} send={send} /></div>;

  const playing = snap.game.status === 'playing';
  const me = v.you;
  const myTeam: CwTeam | null = me ? v.teams[me] : null;
  const spy = myTeam === null ? null : me === v.spymaster[myTeam];
  const myTurn = playing && !v.result && myTeam !== null && v.turnTeam === myTeam;
  const canClue = myTurn && v.phase === 'clue' && spy;
  const canGuess = myTurn && v.phase === 'guessing' && !spy;
  const max = targetOf(v.turnTeam) - v.found[v.turnTeam];
  const winner = v.result?.placings?.[0]?.[0] ? v.teams[v.result.placings[0][0]] : 0;

  const clueForm = (e: FormEvent) => {
    e.preventDefault();
    const body = word.trim();
    if (body) act(send, { type: 'clue', word: body, count });
  };

  return (
    <div className="board-stage">
      <div className="cw-table">
        <div className="cw-players">
          {v.order.map((p) => {
            const team = v.teams[p];
            const giver = p === v.spymaster[team];
            const toMove = playing && !v.result && v.turnTeam === team && (v.phase === 'clue' ? giver : !giver);
            return <PlayerStrip key={p} snap={snap} send={send} seatId={p} toMove={toMove} receivedAt={receivedAt}
              extra={<span className="cw-role">{TEAM_NAMES[team]} · {giver ? 'clue-giver' : 'guesser'}</span>} />;
          })}
        </div>

        <div className="cw-status" role="status">
          {v.result ? `${TEAM_NAMES[winner]} team wins` : null}
          {!v.result && playing && `${TEAM_NAMES[v.turnTeam]}: ${v.phase === 'clue' ? `${v.spymaster[v.turnTeam] === me ? 'your' : 'their'} clue-giver is thinking` : 'guessing'}.`}
          {!playing && !v.result && 'Start a game to lay out the board.'}
        </div>

        <div className="cw-grid" aria-label="The word board">
          {v.cards.map((c, i) => {
            const shown = c.revealed || c.kind !== null;
            const can = canGuess && !c.revealed;
            return (
              <button key={i} className={`cw-card${c.revealed ? ` revealed ${kindClass(c.kind!)}` : ''}${c.kind !== null && !c.revealed ? ` key ${kindClass(c.kind)}` : ''}${can ? ' can-guess' : ''}`}
                disabled={!can} aria-label={`${c.word}${shown ? `, ${kindName(c.kind!)}` : ''}`} onClick={() => act(send, { type: 'guess', card: i })}>
                <span>{c.word}</span>
                {shown && <small>{kindName(c.kind!)}</small>}
              </button>
            );
          })}
        </div>

        <div className="cw-score">
          {([0, 1] as const).map((t) => <span key={t} className={v.turnTeam === t ? 'active' : ''}>{TEAM_NAMES[t]}: {v.found[t]} of {targetOf(t)}</span>)}
        </div>

        {canClue && <form className="cw-clue-form" onSubmit={clueForm}>
          <label className="sr-only" htmlFor="cw-word">Your clue</label>
          <input id="cw-word" value={word} maxLength={40} placeholder="One word" onChange={(e) => setWord(e.target.value)} />
          <label className="sr-only" htmlFor="cw-count">Number of words</label>
          <select id="cw-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn primary" disabled={!word.trim()}>Give clue</button>
        </form>}

        {v.phase === 'guessing' && !canClue && <div className="cw-clue" role="status">
          <strong>{v.clue?.word}</strong> · {v.clue?.count} · {v.clue?.left} {v.clue?.left === 1 ? 'guess' : 'guesses'} left
          {canGuess && <button className="btn small" onClick={() => act(send, { type: 'stop' })}>Stop guessing</button>}
        </div>}

        {me && myTeam !== null && <p className="hint">Your side has a private {TEAM_NAMES[myTeam]} team tab for talking things over; the other team and the gallery can’t read it.</p>}
        <GameActions snap={snap} send={send} />
      </div>
    </div>
  );
}

function CluesTab({ snap }: StageProps) {
  const v = snap.game.view as ClueWordsView | null;
  if (!v || !v.lines.length) return <p className="empty">Clues and guesses will appear here.</p>;
  return <div className="tab-body">{[...v.lines].reverse().map((line, i) => <p key={i} className="chat-line">{line}</p>)}</div>;
}

export const clueWordsClient: GameClient = {
  id: 'cluewords',
  Stage: ClueWordsStage,
  tab: { label: 'Clues', Component: CluesTab },
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as ClueWordsView | null;
    if (!v || !(seatId in v.teams)) return null;
    return <span className="piece-count">{TEAM_NAMES[v.teams[seatId]]} · {seatId === v.spymaster[v.teams[seatId]] ? 'clue-giver' : 'guesser'}</span>;
  },
  ConfigPicker: () => <p className="hint">Four players in two teams: Amber & Violet (Sun) against Teal & Rose (Moon). One clue-giver on each side sees the key; the other two guess. Family word list, 5×5 board. No bots or model players yet.</p>,
};
