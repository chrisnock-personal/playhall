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
          <text x="8" y="20" fontSize="17" fontWeight="700" fill={colour} fontFamily="Inter, system-ui, sans-serif">{rank}</text>
          <text x="8" y="36" fontSize="15" fill={colour}>{s.glyph}</text>
          <text x="62" y="80" fontSize="17" fontWeight="700" fill={colour} textAnchor="end" fontFamily="Inter, system-ui, sans-serif" transform="rotate(180 62 74)">{rank}</text>
          <text x="35" y="66" fontSize="34" fill={colour} textAnchor="middle">{s.glyph}</text>
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
