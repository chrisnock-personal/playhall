// Pictures for the How to play rules (#57), drawn with each game's own pieces:
// a winning line, a capture, the cards that score, a ticket, a word.
import type { FC, ReactNode } from 'react';
import { COLOURS, Disc, Die, SquareBoard } from '../kit/kit';
import { Card, Chip, ClashCardArt } from '../kit/cards';
import { Tile } from './letterworks';
import { ElementIcon } from './realmduel';
import { FaceCard } from './whodat-art';
import { ManorCard } from './manormystery-art';
import { VALUES } from '../../shared/games/letterworks';
import { CAST } from '../../shared/games/whodat';
import { REDS } from '../../shared/games/roulette';

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

const Piece = ({ glyph, label }: { glyph: string; label: string }) => (
  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
    <span style={{ fontSize: 36, lineHeight: 1 }}>{glyph}</span>
    <span className="muted small">{label}</span>
  </span>
);

const ChessMoves: FC = () => (
  <Fig caption="King: one square. Queen: any distance. Rook: straight. Bishop: diagonal. Knight: an L, jumping over pieces. Pawn: forward, capturing diagonally.">
    {([['♔', 'King'], ['♕', 'Queen'], ['♖', 'Rook'], ['♗', 'Bishop'], ['♘', 'Knight'], ['♙', 'Pawn']] as const).map(([glyph, label]) => <Piece key={label} glyph={glyph} label={label} />)}
  </Fig>
);

const SnakesLadders: FC = () => {
  const c = 18;
  const squares = Array.from({ length: 100 }, (_, n) => {
    const r = Math.floor(n / 10), x = n % 10, y = 9 - r;
    return <rect key={n} x={x * c} y={y * c} width={c} height={c} fill={(r + x) % 2 ? '#f1e0be' : '#c9a875'} stroke="#8a6440" strokeWidth=".5" />;
  });
  return (
    <Fig caption="Land on the foot of a ladder and climb to its top; land on a snake’s head and slide down to its tail.">
      <svg viewBox="0 0 180 180" width="160" role="img" aria-label="A ladder climbing a Snakes and Ladders board and a snake sliding down it">
        {squares}
        <g stroke="#7a4f2a" strokeWidth="3">
          <path d={`M${3 * c + 5} ${7 * c}V${2 * c}M${3 * c + 13} ${7 * c}V${2 * c}`} />
          {[3, 4, 5, 6].map((r) => <path key={r} d={`M${3 * c + 5} ${r * c + 9}H${3 * c + 13}`} />)}
        </g>
        <path d={`M${7 * c + 9} ${5 * c + 9} q-14 12 0 24 t0 24`} fill="none" stroke="#2f7d4f" strokeWidth="5" strokeLinecap="round" />
        <circle cx={7 * c + 9} cy={5 * c + 9} r="5" fill="#2f7d4f" />
        <circle cx={3 * c + 9} cy={7 * c + 9} r="4" fill={COLOURS.amber.fill} stroke={COLOURS.amber.rim} strokeWidth="2" />
      </svg>
    </Fig>
  );
};

const LudoCapture: FC = () => (
  <Fig caption="Land on an opponent’s token on the track and it goes back to its yard. Start squares and stars are safe.">
    <svg viewBox="0 0 130 110" width="170" role="img" aria-label="An amber Ludo token landing on a teal token on the track">
      <path d="M42 0h46v42h42v46H88v22H42V88H0V42h42z" fill="#e9d8b4" stroke="#8a6440" strokeWidth="2" />
      <circle cx="65" cy="21" r="11" fill={COLOURS.amber.rim} /><circle cx="65" cy="20" r="9" fill={COLOURS.amber.fill} />
      <circle cx="65" cy="43" r="11" fill={COLOURS.teal.rim} /><circle cx="65" cy="42" r="9" fill={COLOURS.teal.fill} />
      <text x="108" y="72" fontSize="12" textAnchor="middle" fill="#8a6440">★</text>
    </svg>
  </Fig>
);

const SeaShot: FC = () => (
  <Fig caption="Click enemy waters: a hit is a red peg, a miss a white one. Hit every square of a ship and it sinks.">
    <span style={{ display: 'inline-block', width: 150 }}>
      <SquareBoard size={6} variant="sea" label="A Sea Battle grid with one red hit and one white miss" render={(i) => {
        const r = Math.floor(i / 6), c = i % 6;
        return <>{r === 2 && c === 3 && <Disc colour="red" size={14} />}{r === 4 && c === 1 && <Disc colour="white" size={14} />}</>;
      }} />
    </span>
  </Fig>
);

