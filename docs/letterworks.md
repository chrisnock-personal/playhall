# Letterworks (design draft)

A crossword tile game for 2-4 players: build words on a shared board from a
private rack of letter tiles. The generic game; "Scrabble" is Hasbro's (and
Mattel's) name, and its exact board layout and tile set are theirs, so
Letterworks has its own.

## Ours, not theirs

| | Letterworks |
|---|---|
| Board | 15 × 15 with our own symmetric pattern of bonus squares: **2L / 3L** (double/triple letter) and **2W / 3W** (word), placed differently from the commercial game, plus the centre star |
| Tiles | 100 tiles: our own counts and values worked out from English letter frequencies (common letters many and cheap, rare letters few and valuable), and 2 blanks |
| Bonus | Using all seven tiles in one turn: +40 |
| Word list | **ENABLE** (public domain, about 173,000 English words). Not a licensed tournament list. Optionally a family list that leaves out offensive words |

## Rules

- Each player has a rack of 7 tiles, hidden from everyone else.
- On your turn: **place** tiles in one straight line, connected to the tiles
  already down (the first word covers the centre star); **exchange** any
  number of tiles with the bag (if 7 or more are left); or **pass**.
- Every word the move makes, across and down, must be in the word list.
  Playhall checks it straight away (no challenges, no penalties), and tells
  you which word isn't allowed before anything is placed.
- Scoring: letter values, bonus squares only on the turn they're first
  covered, all words formed, +40 for using all seven tiles.
- The game ends when the bag is empty and one player uses their last tile
  (they gain the value of everyone else's remaining tiles; the others lose
  their own), or after six scoreless turns in a row.
- Places by score; second place earns its point.

## In Playhall

- **Hidden racks** use the per-seat view; the bag is drawn on the server.
- **The board** is the kit's square board at 15 × 15 with a tile variant;
  **tiles** are a new kit piece (a cream tile, the letter, its value).
- **Placing**: drag tiles from your rack (or click a tile, then a square),
  see the score of the move before you commit, recall, shuffle your rack.
- Watchers see the board and scores, not the racks. Move timer, replays (the
  moves are kept), How to play: all as for the other games.

## Open points

- Tile counts and values: generate from a letter-frequency table and tune by
  simulation (self-play with a simple bot) so the game plays well.
- Two-letter words: ENABLE has a short list; consider a help panel.
