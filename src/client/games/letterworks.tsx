import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { BONUS, CENTRE, SIZE, TWO_LETTER_WORDS, VALUES, scorePlacement, type LetterworksView, type Placement } from '../../shared/games/letterworks';
import type { GameClient, StageProps } from './types';
import { COLOURS, Disc, GameActions, PlayerStrip } from '../kit/kit';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** One tile: cream, the letter, its value (a blank shows its letter in blue italic, worth 0). */
function Tile({ letter, blank, state, small }: { letter: string; blank?: boolean; state?: 'pending' | 'last' | 'bad' | 'picked'; small?: boolean }) {
  return (
    <span className={`lw-tile${small ? ' small' : ''}${state ? ` ${state}` : ''}${blank ? ' blank' : ''}`}>
      {letter === '?' ? '' : letter}
      {letter !== '?' && <span className="v">{blank ? 0 : VALUES[letter]}</span>}
    </span>
  );
}

interface Pending extends Placement { slot: number }

function LetterworksStage(props: StageProps) {
  const { snap, send } = props;
  const v = snap.game.view as LetterworksView | null;
  const playing = snap.game.status === 'playing';
  const me = snap.you.seat;
  const myTurn = playing && !!me && v?.turn === me;
  const canLay = playing && !!v?.rack;
  const rack = v?.rack ?? [];
  const board = v?.board ?? Array(SIZE * SIZE).fill(null);
  const [order, setOrder] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [blankFor, setBlankFor] = useState<{ slot: number; cell: number } | null>(null);
  const [swap, setSwap] = useState<number[] | null>(null);

  // A new rack (after a move) resets the tiles in hand.
  const rackKey = rack.join('');
  useEffect(() => { setOrder(rack.map((_, i) => i)); setPending([]); setPicked(null); setSwap(null); }, [rackKey]);
  // Someone else's move: anything you'd laid on a square that's now taken comes back.
  useEffect(() => { setPending((p) => p.filter((t) => !board[t.cell])); }, [v?.moves.length]);

  const used = new Set(pending.map((t) => t.slot));
  const lastMove = v ? v.moves.length - 1 : -1;
  const preview = useMemo(() => (pending.length ? scorePlacement(board, pending) : null), [pending, board]);

  const place = (slot: number, cell: number) => {
    if (board[cell] || pending.some((t) => t.cell === cell)) return;
    if (rack[slot] === '?') { setBlankFor({ slot, cell }); return; }
    setPending([...pending, { slot, cell, letter: rack[slot] }]);
    setPicked(null);
  };
  const onSquare = (cell: number) => {
    const here = pending.find((t) => t.cell === cell);
    if (here) { setPending(pending.filter((t) => t !== here)); return; }
    if (picked !== null && !used.has(picked)) place(picked, cell);
  };
  const onDrop = (e: DragEvent, cell: number) => {
    e.preventDefault();
    const slot = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isInteger(slot) && !used.has(slot)) place(slot, cell);
  };
  const playMove = () => send({ t: 'act', action: { type: 'play', tiles: pending.map(({ cell, letter, blank }) => ({ cell, letter, blank })) } });
  const shuffle = () => setOrder([...order].sort(() => Math.random() - 0.5));

  return (
    <div className="board-stage">
      <div className="track-layout lw-layout">
        <div className="lw-board" role="grid" aria-label="The Letterworks board">
          {board.map((tile, cell) => {
            const p = pending.find((t) => t.cell === cell);
            const b = cell === CENTRE ? 'star' : BONUS[cell];
            const bad = p && typeof preview === 'string';
            return (
              <button key={cell} className={`lw-sq${b ? ` b-${b}` : ''}`} disabled={!canLay || (!!tile && !p)}
                aria-label={`Row ${Math.floor(cell / SIZE) + 1}, column ${(cell % SIZE) + 1}${tile ? `: ${tile.letter}` : p ? `: ${p.letter}, not played yet` : b ? `: ${b === 'star' ? 'centre star' : b}` : ''}`}
                onClick={() => onSquare(cell)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, cell)}>
                {tile ? <Tile letter={tile.letter} blank={tile.blank} state={tile.move === lastMove ? 'last' : undefined} small />
                  : p ? <Tile letter={p.letter} blank={p.blank} state={bad ? 'bad' : 'pending'} small />
                  : b ? <span className="mark">{b === 'star' ? '★' : b}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="track-side lw-side">
          {(v?.order ?? snap.seats.map((s) => s.id)).map((seat) => (
            <PlayerStrip key={seat} snap={snap} send={send} seatId={seat} toMove={playing && v?.turn === seat} receivedAt={props.receivedAt}
              extra={<span className="piece-count">{v ? `${v.scores[seat] ?? 0}${v.resigned.includes(seat) ? ' · resigned' : ''}` : ''}</span>} />
          ))}
          {v && (
            <div className="lw-hand">
              <div className="lw-bag"><span>{v.bag}</span> in the bag</div>
              {v.rack && (
                <div className="lw-rack" role="group" aria-label="Your tiles">
                  {order.filter((i) => i < rack.length && !used.has(i)).map((i) => (
                    <button key={i} draggable={canLay} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                      className={`lw-rack-tile${swap?.includes(i) ? ' swap' : ''}`} aria-pressed={picked === i || !!swap?.includes(i)}
                      aria-label={rack[i] === '?' ? 'Blank tile' : `${rack[i]}, ${VALUES[rack[i]]} points`}
                      onClick={() => (swap ? setSwap(swap.includes(i) ? swap.filter((x) => x !== i) : [...swap, i]) : setPicked(picked === i ? null : i))}>
                      <Tile letter={rack[i]} state={picked === i ? 'picked' : undefined} />
                    </button>
                  ))}
                </div>
              )}
              {canLay && pending.length > 0 && (
                <div className={`lw-preview${typeof preview === 'string' ? ' bad' : ''}`} role="status">
                  {typeof preview === 'string' ? preview
                    : preview && <><strong>{preview.words.map((w) => w.word).join(', ')}</strong>: {preview.score} points{pending.length === 7 ? ' (all seven: +40)' : ''}</>}
                </div>
              )}
              {myTurn && (swap ? (
                <div className="bet-row">
                  <button className="btn small primary" disabled={!swap.length} onClick={() => send({ t: 'act', action: { type: 'exchange', letters: swap.map((i) => rack[i]) } })}>Swap {swap.length || ''}</button>
                  <button className="btn small" onClick={() => setSwap(null)}>Cancel</button>
                  <span className="muted small">Choose the tiles to swap.</span>
                </div>
              ) : (
                <div className="bet-row">
                  <button className="btn small primary" disabled={!preview || typeof preview === 'string'} onClick={playMove}>Play{preview && typeof preview !== 'string' ? ` (${preview.score})` : ''}</button>
                  {pending.length > 0 && <button className="btn small" onClick={() => setPending([])}>Recall</button>}
                  <button className="btn small" onClick={shuffle}>Shuffle</button>
                  <button className="btn small" disabled={v.bag < 7} title={v.bag < 7 ? 'Fewer than 7 tiles in the bag' : undefined} onClick={() => { setPending([]); setSwap([]); }}>Swap…</button>
                  <button className="btn small" onClick={() => send({ t: 'act', action: { type: 'pass' } })}>Pass</button>
                </div>
              ))}
              {v.rack && !myTurn && playing && <p className="muted small">You can plan your word while you wait: lay tiles, then play them on your turn.</p>}
            </div>
          )}
          <GameActions snap={snap} send={send} minPlayers={2} />
        </div>

        {blankFor && (
          <div className="colour-pick" role="dialog" aria-label="Choose the blank’s letter">
            <strong>Which letter is this blank?</strong>
            <div className="lw-letters">
              {LETTERS.map((l) => (
                <button key={l} className="lw-rack-tile" onClick={() => { setPending([...pending, { slot: blankFor.slot, cell: blankFor.cell, letter: l, blank: true }]); setBlankFor(null); setPicked(null); }}>
                  <Tile letter={l} blank small />
                </button>
              ))}
            </div>
            <button className="btn small" onClick={() => setBlankFor(null)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MovesTab({ snap }: StageProps) {
  const v = snap.game.view as LetterworksView | null;
  const help = (
    <details className="lw-two">
      <summary>Two-letter words ({TWO_LETTER_WORDS.length})</summary>
      <p>{TWO_LETTER_WORDS.join(' ')}</p>
    </details>
  );
  if (!v?.moves.length) return <><p className="empty">No words yet.</p>{help}</>;
  return (
    <>
    <ol className="moves lw-moves">
      {v.moves.map((m, i) => (
        <li key={i}>
          <span className="n">{i + 1}.</span><Disc colour={m.seat} size={16} />
          <span>{m.kind === 'play' ? m.words!.map((w) => w.word).join(', ') : m.kind === 'exchange' ? `swapped ${m.count}` : m.kind === 'pass' ? 'passed' : 'resigned'}</span>
          {m.kind === 'play' && <span className="pts">{m.score}</span>}
        </li>
      ))}
      {v.endBonus && <li className="muted">Tiles left: {Object.entries(v.endBonus).map(([s, n]) => `${COLOURS[s]?.label ?? s} ${n > 0 ? '+' : ''}${n}`).join(', ')}</li>}
    </ol>
    {help}
    </>
  );
}

export const letterworksClient: GameClient = {
  id: 'letterworks',
  Stage: LetterworksStage,
  tab: { label: 'Moves', Component: MovesTab },
  seatExtra: (_props, seatId) => <Disc colour={seatId} size={20} />,
  ConfigPicker: () => <p className="hint">15 × 15 board, 100 tiles, words checked against the ENABLE word list.</p>,
};
