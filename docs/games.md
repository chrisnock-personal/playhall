# Phase 1 games

The list for phase 1 (user, 2026-11-15): chess, checkers, poker, blackjack,
four in a row, snakes and ladders, an Uno-style card game, Ludo and a
Battleship-style game. All of them should feel like one set: shared boards,
pieces, cards, dice and chips where the games overlap.

## Names

Some of these are trademarks of the games' publishers (Uno: Mattel; Connect 4
and Battleship: Hasbro). Playhall uses the generic game, its own name and its
own artwork:

| Asked for | In Playhall | Players |
|---|---|---|
| Chess | Chess (done) | 2 |
| Checkers | Checkers (English draughts, 8×8) | 2 |
| Connect 4 | Four in a Row | 2 |
| Battleship | Sea Battle | 2 |
| Snakes and Ladders | Snakes and Ladders | 2-4 |
| Ludo | Ludo | 2-4 |
| Uno | Colour Clash (a shedding game: match colour or number; our own deck) | 2-8 |
| Poker | Texas Hold'em, play chips only | 2-8 |
| Blackjack | Blackjack against the house, play chips only | 1-6 |

Poker and blackjack use play chips only: no real money, nothing to buy, no
cashing out.

## What the game contract needs (src/shared/game.ts)

Chess got by with two fixed seats, public state and no luck. The new games
need five things, all added once for every game:

1. **Variable seats**: `minPlayers` and `maxPlayers`; the seats list goes up to
   the maximum and the host can start once the minimum are seated. The room
   engine, the seats panel and the lobby's "Players 2 / 4" already work per
   seat.
2. **Hidden information**: `view(state, viewer, now)` where `viewer` is a seat
   or null for watchers. Hands, fleets and hole cards are only in their
   owner's view. Watchers see the public view by default; a room rule can show
   them everything (like poker on television), which is safe because the
   gallery is already hidden from players during play, plus the watcher delay
   from the design.
3. **Luck on the server**: the room engine passes a random source into
   `create` and `act`; shuffles and dice happen on the server, never in the
   browser. A seeded source makes the rules testable and a finished game
   replayable.
4. **Actions out of turn**: Sea Battle's placement is simultaneous and a
   poker hand has folds and timeouts. `act` already takes any seat; games
   decide who may act when.
5. **Results for more than two**: a result becomes a ranking of seats
   (`placings`) rather than one winner. Points (user, 2026-11-15):

   | Result | Points |
   |---|---|
   | Sole winner | 3 |
   | Second place, in games of three or more (shared second: 1 each) | 1 |
   | Shared first place (a draw) | 1 each; nobody gets second-place points |
   | Everyone else | 0 |

   Two-player games stay win 3, draw 1, loss 0 (the loser isn't "second").
   In the W/D/L columns a sole first is a win, a shared first a draw, and
   anything else (second place included) a loss. Head-to-head records stay
   two-player only.

Room-level additions that every game gets for free: an optional **move timer**
(so nobody can stall a game of Ludo forever), a "your turn" banner, the
player's colour on their seat card, and the end-of-game card.

**Scoring the house games.** Blackjack has no opponent at the table, so a
"game" is a session of a fixed number of hands (10 by default) from the same
starting chips; the most chips at the end wins (3 points), equal chips share
(1 each). Hold'em is a sit-and-go: everyone starts with the same chips, the
blinds rise, the last player with chips wins. A solo blackjack session doesn't
count for the leaderboard.

## One look for every game (the shared kit)

Everything below lives in `src/client/kit/` and is used by every game that
needs it, so the games read as one family:

| Piece of the kit | Used by | Notes |
|---|---|---|
| **Square board** | Chess, Checkers, Sea Battle (two 10×10 grids), Four in a Row (as a frame) | Chess's colours: light `#E6D5B3`, dark `#A97F57`, last-move amber, the same coordinates |
| **Track board** | Ludo, Snakes and Ladders | The same wood palette and border; our own drawn snakes and ladders |
| **Player colours** | Every game with more than two sides | Four colours that differ in lightness as well as hue (amber, teal, violet, rose), so they work for colour-blind players; plus white and black for chess and checkers |
| **Discs** | Checkers men and kings, Four in a Row counters, Ludo tokens | One flat disc with a rim, in the player colours; a crown for a king |
| **Pawn token** | Snakes and Ladders | The pawn from the Playhall logo, in the player colours |
| **Die** | Snakes and Ladders, Ludo | One die, rolled on the server, one short roll animation |
| **Cards** | Hold'em, Blackjack (standard 52), Colour Clash (our own 108-card deck in the same frame) | One card face design and one back with the Playhall mark |
| **Chips** | Hold'em, Blackjack | One chip set; amounts always shown as numbers too |
| **Turn and result UI** | All | The room's banner, clocks and result card, not each game's own |

Chess keeps chessground's pieces (cburnett), which people know; the discs and
the logo's pawn are drawn to sit beside them.

## The games

| Game | What's new for the platform | Rules from | Reuse |
|---|---|---|---|
| Four in a Row | First game on the kit; gravity drops | Own (tiny) | MIT Python game for bot levels later |
| Checkers | Square board and discs; forced captures, multi-jumps, kings | Own | |
| Snakes and Ladders | Dice; 2-4 players; placings | Own | yashksaini/snakes-and-ladders-game has no licence: ideas only |
| Ludo | Track board, tokens, captures, safe squares | Own | ShashankGupta10/ludo (MIT, TypeScript): board layout constants |
| Sea Battle | Hidden fleets; simultaneous placement | Own | |
| Blackjack | Cards, chips, the house, sessions of hands | Own | carlssonk/Blackjack-Game-Multiplayer has no licence: ideas only |
| Colour Clash | Our own deck; draw pile; reverse/skip/draw cards; 2-8 players | Own | eperezcosano/Uno (MIT, two players): flow |
| Texas Hold'em | Betting rounds, side pots, hand ranking, sit-and-go blinds | Own engine; a hand evaluator library (MIT) | opencardroom/openpoker (MIT, Ruby): reference |

## Order

1. **Done**: the contract changes (seats, views, randomness, placings),
   with chess moved onto them unchanged, and the **move timer** (Room rules:
   15 s to 5 min a move; run out and you lose a two-player game).
2. **Done**: **Four in a Row** and **Checkers** on the kit's discs, colours,
   square board and player strip (`src/client/kit/`).
3. **Done**: dice and the track boards: **Snakes and Ladders** and **Ludo**
   (2-4 players, places for everyone, the move timer rolls or moves for you).
4. **Done**: hidden information: **Sea Battle** (secret simultaneous
   placement, fleets revealed at the end).
5. Cards and chips: **Blackjack done** (1-4 players against the house, play
   chips, sessions of 5/10/20 hands; one-player sessions are practice and
   don't count); **Colour Clash done** (2-4 players, our own 108-card deck in
   the player colours, hidden hands); **Texas Hold'em done** (2-4 player
   sit-and-go, side pots, rising blinds, our own hand evaluator; fuzzed for
   chip conservation). **All nine phase 1 games are in.**

Every game ships its own **How to play** (the goal and short sections on
turns, moves and endings), shown in the room's Rules tab and in the lobby.

More candidates (Letterworks, Manor Mystery, a creature card duel) are in
[backlog.md](backlog.md).
**Manor Mystery** is in (3-6 players, the murder at Blackthorn Hall; rules as
built in [manor-mystery.md](manor-mystery.md)).

Leaderboards get a tab per game automatically (from the game list), and "All
games" adds them up. The project overview page waits until these are in, so
it shows phase 1 complete.
