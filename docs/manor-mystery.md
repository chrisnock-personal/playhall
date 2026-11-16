# Manor Mystery (design draft)

A murder-mystery deduction game for 3-6 players: work out **who** did it,
**with what** and **where** before anyone else. The generic deduction game;
"Cluedo"/"Clue" is Hasbro's, and its characters, rooms, weapons and board are
theirs, so Manor Mystery has its own house, people and objects.

## The case (ours)

**Blackthorn Hall, 1926.** The host of a weekend party, Sir Edmund
Blackthorn, is found dead.

| Suspects (6) | Objects (6) | Rooms (9) |
|---|---|---|
| Admiral Hale | A hatpin | The Observatory |
| Dr Okafor | A decanter | The Boathouse |
| Lady Vane | A fire iron | The Chapel |
| Mr Pike, the butler | A croquet mallet | The Wine Cellar |
| Miss Rowe | A length of rope | The Greenhouse |
| Canon Ashby | A brass telescope | The Nursery, the Armoury, the Music Room, the Map Room |

The names and the house are working drafts, chosen to avoid the commercial
game's.

## Rules

- One suspect, one object and one room are dealt secretly into the case
  file; the rest are dealt out to the players (hidden hands).
- **Moving**: instead of a big board of corridors, the house is a map of
  rooms; each turn you move to a connected room (two rooms have hidden
  passages to the far side). This keeps turns quick online.
- **Suggesting**: in a room, name a suspect and an object ("Lady Vane, with
  the hatpin, in the Chapel"). Going round the table, the first player who
  holds any of the three must privately show you one (they choose which).
  Everyone sees *that* a card was shown and by whom, not which.
- **Accusing**: once per game, name all three. If right, you win; if wrong,
  you're out of the running but keep showing cards when asked.
- Places: the solver first; players still in the running share second; those
  who accused wrongly come last.

## In Playhall

- **Private actions**: showing a card is an action by another player, not
  the one whose turn it is: the game asks them (their seat lights up, the
  move timer applies, and on timeout a card is shown for them).
- **Your notebook**: a private grid (suspects, objects, rooms by player)
  that fills in what you've seen and lets you add your own marks: the heart
  of the game, and something a screen does better than paper.
- **Map and cards**: a drawn map of the hall on the kit's style; cards in the
  kit's frame with our own illustrations.
- At its best with phase 2's voice (the table talk and bluffing).

## As built (2026-11-16)

The game is in (`src/shared/games/manormystery.ts`, stage in
`src/client/games/manormystery.tsx`). Where the rules above left a point
open, it does this:

- **The map**: the hall is a 3 × 3 plan, top row the Observatory, Music Room,
  Boathouse; middle the Map Room, Chapel, Greenhouse; bottom the Armoury,
  Wine Cellar, Nursery. Doors join rooms side by side (not diagonally); the
  hidden passages join opposite corners: Observatory ↔ Nursery and
  Boathouse ↔ Armoury. No dice.
- **Start and moving**: everyone starts in the Chapel. Each turn you must
  move one room (staying put isn't allowed), then may suggest in the room
  you're in, then may accuse or end the turn. Suggested suspects aren't
  pieces on the map (players are seat colours, not characters), so nothing
  is moved by a suggestion.
- **Showing cards**: asked in seat order after the suggester. A player with
  exactly one of the three shows it straight away; with two or more they
  choose (the move timer applies to them); with none, the log says they
  couldn't show a card.
- **Accusing**: on your own turn, at any point (before or after moving), when
  no card is waiting to be shown; any room may be named. Only one per game.
  A wrong accuser is **not** shown the envelope (with voice in the room, a
  player who knows the answer could give it away); everyone sees it at the end.
- **The end**: a right accusation wins. If nobody is left in the running
  (everyone accused wrongly or resigned), nobody wins: the envelope is opened
  and the result counts as a shared place for those who accused (a draw).
  If everyone else resigns, the last player in the running wins.
- **Resigning / leaving**: the player's cards are laid face up for everyone
  and they're skipped when cards are asked for.
- **Out of time** (the room's move timer): you move to a random room next
  door if you hadn't moved, and your turn ends; a player who had to choose a
  card to show has one shown at random.
- **Seats**: six seats in the kit's colours: amber, teal, violet, rose, then
  white and black (the kit has only four player colours besides chess's two).
- **Notebook**: the server fills in what you know for certain (your hand,
  cards shown to you, face-up cards, and ✗ for anyone who couldn't show a
  card on a suggestion); your own ✓ ✗ ? marks are kept in your browser per
  game. A card nobody can hold is marked as in the envelope.

## Open points

- Whether to allow a quick "Suggest from anywhere" mode for short games.
- Two more player colours in the kit, to replace white and black for seats 5
  and 6.

## Pieces (mockups approved for now, 2026-11-15; may be improved later)

Canvas board 20. The kit's card frame; each kind has its own band colour and
picture shape so they're told apart without colour:

- **Suspects** (deep red band, round portrait): Admiral Hale, Dr Okafor,
  Lady Vane, Mr Pike, Miss Rowe, Canon Ashby.
- **Objects** (blue band, line drawing): the hatpin, the decanter, the fire
  iron, the croquet mallet, the rope, the telescope.
- **Rooms** (green band, a 3 × 3 plan with the room lit): the Observatory,
  Music Room, Boathouse, Map Room, Chapel, Greenhouse, Armoury, Wine Cellar,
  Nursery.
- **Back:** dark wood with the logo's arch and a magnifying glass.
- **Envelope:** sealed with a red "B" seal; holds who, what, where.
- **Tokens:** the kit's pawns in the seat colours. Notebook marks ✓ ✗ ?.
