// Whose turn it is (playtest feedback: it wasn't clear). When the turn
// changes, a banner drops in over the stage for a moment: "Your turn" in the
// accent colour, or whose turn it is. While it's yours, the tab's title says
// so too, so a tab in the background shows it.
import { useEffect, useRef, useState } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';

export function useMyTurn(snap: RoomSnapshot): boolean {
  const seat = snap.you.seat;
  return !!seat && snap.game.status === 'playing' && snap.game.turnSeats.includes(seat);
}

export function TurnBanner({ snap }: { snap: RoomSnapshot }) {
  const mine = useMyTurn(snap);
  const playing = snap.game.status === 'playing';
  const seats = playing ? snap.game.turnSeats : [];
  const key = seats.join(',');
  const [shown, setShown] = useState<{ text: string; mine: boolean; n: number } | null>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!playing || !seats.length) { last.current = null; return; }
    if (last.current === key) return;
    last.current = key;
    const name = (s: string) => snap.seats.find((x) => x.id === s)?.name ?? snap.seats.find((x) => x.id === s)?.label ?? s;
    const text = mine ? (seats.length > 1 ? 'Your move' : 'Your turn')
      : seats.length > 1 ? `Waiting for ${seats.length} players` : `${name(seats[0])}’s turn`;
    setShown({ text, mine, n: Date.now() });
    const t = setTimeout(() => setShown(null), mine ? 2600 : 1600);
    return () => clearTimeout(t);
  }, [key, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tab title while it's your turn.
  useEffect(() => {
    const base = document.title.replace(/^● Your turn · /, '');
    document.title = mine ? `● Your turn · ${base}` : base;
    return () => { document.title = document.title.replace(/^● Your turn · /, ''); };
  }, [mine]);

  if (!shown) return null;
  return <div key={shown.n} className={`turn-banner${shown.mine ? ' mine' : ''}`} role="status" aria-live="polite">{shown.text}</div>;
}
