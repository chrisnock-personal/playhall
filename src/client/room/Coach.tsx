// The coach for practice rooms (#57): what to do now, in words, while you
// play your first games against gentle bots; and the rules as tips, one at a
// time. Hide it when you've got the hang of it.
import { useEffect, useState } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { useGames } from '../useGames';

/** What to do on your turn, and what to watch for on the bots', game by game. */
const LEARN: Record<string, { turn: string; watch?: string }> = {
  chess: { turn: 'Tap one of your pieces to see where it can go, then tap a square. Try to keep your pieces protected, and look for pieces of the bot’s you can take for free.', watch: 'Each piece moves its own way: see the rules tips below.' },
  fourinarow: { turn: 'Tap a column to drop your disc. Make four in a line (across, down or diagonally), and block the bot when it has three.', watch: 'Look at where its last disc landed: is it building three in a row?' },
  checkers: { turn: 'Tap one of your pieces, then where it should go: diagonally forward. If you can jump the bot’s piece, you must.', watch: 'Reach the far row and your piece is crowned: it can move backwards too.' },
  snakes: { turn: 'Press Roll. Your counter moves by itself: ladders take you up, snakes take you down. First to 100 wins.' },
  ludo: { turn: 'Press Roll. You need a 6 to bring a piece out; then tap the piece to move. Landing on someone sends them home.' },
  seabattle: { turn: 'Place your ships first (or let them be placed for you), then tap a square on the bot’s board to fire. A hit lets you fire again nearby.' },
  blackjack: { turn: 'Place a bet, then Hit for another card or Stand. Get closer to 21 than the dealer without going over.' },
  colourclash: { turn: 'Play a card that matches the top card’s colour or number. Can’t? Draw one. Empty your hand first.' },
  poker: { turn: 'Check or call to stay in, raise with a strong hand, fold a weak one. The best five cards from your two and the five shared ones win.' },
  letterworks: { turn: 'Tap a tile on your rack, then a square on the board. Make a word that joins what’s there (the first covers the centre star), then press Play. The score shows before you play.', watch: 'Short words that use a tile on a coloured square score well.' },
  realmduel: { turn: 'Pick one of your creatures and an attack style (the button shows how hard it hits), then Lock in. Then both are shown and they fight.', watch: 'Elements matter: Fire beats Air, Air beats Earth, Earth beats Water, Water beats Fire.' },
  realmbattle: { turn: 'Pick a creature, a style and which player to attack, then Lock in. Ganging up with your team mate on one enemy works well.' },
  manormystery: { turn: 'Move to a room, then suggest who did it and with what. Other players show you a card that proves you wrong; tick it off in your notebook. Accuse only when you’re sure.' },
  ship2shore: { turn: 'Follow what the game asks: vote, pick a crew, or choose a course card. Your role card says which side you’re on.' },
  whodat: { turn: 'Ask a yes-or-no question about the faces, then flip down the faces it rules out. Guess when one face is left.' },
  hearts: { turn: 'Pass three cards you don’t want, then follow the suit led. Avoid winning hearts and the queen of spades.' },
  poophead: { turn: 'Play a card as high as the top of the pile or higher (2 and 10 are special). Can’t? You pick up the pile.' },
  spades: { turn: 'First bid how many tricks you think you’ll win; then follow suit if you can. Spades beat every other suit.' },
  thirtyone: { turn: 'Take the top card of the deck or the discard, then throw one away. Collect one suit to get close to 31; knock when you’re ahead.' },
  ginrummy: { turn: 'Take a card, then throw one away. Your melds are arranged for you; knock when your deadwood is 10 or less.' },
  bingo: { turn: 'Numbers are called by themselves: tap them on your ticket when they come up (or tick Auto-mark). One line, two lines, then a full house.' },
  chinesecheckers: { turn: 'Tap one of your marbles: the white dots show where it can go, including long chains of hops. Race them all to the opposite point.' },
  roulette: { turn: 'Pick a chip value, tap where to bet (a number, a colour, a dozen…), then press Done. The wheel spins when everyone is done.' },
  craps: { turn: 'Put chips on the Pass line before the come-out roll, then press Done. 7 or 11 wins straight away; any other number becomes the point to roll again before a 7.' },
  bridge: { turn: 'In the auction, bid how many tricks over six you think your pair can win (the box shows only the allowed bids), or pass. Then follow suit; trumps beat other suits.' },
};

export function Coach({ snap }: { snap: RoomSnapshot }) {
  const games = useGames();
  const rules = games.find((g) => g.id === snap.room.gameId)?.howToPlay;
  const tips = rules ? [rules.goal, ...rules.sections.flatMap((s) => s.points)] : [];
  const [tip, setTip] = useState(0);
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(`playhall.coach.${snap.room.code}`) === 'hidden'; } catch { return false; } });
  useEffect(() => { try { sessionStorage.setItem(`playhall.coach.${snap.room.code}`, hidden ? 'hidden' : 'shown'); } catch { /* not saved */ } }, [hidden, snap.room.code]);
  if (!snap.room.settings.practice) return null;
  if (hidden) return <button className="btn small coach-show" onClick={() => setHidden(false)}>Show the coach</button>;

  const learn = LEARN[snap.room.gameId];
  const me = snap.you.seat;
  const g = snap.game;
  const mine = !!me && g.status === 'playing' && g.turnSeats.includes(me);
  const others = g.turnSeats.filter((s) => s !== me).map((s) => snap.seats.find((x) => x.id === s)?.name ?? s);
  let now: string;
  if (g.status !== 'playing' && !g.result) now = me ? 'You’re sitting down with gentle computer players. Press Start the game when you’re ready; the tips below explain the rules as you go.' : 'Take a seat to start learning.';
  else if (g.result) now = 'That’s the game! Press Rematch (or Start the game) to play again, or review the game to see how it went. When you’re ready, play people from the lobby.';
  else if (mine) now = `Your turn. ${learn?.turn ?? 'The board shows what you can do: playable things are highlighted.'}`;
  else now = `${others.length ? `${others.join(' and ')} ${others.length === 1 ? 'is' : 'are'} thinking.` : 'Waiting.'} ${learn?.watch ?? 'Watch what the computer players do: they follow the same rules you do.'}`;

  return (
    <aside className="coach" aria-label="The coach" role="note">
      <div className="coach-head"><strong>Coach</strong><button className="icon-btn small" aria-label="Hide the coach" onClick={() => setHidden(true)}>×</button></div>
      <p className="coach-now">{now}</p>
      {tips.length > 0 && (
        <div className="coach-tip">
          <span className="muted small">Rule {tip + 1} of {tips.length}</span>
          <p>{tips[tip]}</p>
          <div className="coach-nav">
            <button className="btn tiny" disabled={tip === 0} onClick={() => setTip(tip - 1)}>Back</button>
            <button className="btn tiny" disabled={tip >= tips.length - 1} onClick={() => setTip(tip + 1)}>Next rule</button>
          </div>
        </div>
      )}
    </aside>
  );
}