const BlackjackHand: FC = () => (
  <Fig caption="An ace counts 1 or 11, so ace plus king is 21: blackjack. The dealer’s second card stays hidden until everyone stands.">
    <Cards codes={['AS', 'KH']} width={44} /><strong>21</strong><Chip amount={100} size={30} />
    <span className="rp-gap" /><Cards codes={['9D']} width={44} /><Card code={null} width={44} />
  </Fig>
);

const ClashCards: FC = () => (
  <Fig caption="Match the top card’s colour, number or symbol. Skip, Reverse and Draw two do what they say; Wild lets you choose a colour.">
    <ClashCardArt colour="amber" value="3" width={46} /><ClashCardArt colour="teal" value="skip" width={46} />
    <ClashCardArt colour="violet" value="draw2" width={46} /><ClashCardArt colour="wild" value="wild" width={46} />
  </Fig>
);

const PokerHands: FC = () => (
  <Fig caption="Best first: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.">
    <Cards codes={['9S', 'TS', 'JS', 'QS', 'KS']} width={30} />
    <Cards codes={['7H', '7D', '7C', '2S', '2D']} width={30} />
    <Cards codes={['AH', 'AD', '8C', '5S', '3D']} width={30} />
  </Fig>
);

const ManorNotebook: FC = () => (
  <Fig caption="A suspect, an object and a room. A card you hold or are shown can’t be in the envelope; the notebook tracks who has each one.">
    <ManorCard id="vane" width={48} /><ManorCard id="rope" width={48} /><ManorCard id="chapel" width={48} />
    <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 2, padding: 4, background: '#f7f1e3', borderRadius: 6 }}>
      {['✓', '✗', '?', '✗', '✓', '?', '?', '✗', '✓'].map((m, i) => <span key={i} style={{ height: 22, display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 3, color: '#2a2230' }}>{m}</span>)}
    </span>
  </Fig>
);

const WhoFaces: FC = () => (
  <Fig caption="Ask yes/no questions to rule faces out on your own board; the answers never flip the right one. Then name a face — wrong, and you lose.">
    <FaceCard face={CAST[0]} /><FaceCard face={CAST[1]} /><FaceCard face={CAST[2]} highlight />
  </Fig>
);

const PoopheadCards: FC = () => (
  <Fig caption="A 2 goes on anything and resets the pile, a 7 caps the next card at 7, a 10 burns the pile — and so do four of a kind.">
    <Cards codes={['2H', '7S', 'TD', 'QS']} width={44} />
  </Fig>
);

const HopChain: FC = () => {
  const c = 22, rows = [3, 4, 5, 4, 3];
  return (
    <Fig caption="A hop jumps over any neighbouring marble into the empty hole beyond, and can chain. Nothing is captured.">
      <svg viewBox="0 0 150 126" width="170" role="img" aria-label="Three Chinese checkers holes with a dotted hop chain over a marble">
        {rows.map((n, r) => Array.from({ length: n }, (_, i) => <circle key={`${r}-${i}`} cx={75 + (i - (n - 1) / 2) * c} cy={10 + r * c * 0.9} r="4" fill="#c9a875" stroke="#8a6440" />))}
        <circle cx={75 - c} cy={10 + 2 * c * 0.9} r="7" fill={COLOURS.amber.fill} stroke={COLOURS.amber.rim} strokeWidth="2" />
        <circle cx={75} cy={10 + 2 * c * 0.9} r="7" fill={COLOURS.teal.fill} stroke={COLOURS.teal.rim} strokeWidth="2" />
        <circle cx={75 + c} cy={10 + 2 * c * 0.9} r="7" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 2" />
        <path d={`M${75 - c + 7} ${10 + 2 * c * 0.9} Q75 ${10 + 2 * c * 0.9 - 18} ${75 + c - 7} ${10 + 2 * c * 0.9}`} fill="none" stroke="#fff" strokeWidth="2" markerEnd="url(#rp-arrow-cc)" />
        <defs><marker id="rp-arrow-cc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff" /></marker></defs>
      </svg>
    </Fig>
  );
};

