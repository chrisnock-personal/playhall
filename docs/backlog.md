# Backlog

Ideas not yet scheduled into a phase. Newest first.

## Ship2Shore (user, 2026-11-15)

A hidden-role game for 5-11 players aboard a 1943 merchant ship: Royal Navy,
enemy spies and a black-market Fixer, each steering for a different port;
players who lose the crew's trust are thrown to the sharks. Our own take on
the hidden-faction steering game *Feed the Kraken*, with our own setting,
names, rules text and art. Design approved 2026-11-15:
[ship2shore.md](ship2shore.md); to build after phase 1's card games.

## Tournaments (user, 2026-11-15)

A host (or admin) runs a tournament for one game:

- **Formats**: knockout (with byes), round robin, and Swiss for bigger fields
  (chess's usual format: everyone plays every round, paired against people on
  the same score).
- **Sign-up**: an open or invite-only entry list with a cut-off; guests can't
  enter (results need accounts).
- **Rounds**: Playhall pairs the players and opens a room for each game, with
  the tournament's time control and rules, and tells the players where to go.
  Watchers can drop into any board. A missing player loses on time after a
  grace period.
- **Standings**: a tournament page with the bracket or table, tie-breaks
  (Buchholz for Swiss, head-to-head for round robin), and the winner. The
  games count on the ordinary leaderboards too.
- **Builds on**: the move timer (planned), rooms opened by the server rather
  than a host, and notifications ("your round 3 game is ready").

## More games (user, 2026-11-15)

Under our own names and artwork, like the others (docs/games.md):

| Like | Working name | Players | Notes |
|---|---|---|---|
| Scrabble | Letterworks | 2-4 | A crossword tile game. Our own board layout, bonus squares and letter values, and a word list we're allowed to use (an open one such as ENABLE or a Wiktionary-derived list, not a licensed tournament list). Racks are hidden information; the bag is server-side luck |
| Cluedo | Manor Mystery | 3-6 | A deduction game with our own house, suspects and objects. Hidden hands; showing a card to one player only is a private action; the envelope is dealt by the server. Good with voice |
| [fantasy-card-game](https://github.com/EdwardAThomson/fantasy-card-game) (MIT) | Realm Duel (or similar) | 2 | Creature cards with strength, agility, magic and defence, elements and abilities; pick a creature and an attack style each round. MIT, so its rules and balance can be borrowed with credit; the creatures get our own artwork on the card kit |

Names decided 2026-11-15: Letterworks, Manor Mystery (Blackthorn Hall), Realm Duel. Design drafts:
[letterworks.md](letterworks.md), [manor-mystery.md](manor-mystery.md),
[creature-duel.md](creature-duel.md).

## Rules and how to play (user, 2026-11-15)

Every game carries its own **How to play** (`howToPlay` in the game module):
the goal in a sentence or two, then short sections (turns, how pieces move,
how a game ends, tips). It shows in every room's **Rules** tab and in the
lobby when choosing a game. Done for chess and Four in a Row; every new game
must include it. Later: a short guided first game for each, and pictures in
the rules (drawn from the kit).

## Smaller ideas

- **Bot seats**: an opponent from the shared Ollama (as open-chess does), or
  a simple engine per game (minimax for Four in a Row and checkers). Bot games
  don't count for the leaderboard.
- **Reporting** for admins (hosts can already remove people).
