# Backlog

Ideas not yet scheduled into a phase, newest first, then what has been built
from this list. The phases themselves are in [design.md](design.md#phases).

## Still open

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
