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

## Pieces (mockups approved 2026-11-15)

- **Tile:** cream with a heavy letter and its value bottom right, in the kit's
  wood style. States: picked up (lifted, amber outline), placed this turn
  (pale with an amber ring), last move (gold), makes a word that isn't
  allowed (rose ring).
- **Blank:** empty on the rack; once played, its letter shows in blue italic,
  worth 0, chosen from an A-Z picker.
- **Bonus squares:** warm reds for word bonuses (3W #B5523B, 2W #D9917E), cool
  blues for letter bonuses (3L #2E7A8C, 2L #8CC3CF), the star on a 2W colour;
  each keeps its label until covered.
- **Rack:** a wooden rack under the board (full width on a phone, tiles at
  least 44px); a tile bag with the count left. Drag, or tap a tile then a square.
- **Tile set (draft, to tune by simulation):** E 11, A 8, I 8, O 8, T 7, N 6,
  R 6, S 5, D 5, L 4, U 3, C 3, M 3, H 3, P 2, G 2, B 2, F 2, W 2, Y 2,
  K 1, V 1, J 1, X 1, Q 1, Z 1, and 2 blanks (100). Values: A1 B3 C3 D2 E1
  F4 G3 H3 I1 J9 K5 L1 M3 N1 O1 P3 Q9 R1 S1 T1 U2 V5 W4 X8 Y4 Z9.
