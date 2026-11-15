// The kit's playing cards and chips: one face design, one back with the
// Playhall mark, and chips that always show their amount as a number too.
// Used by Blackjack and Texas Hold'em; Colour Clash's own deck uses the same
// card frame.

const SUIT: Record<string, { glyph: string; red: boolean; name: string }> = {
  S: { glyph: '♠', red: false, name: 'spades' }, H: { glyph: '♥', red: true, name: 'hearts' },
  D: { glyph: '♦', red: true, name: 'diamonds' }, C: { glyph: '♣', red: false, name: 'clubs' },
};
const RANK: Record<string, string> = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const RANK_NAME: Record<string, string> = { A: 'Ace', T: '10', J: 'Jack', Q: 'Queen', K: 'King' };

export const cardName = (code: string) => `${RANK_NAME[code[0]] ?? code[0]} of ${SUIT[code[1]]?.name ?? ''}`;

/** The back: graphite with the logo's arch, the same for every card game. */
function Back() {
  return (
    <>
      <rect x="1" y="1" width="68" height="98" rx="7" fill="#1B1E24" stroke="#F0A53C" strokeWidth="2" />
      <rect x="6" y="6" width="58" height="88" rx="4" fill="none" stroke="#3A3F4B" strokeWidth="1.5" />
      <path d="M22 66V46a13 13 0 0 1 26 0v20" fill="none" stroke="#F0A53C" strokeWidth="4" strokeLinecap="round" />
      <circle cx="35" cy="47" r="4" fill="#F6C27A" />
      <path d="M31.5 52h7l2 9h-11z" fill="#F6C27A" />
    </>
  );
}

/** A playing card, 70 × 100. `code` is rank + suit ('AS', 'TD'); null shows the back. */
export function Card({ code, width = 62, highlight }: { code: Card | null; width?: number; highlight?: boolean }) {
  const s = code ? SUIT[code[1]] : null;
  const colour = s?.red ? '#C0392B' : '#1A1A1A';
  const rank = code ? RANK[code[0]] ?? code[0] : '';
  return (
    <svg className={`playing-card${highlight ? ' highlight' : ''}`} width={width} height={(width * 100) / 70} viewBox="0 0 70 100"
      role="img" aria-label={code ? cardName(code) : 'A face-down card'}>
      {code && s ? (
        <>
          <rect x="1" y="1" width="68" height="98" rx="7" fill="#FBF8F1" stroke="#C9C1B2" strokeWidth="1.5" />
          {[0, 180].map((turn) => (
            // Each corner: rank over suit, centred on one column; the bottom
            // right is the same corner turned about the card's centre.
            <g key={turn} transform={turn ? 'rotate(180 35 50)' : undefined} fill={colour} textAnchor="middle" dominantBaseline="central">
              <text x="12" y="15" fontSize={rank.length > 1 ? 14 : 17} fontWeight="700" letterSpacing={rank.length > 1 ? -1 : 0} fontFamily="Inter, system-ui, sans-serif">{rank}</text>
              <text x="12" y="30" fontSize="13">{s.glyph}</text>
            </g>
          ))}
          <text x="35" y="52" fontSize="32" fill={colour} textAnchor="middle" dominantBaseline="central">{s.glyph}</text>
        </>
      ) : <Back />}
    </svg>
  );
}
type Card = string;

const CHIP_COLOURS: [number, string][] = [[500, '#5A3F7A'], [100, '#1A1A1A'], [25, '#3F8F64'], [10, '#3E6A86'], [1, '#C0392B']];

/** One chip in the colour of its value, with the amount written on it. */
export function Chip({ amount, size = 34 }: { amount: number; size?: number }) {
  const fill = CHIP_COLOURS.find(([v]) => amount >= v)?.[1] ?? '#C0392B';
  return (
    <svg className="chip-svg" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${amount} chips`}>
      <circle cx="20" cy="20" r="18" fill={fill} stroke="#F4EFE4" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="18" fill="none" stroke="#F4EFE4" strokeWidth="4" strokeDasharray="5 6.3" />
      <circle cx="20" cy="20" r="11" fill="#F4EFE4" />
      <text x="20" y="24" fontSize={amount >= 1000 ? 7.5 : 10} fontWeight="700" textAnchor="middle" fill="#1A1A1A" fontFamily="Inter, system-ui, sans-serif">{amount}</text>
    </svg>
  );
}

const CLASH_FILL: Record<string, string> = { amber: '#E8952A', teal: '#2E9C8C', violet: '#7E5FC9', rose: '#C95A71' };
const CLASH_MARK: Record<string, string> = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '', wild4: '+4' };

/** A Colour Clash card in the kit's frame: the player colours, our own symbols. */
export function ClashCardArt({ colour, value, width = 62, raised, dim }: {
  colour: string; value: string; width?: number; raised?: boolean; dim?: boolean;
}) {
  const wild = colour === 'wild';
  const mark = CLASH_MARK[value] ?? value;
  const small = mark.length > 1 || value === 'wild';
  return (
    <svg className={`playing-card${raised ? ' raised' : ''}${dim ? ' dim' : ''}`} width={width} height={(width * 100) / 70} viewBox="0 0 70 100" aria-hidden="true">
      <rect x="1" y="1" width="68" height="98" rx="7" fill={wild ? '#1B1E24' : CLASH_FILL[colour]} stroke="#FBF8F1" strokeWidth="3" />
      {wild ? (
        <g transform="translate(35 50) rotate(-30)">
          <path d="M0 0 L0 -24 A24 34 0 0 1 24 0 Z" fill={CLASH_FILL.amber} />
          <path d="M0 0 L24 0 A24 34 0 0 1 0 34 Z" fill={CLASH_FILL.teal} />
          <path d="M0 0 L0 34 A24 34 0 0 1 -24 0 Z" fill={CLASH_FILL.violet} />
          <path d="M0 0 L-24 0 A24 34 0 0 1 0 -24 Z" fill={CLASH_FILL.rose} />
        </g>
      ) : <ellipse cx="35" cy="50" rx="25" ry="36" transform="rotate(-30 35 50)" fill="#FBF8F1" />}
      {mark && <text x="35" y="50" textAnchor="middle" dominantBaseline="central" fontSize={small ? 22 : 34} fontWeight="800" fontFamily="Inter, system-ui, sans-serif" fill={wild ? '#FBF8F1' : CLASH_FILL[colour]} stroke={wild ? '#1B1E24' : 'none'} strokeWidth="1">{mark}</text>}
      {[0, 180].map((turn) => (
        <text key={turn} x="12" y="14" transform={turn ? 'rotate(180 35 50)' : undefined} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="800" fontFamily="Inter, system-ui, sans-serif" fill="#FBF8F1">{mark || 'W'}</text>
      ))}
    </svg>
  );
}