const RouletteBets: FC = () => {
  const nums = Array.from({ length: 13 }, (_, i) => i);
  return (
    <Fig caption="A single number pays 35 to 1, a split 17, a street 11, a corner 8 and a six line 5. Red or black pays 1 to 1; a dozen pays 2 to 1.">
      <svg viewBox="0 0 230 120" width="240" role="img" aria-label="Part of a roulette table with zero, numbers, a dozen, red and a split bet">
        <rect x="4" y="4" width="222" height="112" rx="8" fill="#254a35" />
        {nums.map((n, i) => <g key={n}>
          <rect x={8 + i * 16} y="8" width="15" height="24" rx="2" fill={n === 0 ? '#1b7a45' : REDS.has(n) ? '#b52b2b' : '#1b1e24'} />
          <text x={8 + i * 16 + 7.5} y="24" fontSize="11" textAnchor="middle" fill="#fff">{n}</text>
        </g>)}
        <rect x="8" y="38" width="104" height="22" rx="3" fill="#1b1e24" /><text x="60" y="52" fontSize="10" textAnchor="middle" fill="#fff">1st 12 — 2 to 1</text>
        <rect x="118" y="38" width="104" height="22" rx="3" fill="#b52b2b" /><text x="170" y="52" fontSize="10" textAnchor="middle" fill="#fff">Red — 1 to 1</text>
        <rect x="8" y="66" width="104" height="22" rx="3" fill="#1b1e24" /><text x="60" y="80" fontSize="10" textAnchor="middle" fill="#fff">Split 1/2 — 17 to 1</text>
        <rect x="118" y="66" width="104" height="22" rx="3" fill="#1b7a45" /><text x="170" y="80" fontSize="10" textAnchor="middle" fill="#fff">0 — 35 to 1</text>
      </svg>
    </Fig>
  );
};

const BridgeBid: FC = () => (
  <Fig caption="Each call beats the last: a higher number, or the same number in a higher suit (♣ ♦ ♥ ♠ NT). 2♥ promises eight tricks with hearts trump; three passes make it the contract.">
    {['Pass', '1♣', '1♦', '1♥', '1♠', '2♥'].map((c) => <span key={c} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 6, background: c === '2♥' ? 'var(--accent)' : 'var(--surface)' }}>{c}</span>)}
  </Fig>
);

const BattleRound: FC = () => (
  <Fig caption="Everyone picks a creature, a style and an enemy target. Team mates see the picks once locked in, then the highest Agility strikes first.">
    <Disc colour="amber" size={30} /><ElementIcon element="fire" size={24} /><span aria-hidden="true">→</span><Disc colour="teal" size={30} />
    <span className="rp-gap" /><Disc colour="violet" size={30} /><ElementIcon element="water" size={24} /><span aria-hidden="true">→</span><Disc colour="rose" size={30} />
  </Fig>
);

const ShipOrders: FC = () => (
  <Fig caption="A circle is a Navy order, a diamond a U-boat order, a hexagon a Lisbon order. Its heading moves the ship to the next area on the chart.">
    <svg viewBox="0 0 230 80" width="240" role="img" aria-label="Navy, U-boat and Lisbon order headings, and a ship moving to the next sea area">
      <circle cx="18" cy="26" r="9" fill="none" stroke="#2f6f9e" strokeWidth="3" /><text x="32" y="30" fontSize="11" fill="var(--text)">Navy</text>
      <path d="M88 17l9 9-9 9-9-9z" fill="none" stroke="#b52b2b" strokeWidth="3" /><text x="102" y="30" fontSize="11" fill="var(--text)">U-boat</text>
      <path d="M158 18l8 4v8l-8 4-8-4v-8z" fill="none" stroke="#8a6b2f" strokeWidth="3" /><text x="172" y="30" fontSize="11" fill="var(--text)">Lisbon</text>
      <path d="M30 58q30-18 60-2t60-2" fill="none" stroke="#4c90b8" strokeWidth="3" markerEnd="url(#rp-arrow-ship)" />
      <text x="118" y="74" fontSize="11" textAnchor="middle" fill="var(--muted)">next sea area</text>
      <defs><marker id="rp-arrow-ship" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#4c90b8" /></marker></defs>
    </svg>
  </Fig>
);

