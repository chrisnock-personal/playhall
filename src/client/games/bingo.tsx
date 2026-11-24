import { useEffect, useRef, useState } from 'react';
import { callWords, type BingoView } from '../../shared/games/bingo';
import type { GameClient, StageProps } from './types';
import { COLOURS as KIT, Disc, GameActions } from '../kit/kit';
import './bingo.css';

const act = (send: StageProps['send'], action: unknown) => send({ t: 'act', action });

function BingoStage({ snap, send }: StageProps) {
  const v = snap.game.view as BingoView | null;
  const playing = snap.game.status === 'playing';
  const name = (p: string) => (p === v?.you ? 'You' : snap.seats.find((s) => s.id === p)?.name ?? KIT[p]?.label ?? p);
  const called = new Set(v?.called ?? []);
  const marked = new Set(v?.marked ?? []);
  const last = v?.called.at(-1);
  const balls = v?.config.balls === 75 ? 75 : 90;
  // Read the calls aloud (#53), if this player wants; remembered in the browser.
  const [speak, setSpeak] = useState(() => { try { return localStorage.getItem('playhall.bingo.speak') === '1'; } catch { return false; } });
  const spoken = useRef<number | undefined>(last);
  useEffect(() => {
    if (!speak || last === undefined || spoken.current === last) { spoken.current = last; return; }
    spoken.current = last;
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(callWords(last, balls))); } catch { /* no voice here */ }
  }, [last, speak, balls]);
  const toggleSpeak = (on: boolean) => { setSpeak(on); try { localStorage.setItem('playhall.bingo.speak', on ? '1' : '0'); } catch { /* not saved */ } };

  return (
    <div className="board-stage">
      <div className="bg-hall">
        <div className="bg-caller" aria-live="polite">
          {last ? (
            <>
              <span key={last} className="bg-ball">{last}</span>
              <span className="bg-words">{callWords(last, balls)}</span>
            </>
          ) : <span className="bg-words">{playing ? 'Eyes down: the first call is coming…' : 'The caller is ready'}</span>}
          <span className="bg-count">{v ? `${v.called.length} of ${balls} called` : ''}{v?.stage ? ` · playing for ${v.stage}` : ''}{v?.paused ? ' · paused' : ''}</span>
        </div>

        <div className={`bg-board${balls === 75 ? ' b75' : ''}`} aria-label="Numbers called">
          {Array.from({ length: balls }, (_, i) => i + 1).map((n) => (
            <span key={n} className={`${called.has(n) ? 'on' : ''}${n === last ? ' last' : ''}`}>{n}</span>
          ))}
        </div>

        {v?.tickets && (
          <div className="bg-tickets">
            {v.tickets.map((t, k) => (
              <div key={k} className={`bg-ticket${t.length === 5 ? ' card75' : ''}`} aria-label={`Your ticket${v.tickets!.length > 1 ? ` ${k + 1}` : ''}`}>
                {t.map((row, r) => row.map((n, c) => (
                  n === null ? <span key={`${r}-${c}`} className={`bg-cell blank${t.length === 5 ? ' free' : ''}`}>{t.length === 5 ? 'FREE' : ''}</span> : (
                    <button key={`${r}-${c}`} className={`bg-cell${marked.has(n) ? ' marked' : ''}${called.has(n) && !marked.has(n) ? ' ready' : ''}`}
                      disabled={!playing || !called.has(n) || v.auto} onClick={() => act(send, { type: 'mark', n })}
                      aria-label={`${n}${marked.has(n) ? ', marked' : called.has(n) ? ', called: tap to mark' : ''}`}>
                      {n}
                    </button>
                  )
                )))}
              </div>
            ))}
          </div>
        )}

        {v && v.prizes.length > 0 && (
          <div className="bg-prizes">
            {v.prizes.map((p) => (
              <span key={p.stage} className="bg-prize"><strong>{p.stage[0].toUpperCase() + p.stage.slice(1)}</strong>: {p.winners.map(name).join(' & ')} (call {p.at})</span>
            ))}
          </div>
        )}

        <GameActions snap={snap} send={send} minPlayers={1}>
          {playing && v?.tickets && (
            <label className="bg-auto"><input type="checkbox" checked={v.auto} onChange={(e) => act(send, { type: 'auto', on: e.target.checked })} /> Auto-mark</label>
          )}
          {playing && v?.tickets && !v.auto && <span className="note">Tap called numbers on your ticket to mark them</span>}
          {playing && v?.tickets && <button className="btn small" onClick={() => act(send, { type: v.paused ? 'resume' : 'pause' })}>{v.paused ? 'Start the calls again' : 'Pause the calls'}</button>}
          <label className="bg-auto"><input type="checkbox" checked={speak} onChange={(e) => toggleSpeak(e.target.checked)} /> Read the calls aloud</label>
        </GameActions>
      </div>
    </div>
  );
}

export const bingoClient: GameClient = {
  id: 'bingo',
  Stage: BingoStage,
  seatExtra: (props, seatId) => {
    const v = props.snap.game.view as BingoView | null;
    return v && seatId in v.toGo ? <span className="piece-count">{v.toGo[seatId]} to go</span> : <Disc colour={seatId} size={20} />;
  },
  ConfigPicker: ({ value, onChange, disabled }) => {
    const c = { speed: 6, tickets: 1, balls: 90, ...(value as object) } as { speed: number; tickets: number; balls: number };
    return (
      <div className="hint">
        <label><select disabled={disabled} value={c.balls} onChange={(e) => onChange({ ...c, balls: Number(e.target.value) })}><option value={90}>90-ball (UK)</option><option value={75}>75-ball (US)</option></select></label>{' '}
        <label>A call every <select disabled={disabled} value={c.speed} onChange={(e) => onChange({ ...c, speed: Number(e.target.value) })}>{[4, 6, 8].map((s) => <option key={s} value={s}>{s} seconds</option>)}</select></label>{' '}
        <label><select disabled={disabled} value={c.tickets} onChange={(e) => onChange({ ...c, tickets: Number(e.target.value) })}><option value={1}>One ticket each</option><option value={2}>Two tickets each</option></select></label>
      </div>
    );
  },
};
