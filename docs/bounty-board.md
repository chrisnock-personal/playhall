# Bounty Board: chess with a bounty shop

A two-player board game on the familiar 8×8 array. Capturing a piece pays a
**bounty** in dollars, and on your turn you may spend dollars on a **gadget**
that changes how one of your pieces moves. Checkmate still wins; the shop is
what happens on the way there. Wild West theme: dust, timber, wanted posters
and coins instead of a wooden chess set.

## The posse (themed pieces)

| Chess piece | Bounty Board piece | Looks like |
|---|---|---|
| King | Mayor | Top hat, star badge |
| Queen | Rail Baron | Bowler, pocket watch, the strongest piece |
| Rook | Stagecoach | A wagon rolling along straight roads |
| Bishop | Sharpshooter | Rifle, diagonal sight-lines |
| Knight | Mustang | Leaping horse |
| Pawn | Greenhorn | Young cowhand with a single step |

Captured pieces go to a **jail rail** beside the board with their bounty
printed on a wanted poster; coins animate into the capturer's tray. A gadget
is a small badge on the piece (spurs, a rifle, a vest), visible to both
players and watchers — there is no hidden information in the shop.

## A turn

1. **Payday:** collect $2. If your piece value is at least 2 behind your
   opponent's, collect $1 more; at least 8 behind, $2 more (see Catch-up).
2. **Shop:** optionally buy **one** gadget from a fixed public menu. Dollars
   carry over; nothing can be sold or swapped. Buying happens before moving.
3. **Move:** move one piece under the usual chess rules plus its gadgets.
   A capture pays at once: Greenhorn $2, Mustang or Sharpshooter $3,
   Stagecoach $5, Rail Baron $8, plus $2 per gadget tier on the victim.
   Capturing gives no extra move.
4. **Check:** a piece attacks every square it could move to or capture on
   under its *current* gadgets. A Mayor may not move into an attacked square,
   check must be answered, and checkmate, stalemate, repetition and the
   50-move rule work as in chess. The Mayor can never buy a gadget.

A Greenhorn reaching the far rank promotes to a Rail Baron and drops any
Greenhorn-only gadgets. En passant and castling are left out: the extra
movement rules are enough for a first version.

## Gadget menu

Fixed prices, no random offers. One gadget per piece per turn, at most two
per piece. This is a first pass to tune by simulated games.

| Gadget | Who | Cost | Effect |
|---|---|---|---|
| Spurs | Greenhorn | $4 | May step one **or two** squares straight forward |
| Sidewinder | Greenhorn | $8 | May also step one square diagonally backwards |
| Long rifle | Sharpshooter | $4 | One extra square of diagonal range |
| Ladder | Stagecoach | $4 | May jump over exactly one adjacent piece (friend or foe) to land two squares away |
| Lasso | Mustang | $4 | Instead of moving, reel an enemy two squares away into the empty square between (never the Mayor) |
| Iron horse | Mustang | $8 | May also jump two squares orthogonally |
| Rail switch | Rail Baron | $8 | Once per game, after moving, slide one extra square along the same line |
| Armoured vest | Any non-Mayor | $8 | The first capture against it is blocked and the vest is discarded; the attacker stays put |
| Bounty hunter | Any | $4 | +$2 payday while behind on piece value |
| Reward | Any | $4 | +$3 whenever one of your pieces makes a capture |

## Catch-up and endings

The snowball is the main risk: a capture buys a gadget that wins the next
capture. Three brakes: payday rises when you are behind on material; captures
of upgraded pieces pay a bonus, making an invested piece a prize; and both
sides see the shop, so a threat can be answered before it lands. Unspent
dollars carry over, but at **40 moves per side the shop closes** — dollars are
then worth nothing and the game plays out with the gadgets already bought.
That keeps the endgame recognisably chess and stops a long payment loop.

## Variants (later)

- **Posse match:** best of three, with gadgets carried over between games and
  dollars reset each game. More build, less scramble.
- **Short round:** 6×6 board, four pieces per side, for a quick table filler.

## In Playhall

- Two seats, computer player, clocks with increment, draw offers, resignation,
  How to play, replays (purchases and bounties recorded move by move), the
  normal leaderboard. Host options: time control and when the shop opens
  (move 1, or after four moves per side).
- Server checks every purchase, move, bounty and check; clients only show
  legal destinations. Table chat announces "the Rail Baron collects $5 for
  the Stagecoach"; watchers see dollars and gadgets.
- Board drawn in the kit's canvas style: dusty sand and timber palette,
  wanted-poster captures, coin slide sounds, badge icons that read without
  colour (so spurs, rifle and vest are distinct for every player).
- A bot can use a fixed shop: search a move as in chess, then compare a small
  set of gadgets by material, bounty and position. Gentle/fair/strong levels
  as for chess. No hidden information to model.
- Main implementation risk: chessground assumes standard movements, so
  custom destinations and captures need a variant overlay or our own board
  renderer. Keep the move generator and gadget rules in `src/shared/games/`
  and the server authoritative.

## To test before building

- Are $2 payday and these bounties too rich? Simulate bot games and tune
  prices before committing to art.
- Buying before moving: does it make captures too easy to set up? Try
  buying *after* the move in a second rules pass.
- Does the catch-up payday actually stop runaway leaders, or just delay them?
- Do Lasso and Armoured vest produce confusing positions (a piece moved by
  an opponent, a capture that does not happen)? If so, simplify those two
  first. Lasso was changed in the prototype from pulling an adjacent enemy
  (whose landing square was always the Mustang's own) to reeling in a piece
  two squares away.

## Rules as built (2026-11-25, #95)

The first version is in `src/shared/games/bountyboard.ts`, with a computer
player in `bountyboard.bot.ts`, rule tests in `bountyboard.test.ts` and a
plain-letter board in `src/client/games/bountyboard.tsx`. It is registered in
both game lists and has a bot, How to play, clocks, draw offers, resigning and
replays. The rules above are unchanged except:

- Greenhorns keep the usual opening double-step; Spurs allows a two-step from
  anywhere else too. En passant and castling remain out.
- Lasso reels in a piece exactly two squares away into the empty square
  between (orthogonally or diagonally), and never touches the Mayor. The
  original "adjacent enemy" wording had nowhere to land: the square toward
  the Mustang was the Mustang's own.
- A rail switch can land on an empty square or capture at the end of the
  extra slide, but cannot capture on the first landing square.
- All purchases, gadget targets and moves are checked in `act` after the
  purchase has been applied, so the server sees the same changed movement the
  player clicked on.
- The bot plays from its own view, takes the best material move with a
  hanging-piece penalty, and buys an affordable gadget on a non-Mayor piece
  (gentle buys nothing and plays with more noise).
- The stage is deliberately unthemed: letters on the shared square board,
  dollar counts, a gadget list and a bounties tab. Wild West art, sounds and
  wanted-poster captures are the next pass.
