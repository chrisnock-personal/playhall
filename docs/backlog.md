# Backlog

Ideas not yet scheduled into a phase, newest first, then what has been built
from this list. The phases themselves are in [design.md](design.md#phases).

## Still open

### Chinese checkers (2026-11-16, #41)

The star-board hopping race for 2, 3, 4 or 6 players: ten marbles each, move
a step or hop over any marble (in chains), first to fill the opposite point
wins. A hex-grid board on the kit, hop chains highlighted and animated, and
bots that favour the longest forward hops.

### Spades, Gin Rummy and Thirty-One (2026-11-16, #39, #40, #42)

More classic card games on the card kit: **Spades** for two pairs (bid
tricks or nil, spades trump, bags, first pair to 500); **Gin Rummy** for two
(draw and discard, melds and deadwood, knock or gin, game to 100);
**Thirty-One** for 2-9 (three cards, best suit total, knock, lives). Bots
for each.

### Casino and hall games (2026-11-16, #43, #44, #45)

**Craps** and **Roulette** with play chips, beside Blackjack and Hold'em, and
**Bingo** (90-ball, 75-ball as an option) for big rooms, numbers called by
the server.

### Party games (2026-11-16, #46, #47, #48)

Our own takes on three party genres, with our own names, words and cards:
**Clue Words** is in (2026-11-24: a 5×5 team word game for four, two
clue-givers who see the key, one-word-and-number clues, a spy that loses the
game, a team chat the clue-giver reads but can't write, and replays), **What Am I?**
(in 2026-11-24: everyone sees your word but you; ask the table yes/no questions,
then guess — with family word categories, host-added words and ranked guesses)
and **Fill the Blank** (in 2026-11-24: a family deck by default, host-added
question and answer cards, hidden hands and anonymous read-outs; no adult deck).
All three party games are in.

### Landgrab (2026-11-16, #49)

A property-trading board game of our own: our own board, places, cards and
art; roll, buy, build, trade, auction; shorter games by a time limit or a
number of rounds; bots that trade sensibly.

### Bridge (2026-11-16, #37)

Contract bridge for four in two partnerships: the deal, the auction (to a
contract, with doubles), dummy laid face up and played by the declarer,
thirteen tricks, Chicago scoring first (rubber as an option, duplicate later
with tournaments). Both partners score a win (`teamWin`). Bots that bid a
simple natural system and play by simple rules make it playable with one to
three people.

### Realm Duel team battles (2026-11-16, #34)

2v2 and 3v3 team battles (and free-for-all) alongside the 1v1 duel: each
player brings a hand, picks a creature, a style and a target on the other
team; attacks resolve in Agility order across all fighters; a team wins when
the other has nobody standing (`teamWin`). Room for abilities that help a
team mate. Bots and AI players can fill seats on either team.

### AI players for more games (#32)

Built for Ship2Shore (see Built below). Next: Manor Mystery and Hold'em, each
with an `AiGame` in `src/shared/` (the position in words, the legal moves as
numbered options, when it may talk, which moves the model makes).

### Computer players for the rest (#18)

Chess (a small engine, or #32), Letterworks (a word search over rack and
board), Manor Mystery (deduction from the notebook), and smarter Ship2Shore
bots that bluff and read the log.

### Tournaments (2026-11-15, #17)

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
- **Builds on**: the move timer (built), rooms opened by the server rather
  than a host, and notifications ("your round 3 game is ready").

### Built-in real-time games

The fifth game type in [design.md](design.md#game-types): games the server
runs on a tick rather than turn by turn (Pong-style), with inputs from the
players' browsers and the state streamed back.

### Learning a game

A short guided first game for each game, and pictures in the rules (drawn
from the kit). Every game already has its How to play.

### Realm Duel in full

The 30-creature pool and the draft mode (players take turns picking from a
shared pool of 10): [creature-duel.md](creature-duel.md).

### Reporting (#21)

Players can report a room or a person; admins see the reports. Hosts can
already remove people from their own rooms.

### Original game ideas (2026-11-16, #35)

Our own games beyond takes on known ones, in two families to start: family
fun (co-operative and quick push-your-luck games for mixed ages) and
hidden-role games (Ship2Shore's engine of rounds, votes and private actions
suits more). Starting ideas are in the issue; next, one-page designs for two
or three and paper tests with bot scripts.

### More games

Under our own names and artwork, like the others ([games.md](games.md)).

## Built

| What | When | Where |
|---|---|---|
| Poophead (the shedding game also known as Palace, #36) and Hearts (#38), with bots | 2026-11-16 | `src/shared/games/poophead.ts`, `hearts.ts` |
| Who Dat?, a guess-the-face game for two, with a bot (#33): [who-dat.md](who-dat.md) | 2026-11-16 | `src/shared/games/whodat.ts` |
| Ship2Shore bots and AI players answer when asked what orders they had | 2026-11-16 | `src/shared/games/ship2shore.talk.ts` |
| AI players for Ship2Shore: a language model on the admin's server makes the social moves and talks; the rule bot makes the arithmetic ones and steps in (#32) | 2026-11-16 | `src/shared/ai.ts`, `src/server/ai.ts` |
| Leaderboard podium: gold, silver and bronze crowns, streaks, points bars | 2026-11-16 | `src/client/pages/Leaderboard.tsx` |
| Computer players for ten games (#18) | 2026-11-16 | `src/shared/bots.ts` |
| Hold'em for 2-8, Blackjack for 1-7 (#16) | 2026-11-16 | the game modules |
| A roomier room layout; Ship2Shore's hex chart with headings per area | 2026-11-16 | [ship2shore.md](ship2shore.md) |
| Animations and table sounds (#28, #29) | 2026-11-16 | `src/client/kit/` |
| Ship2Shore, a hidden-role game for 5-11 (#11) | 2026-11-16 | [ship2shore.md](ship2shore.md) |
| Manor Mystery and Realm Duel | 2026-11-16 | [manor-mystery.md](manor-mystery.md), [creature-duel.md](creature-duel.md) |
| Letterworks | 2026-11-15 | [letterworks.md](letterworks.md) |
| How to play for every game | 2026-11-15 | `howToPlay` in each game module |

- **Reports (#21), done 2026-11-22:** players report a room or a person from the People tab (reason, optional words); the report keeps the room's last 30 chat lines; admins see open reports on the Platform page, mark them dealt with (with a note) or reopen them. Later: a badge on the Platform link when reports are open, and an admin action to suspend an account.

- **Progression (#50), done 2026-11-23:** an admin puts an account on the ladder (Accounts card); the admin orders games into tiers with the wins needed to open the next (Progression ladder card; a suggested four-tier ladder to start from). A player on the ladder can play and host only the open tiers' games and watch any room; wins in open games (bot games too) open the next tier; the lobby shows their ladder and locks the rest. Admins can't be put on it. Later: hide the Sit here buttons for locked players, and a note in the room when a tier opens.

- **Tournaments (#17), done 2026-11-23:** two-player games; knockout (seeded bracket, byes for the top seeds, a drawn game replayed in the same room), round robin (circle method) and Swiss (score groups, no rematches, one bye each at most); any account can run one (open, or by link), guests can't enter; Playhall opens a listed room per match with both players seated, the tournament's game settings and move timer, counted on the leaderboards; results come from the games, later games in a decided room are friendlies; a player not in the room by the deadline loses by forfeit if the other is there; the organiser can settle a match; the table uses Buchholz (Swiss) or Sonneborn-Berger (round robin); the lobby and the tournaments list say when your game is ready. Follow-ups: #59-#61.

- **Polish, 2026-11-23:** #52 (players on the ladder no longer see Sit here or Ask for a seat in locked games, a note instead; a new tier is announced in the room's chat), #61 in part (a browser notification and the tab title when your tournament game is ready, on any page; the bracket drawing and past tournaments on stats still to do), #51 (a badge on the Platform link with the open reports; admins suspend an account from Accounts or straight from a report, with a reason the player sees; suspended sessions stop at once).

- **Bots for chess, Letterworks and Manor Mystery (#18), 2026-11-23:** chess searches two moves ahead plus captures until quiet (material and placement, a little randomness; about 0.3 s a move); Letterworks searches every row and column letter by letter on the server's word list (bots get isWord/isPrefix), checks cross words, scores with the game's own scoring, picks among its better moves and keeps an S or a blank for a bigger one, swaps when stuck; Manor Mystery deduces from shown cards, hidden shows, full hands and cards nobody holds, and only accuses when certain (bot games: always solved, never a wrong accusation). Every game but the camera table now has bots. Follow-up: difficulty levels (#62).

- **Follow-ups, 2026-11-24:** bot levels (#62: gentle, fair, strong for chess, Letterworks, Manor Mystery, Four in a Row and checkers; the name says gentle or strong); 75-ball Bingo, a pause anyone playing can use, and calls read aloud (#53); Chinese checkers team play (#54); Roulette splits, streets, corners and six lines (#55); Craps come, don't come and place bets (#56; no odds on come bets yet); tournament organiser tools (#60: withdrawing a player, ten more minutes, late Swiss entries before round 2, and when neither player turns up, both lose in Swiss and round robin, the higher seed goes through in a knockout).

- **Learning a game (#57), 2026-11-24:** Learn by playing (the lobby's New room form, under How to play) opens a private, casual practice room with the player seated and gentle bots in the seats the game needs; a coach panel says what to do now (each game's own line for your turn and the bots' turns) and steps through the rules as tips; it can be hidden. Pictures in the rules, drawn with the games' own pieces, for Four in a Row, checkers, Hearts, Spades, Thirty-One, Gin Rummy, Bingo, Letterworks, Realm Duel and Craps.

- **AI players for Hold'em and Manor Mystery (#32), 2026-11-24:** Hold'em: the model gets its cards, the board, its best hand and the rule bot's estimate of its chance of winning, and makes every decision (fold, call, raise, all in), with table talk. Manor Mystery: the model gets its cards and what the rule bot has deduced, and chooses suggestions, which card to show, and when to accuse (offered only once certain); the rule bot moves. Checked against qwen2.5:7b on the PC: sensible choices, under a second each once loaded.

- **Manor Mystery AI table talk (#70), done 2026-11-24:** the AI now talks at the table, but the line is written after the choice from the move it made: a suggestion or accusation names exactly those cards, and showing a card stays private. A model asked to suggest and talk in one answer announced one suggestion while making another, so it doesn't write these lines itself.

- **Pictures in the rules (#69), done 2026-11-24:** the remaining built-in games now have pictures in How to play — chess's pieces, Snakes and Ladders, Ludo, Sea Battle, Blackjack, Colour Clash, Hold'em hand rankings, Manor Mystery's notebook, Who Dat, Poophead's special cards, Chinese checkers' hop chain, Roulette's bets, Bridge's auction, Realm Battle and Ship2Shore's order headings. Every built-in game has one now.

- **Realm Battle teams (#68), part done 2026-11-24:** in team games Mend heals and Shield covers (for that fight) whoever on the side is most hurt by share of Health, the creature itself included and kept on a tie; free-for-all keeps Realm Duel's abilities. Each side also has a private text chat tab, filtered by the room so the other team and watchers can't read it, and so the next side to take those seats can't read the last game's lines. Still to do from #68: the 30-creature pool/draft shared with Realm Duel.

- **Realm Battle team voice (#82), done 2026-11-24:** each side also has an audio-only voice channel beside its chat tab, with the same player-only, per-game rules: watchers and the other side can't join, and each game gets a new LiveKit room so the next side to take those seats can't use the last game's channel. A new game closes the old side rooms. The 30-creature pool/draft from #82 is still to do.

- **Clue Words (#46), done 2026-11-24:** our own four-player team word game.
  Amber and Violet (Sun) play Teal and Rose (Moon) on a 5×5 board of nine Sun
  words, eight Moon words, seven neutral and one spy; one clue-giver per side
  sees the key and gives one word with a number, and their guesser reveals up
  to one more word than that before stopping or passing the turn. Finding
  every word wins for the team; the spy loses instantly. Clue-givers and
  watchers see the key, guessers only see revealed identities, each side's
  team chat is read-only for its clue-giver, and replays show the watcher's view. Later: bots and AI,
  picture mode and host word lists.

- **What Am I? (#48), done 2026-11-24:** a 3-8 player talking game. Everyone
  sees your word but you; on your turn you ask a short question, the others
  answer yes, no or maybe with buttons and talk it over at the table, and you
  guess when ready. One turn each; a correct guess takes a place by how few
  questions it took, with shared places on ties. The host picks a family word
  category (animals, food, jobs, story characters or a mix) and can add their
  own words. Watchers see every word, and replays show the watcher's view.
  Later: bots, AI and an adult deck.

- **Fill the Blank (#47), done 2026-11-24:** a 3-8 player saying game. A judge
  reads a question with a blank; everyone else slips in one card from a hidden
  hand of five, and the cards are read out with letters instead of names before
  the judge picks a favourite. One point a round, one round per player, most
  points wins with shared places on ties. The family deck is built in and the
  host can add their own question and answer cards; no adult deck, bots or AI.
  Watchers get the read-out but never a hand, and replays show the watcher's view.

- **Tournament tables and pairs (#59), done 2026-11-24:** Swiss tournaments can
  seat 3-6 entries at a table (any game with that many seats), with points for
  first, second and so on chosen by the host (3-2-1-0 by default). Each round
  groups entries by score into tables, avoids tables that have already met and
  gives leftovers a bye; the bracket and pair formats still use 1-½-0. Results
  come from a game's finishing places as well as its winner; the organiser can
  settle a whole table by picking the winner, and forfeits and withdrawals place
  the rest. Spades can be run as pairs: partners are found by account name before
  entering, sit across from each other, and score and stand together as one
  entry (both accounts see the tournament and keep the result).
