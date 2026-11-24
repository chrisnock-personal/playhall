// Pictures for the How to play rules (#57), drawn with each game's own pieces:
// a winning line, a capture, the cards that score, a ticket, a word.
import type { FC, ReactNode } from 'react';
import { COLOURS } from '../kit/kit';
import { Card } from '../kit/cards';
import { Die } from '../kit/kit';
import { Tile } from './letterworks';
import { ElementIcon } from './realmduel';
import { VALUES } from '../../shared/games/letterworks';

const Fig = ({ children, caption }: { children: ReactNode; caption: string }) => (
  <div className="rp"><div className="rp-art">{children}</div><span className="rp-caption">{caption}</span></div>
);
const Cards = ({ codes, width = 44 }: { codes: string[]; width?: number }) => <span className="rp-cards">{codes.map((c) => <Card key={c} code={c} width={width} />)}</span>;

const FourInARow: FC = () => {
  const a = COLOURS.amber.fill, t = COLOURS.teal.fill;
  // Bottom row first: a diagonal of four ambers, some teals in the way.
  const cells: Record<string, string> = { '0,1': a, '1,2': a, '2,3': a, '3,4': a, '0,2': t, '0,3': t, '1,3': t, '0,4': t, '1,4': a, '2,4': t, '0,0': a, '0,5': t };
  return (
    <Fig caption="Four in a line wins: across, down or diagonally (here, amber’s diagonal).">
      <svg viewBox="0 0 140 122" width="180" role="img" aria-label="A Four in a Row board with amber’s four in a diagonal">
        <rect x="0" y="0" width="140" height="122" rx="8" fill="#7a5a32" />
        {Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => {
          const fill = cells[`${r},${c}`] ?? '#2a1f14';
          const win = [[0, 1], [1, 2], [2, 3], [3, 4]].some(([rr, cc]) => rr === r && cc === c);
          return <circle key={`${r}-${c}`} cx={12 + c * 19.3} cy={110 - r * 19.3} r={8} fill={fill} stroke={win ? '#fff' : 'none'} strokeWidth={2} />;
        }))}
      </svg>
    </Fig>
  );
};

const CheckersJump: FC = () => {
  const a = COLOURS.amber.fill, t = COLOURS.teal.fill;
  return (
    <Fig caption="Jump diagonally over a piece into the empty square beyond, and it’s captured. You can keep jumping.">
      <svg viewBox="0 0 100 100" width="150" role="img" aria-label="An amber piece jumping a teal piece diagonally">
        {Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => <rect key={`${r}${c}`} x={c * 25} y={r * 25} width={25} height={25} fill={(r + c) % 2 ? '#6b4a2c' : '#e9d8b4'} />))}
        <circle cx={12.5 + 25} cy={12.5 + 25} r={9} fill={t} />
        <circle cx={12.5} cy={12.5 + 50} r={9} fill={a} />
        <path d="M14 58 Q 28 18 60 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="4 3" markerEnd="url(#rp-arrow)" />
        <circle cx={12.5 + 50} cy={12.5} r={9} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="3 2" />
        <defs><marker id="rp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff" /></marker></defs>
      </svg>
    </Fig>
  );
};

const PICTURES: Record<string, Record<string, FC>> = {
  fourinarow: { 'How a game ends': FourInARow },
  checkers: { Capturing: CheckersJump },
  hearts: { Scoring: () => <Fig caption="Each heart costs 1 point; the queen of spades costs 13. Take them all and everyone else gets 26."><Cards codes={['QS', 'AH', '7H']} /></Fig> },
  spades: { Tricks: () => <Fig caption="Hearts were led, but a spade beats any other suit: the 2♠ takes this trick."><Cards codes={['KH', 'AH', '2S', '9H']} /></Fig> },
  thirtyone: { 'Your hand': () => <Fig caption="Ace, king and queen of one suit: 11 + 10 + 10 = 31, the best hand. Three of a kind (right) counts 30½."><Cards codes={['AS', 'KS', 'QS']} /><Cards codes={['7H', '7D', '7C']} /></Fig> },
  ginrummy: { 'Melds and deadwood': () => <Fig caption="A run (4-5-6 of hearts) and a set (three 9s) are melds; the king and 3 left over are 13 deadwood."><Cards codes={['4H', '5H', '6H']} width={38} /><Cards codes={['9C', '9D', '9S']} width={38} /><Cards codes={['KD', '3C']} width={38} /></Fig> },
  bingo: {
    'Your ticket': () => {
      const rows = [[4, null, 24, null, 44, 51, 61, null, null], [null, 13, null, 30, 49, null, 66, 76, null], [5, 19, null, 32, null, null, 68, null, 88]];
      return (
        <Fig caption="A 90-ball ticket: three rows of five numbers; each column holds one group of ten. Marked numbers are the pink dots.">
          <span className="rp-ticket">{rows.flat().map((n, i) => <span key={i} className={n === null ? 'blank' : [4, 24, 44, 49, 76, 5, 19, 32, 88].includes(n) ? 'marked' : ''}>{n ?? ''}</span>)}</span>
        </Fig>
      );
    },
  },
  letterworks: { 'Your turn': () => <Fig caption="Each tile is worth its number of points; words read across or down and must join what’s on the board."><span className="rp-tiles">{['W', 'O', 'R', 'D'].map((l) => <Tile key={l} letter={l} />)}</span><span className="muted small"> = {['W', 'O', 'R', 'D'].reduce((n, l) => n + VALUES[l], 0)} points before bonuses</span></Fig> },
  realmduel: {
    Elements: () => (
      <Fig caption="Each beats the next: Fire › Air › Earth › Water › Fire. Light and Shadow beat each other. A hit on an element you beat does 50% more.">
        <span className="rp-elements">
          {(['fire', 'air', 'earth', 'water', 'fire'] as const).map((e, i) => <span key={i}>{i ? '›' : ''}<ElementIcon element={e} size={26} /></span>)}
          <span className="rp-gap" /><ElementIcon element="light" size={26} />⇄<ElementIcon element="shadow" size={26} />
        </span>
      </Fig>
    ),
  },
  craps: { 'The rolls': () => <Fig caption="A 7 or 11 on the come-out roll is a natural: the pass line wins."><span className="rp-dice"><Die value={5} size={44} /><Die value={2} size={44} /></span></Fig> },
};

export default PICTURES;