const ClueBoard: FC = () => {
  // The key a clue-giver sees: nine Sun, eight Moon, seven neutral, one spy.
  const kinds = [
    ['S', 'M', 'N', 'S', 'M'],
    ['N', 'S', 'M', 'N', 'S'],
    ['M', 'N', 'S', 'M', 'N'],
    ['S', 'M', 'N', 'S', 'M'],
    ['S', 'S', 'M', 'N', 'X'],
  ];
  const words = [
    'HARBOUR', 'PARROT', 'SNOW', 'CAMERA', 'LEMON',
    'BUTTON', 'DRAGON', 'MAP', 'FROG', 'KITE',
    'GUITAR', 'ISLAND', 'CANDLE', 'SHIP', 'ORANGE',
    'TIGER', 'GLOBE', 'HONEY', 'PIRATE', 'TREE',
    'WHALE', 'PUZZLE', 'MUSIC', 'STORM', 'KEY',
  ];
  const fill: Record<string, string> = { S: '#f2c14e', M: '#6fb1e6', N: '#bdb5a5', X: '#d66b6b' };
  return (
    <Fig caption="The key: nine Sun words, eight Moon words, seven neutral and one spy. Only clue-givers and watchers see the colours.">
      <svg viewBox="0 0 200 200" width="180" role="img" aria-label="A five by five Clue Words board with Sun, Moon, neutral and spy words">
        {kinds.flatMap((row, r) => row.map((k, c) => (
          <g key={`${r}-${c}`}>
            <rect x={c * 40 + 1} y={r * 40 + 1} width={38} height={38} rx={4} fill={fill[k]} />
            <text x={c * 40 + 20} y={r * 40 + 17} textAnchor="middle" fontSize={7} fill={k === 'X' ? '#fff' : '#30271c'}>{words[r * 5 + c]}</text>
            <text x={c * 40 + 20} y={r * 40 + 31} textAnchor="middle" fontSize={7} fill={k === 'X' ? '#fff' : '#30271c'}>{k === 'S' ? 'SUN' : k === 'M' ? 'MOON' : k === 'N' ? '—' : 'SPY'}</text>
          </g>
        )))}
      </svg>
    </Fig>
  );
};

const FillRound: FC = () => (
  <Fig caption="The judge reads the question; the others slip in cards anonymously. The read-out shows letters, not names.">
    <svg viewBox="0 0 240 110" width="260" role="img" aria-label="A question with a blank and three anonymous answer cards labelled A, B and C">
      <rect x="5" y="6" width="230" height="32" rx="7" fill="#f3e4bd" />
      <text x="120" y="26" textAnchor="middle" fontSize="11" fill="#29251b">A good picnic needs a ___</text>
      {[
        { x: 8, label: 'A', text: 'singing potato' },
        { x: 84, label: 'B', text: 'rubber chicken' },
        { x: 160, label: 'C', text: 'bag of popcorn' },
      ].map((c) => (
        <g key={c.label}>
          <rect x={c.x} y="50" width="72" height="46" rx="7" fill="#f7f1df" />
          <text x={c.x + 8} y="66" fontSize="10" fontWeight="bold" fill="#a8791e">{c.label}</text>
          <text x={c.x + 8} y="83" fontSize="8" fill="#29251b">{c.text}</text>
        </g>
      ))}
    </svg>
  </Fig>
);

const PICTURES: Record<string, Record<string, FC>> = {
  chess: { 'How the pieces move': ChessMoves },
  fourinarow: { 'How a game ends': FourInARow },
  checkers: { Capturing: CheckersJump },
  snakes: { 'Ladders and snakes': SnakesLadders },
  ludo: { Capturing: LudoCapture },
  seabattle: { Firing: SeaShot },
  blackjack: { 'A hand': BlackjackHand },
  colourclash: { 'The cards': ClashCards },
  poker: { 'Hands, best first': PokerHands },
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
  manormystery: { 'The cards': ManorNotebook },
  ship2shore: { 'Orders and the chart': ShipOrders },
  whodat: { 'Naming the face': WhoFaces },
  poophead: { 'A turn': PoopheadCards },
  chinesecheckers: { Moving: HopChain },
  roulette: { Betting: RouletteBets },
  craps: { 'The rolls': () => <Fig caption="A 7 or 11 on the come-out roll is a natural: the pass line wins."><span className="rp-dice"><Die value={5} size={44} /><Die value={2} size={44} /></span></Fig> },
  bridge: { 'The auction': BridgeBid },
  realmbattle: { 'A round': BattleRound },
  cluewords: { 'The board': ClueBoard },
  filltheblank: { 'A round': FillRound },
};

export default PICTURES;
