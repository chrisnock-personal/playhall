# Ship2Shore (design, approved 2026-11-15)

A hidden-role game for 5-11 players, set aboard a merchant ship in a 1943
convoy. Everyone has a secret allegiance, and the crew take turns steering a
ship that could end up in three different ports. Players who lose the crew's
trust are thrown to the sharks.

Asked for on 2026-11-15, inspired by the hidden-faction steering game *Feed the
Kraken* (Funtails). Game mechanics can't be owned; everything else here (the
setting, factions, names, rules text, map and artwork) is ours, and nothing
from that game's rulebook, map or art is copied. Name and details are a draft
to refine.

## The setting

The SS *Marigold*, a merchant ship that has lost its convoy in the Bay of
Biscay. Her new crew was signed on in a hurry at the last port, and not all of
them are who they say they are.

## Factions (secret, dealt at the start)

| Faction | Wants the ship to reach | Notes |
|---|---|---|
| **Royal Navy** (the loyal crew) | **Plymouth**, the Allied port to the north-east | The majority |
| **Spies** (enemy agents) | **The U-boat rendezvous** to the south-west | Learn who the other spies are before play (at night, as in the room's private reveal) |
| **The Black Market** | **Lisbon**, the neutral port to the south | One **Fixer**, who starts alone and can **bribe** others onto their side during play. The Fixer also wins if thrown to the sharks: "a body was never found" |

| Players | Navy | Spies | Fixer |
|---|---|---|---|
| 5 | 3 (or 2) | 1 (or 2) | 1 |
| 6 | 3 | 2 | 1 |
| 7 | 4 | 2 | 1 |
| 8 | 4 | 3 | 1 |
| 9-11 | 5 | 3-4 | 1 (+1 recruit at 11) |

Teams win together, including players already thrown to the sharks.

## A round

1. **The captain picks the bridge watch**: a **first officer** and a
   **helmsman**, not players who are off watch.
2. **Vote of no confidence.** Everyone else secretly commits 0 or more of their
   **rounds of ammunition** (3 each at the start). If the total reaches the
   threshold (3 for 5-7 players, 4 for 8-9, 5 for 10-11), the captain is
   overthrown: whoever committed most becomes captain (ties broken by the old
   captain), and everyone who committed loses those rounds. Otherwise all
   rounds go back.
3. **Plotting the course.** The captain and first officer each draw two
   **course orders**, keep one and discard one, unseen. The helmsman sees the
   two kept orders, discards one, and the captain reveals the other and
   carries it out: the ship moves one sea area in that order's direction
   (north-east, south-west or south), then any **chart action** on the new
   area happens, then the order's own effect.
4. **Off watch**: the helmsman (and in bigger games the first officer and
   captain) rest for one round.

Nobody on the bridge may talk or signal while plotting; afterwards everyone
may claim what they saw, truthfully or not.

**Abandoning post.** A helmsman who won't carry out the orders can jump
overboard instead: both orders are discarded unseen, they're out, and the
captain must pick an emergency helmsman at once.

## Course orders (the deck)

| Order | Direction | Effect |
|---|---|---|
| Steady as she goes | any | None |
| Shore leave | any | The captain is relieved: the captaincy passes to the player with the fewest orders carried out |
| Arms locker | north-east | The helmsman gains a round |
| Confiscated | north-east | The helmsman loses a round |
| Radio intercept | south-west | A chosen player secretly looks at the last three discarded orders |
| Spotter | south-west | A chosen player looks at the top order and keeps or discards it |
| Contraband | south | The Fixer's move: a **bribe**, a **cash stash** (the Fixer quietly hands out up to three rounds), or a **look at the bridge** (the Fixer secretly sees the three bridge players' allegiances) |

## Chart actions (on some sea areas)

| Action | What happens |
|---|---|
| **Kit inspection** | The captain secretly sees one player's allegiance (and may lie about it) |
| **Interrogation** | A chosen player shows everyone one allegiance they are *not* (picked at random from the two they aren't) |
| **Radio silence** | A chosen player may no longer speak or type, and can't become captain |
| **Sharks** | The captain throws another player overboard. If that's the Fixer, the Black Market wins at once |

Players who have been inspected or interrogated can't be bribed afterwards.

## Why it suits Playhall

- **Hidden information** is the per-seat view the game contract already has:
  your allegiance, your orders and private looks reach only you.
- **Secret moments** ("spies, see each other"; "the Fixer bribes someone")
  are private messages to the players concerned, with no one having to close
  their eyes.
- **Players thrown to the sharks become watchers**, and the gallery is already
  hidden from players during the game, so the dead can talk freely without
  giving anything away.
- **Talking is the game**, so it shines with phase 2's voice; the table chat
  works until then.
- **Scoring**: the winning faction's players share first place (1 point each
  under the current rules, or 3 each if we treat it as a team win; to decide).

## Artwork and names

All ours: a period-poster style (the ship, a chart of the Bay of Biscay, order
cards like stamped dispatches, faction badges), drawn for the card and board
kit. "Ship2Shore", the ship's name and ports are working names; check them
before release.

## Open questions, with recommendations

- **Points for a team win.** Recommended: every player on the winning faction
  scores as a winner (3 points), everyone else 0, including players thrown to
  the sharks on the losing side. "Shared first place" (1 each) would make a
  team win worth less than a draw in chess. Needs a `teamWin` flag on results.
- **The Fixer's shark escape.** Recommended: keep it. It makes throwing anyone
  to the sharks a gamble, which is the heart of the game; the Black Market
  still has Lisbon as its main route.
- **Map size.** Recommended: two charts, a short one for 5-7 players and a
  longer one for 8-11 (with a resupply line where everyone tops up to three
  rounds).

## Where it fits

After the card games in phase 1 (it needs hidden hands, private actions and
a deck, which Blackjack, Colour Clash and Hold'em build first), and at its
best with phase 2's voice.

## Rules as built (2026-11-16)

Built in `src/shared/games/ship2shore.ts` (rules), `src/client/games/ship2shore.tsx`
(stage) and `ship2shore-art.tsx` (pieces; preview in
[mockups/ship2shore-pieces.html](mockups/ship2shore-pieces.html)). The three
recommendations above are followed: team wins score 3 for every member
(`teamWin` on results), the Fixer wins if thrown to the sharks, and there are
two charts. Where the plan left something open, the simplest sensible rule:

**Who's who**
- Roles: 5 players 3 Navy / 1 Spy / Fixer; 6: 3/2; 7: 4/2; 8: 4/3; 9: 5/3;
  10: 5/4; 11: 5/4 plus a **Smuggler**, the "+1 recruit": Black Market from
  the start. The Fixer and the Smuggler know each other.
- A **bribed** player keeps their card but their allegiance becomes Black
  Market: they learn who the Fixer is (and the Fixer sees all of their
  people); inspections show the new allegiance; they win with Lisbon (or the
  Fixer's sharks) and lose with their old side. Bribed spies still know the
  other spies.
- Ammunition is secret: only you see your rounds. Votes are shown, per
  player, once everyone has voted.
- The first captain is drawn at random.

**A round**
- The captain picks first officer and helmsman from players aboard. Off watch:
  last round's helmsman; from 8 players also last round's first officer and
  captain. If that leaves fewer than two to pick from, nobody is off watch.
- Everyone aboard except the captain votes (0 is a vote, so nobody is left out
  in a way that gives away an empty pouch). A silenced player can't take
  command: the biggest backer who isn't silenced does; if only silenced
  players committed, the captain stays and the rounds go back. After a mutiny
  the new captain picks a new watch and plotting starts at once: **no second
  vote that round**.
- The helmsman sees the two kept orders in random order, so doesn't know who
  kept which.
- **Abandoning post**: the emergency helmsman (anyone aboard but the captain
  and first officer) steers fresh orders: captain and first officer draw two
  again. Not allowed with only three aboard. Jumping is not "thrown to the
  sharks": a Fixer who abandons post just drowns (no Black Market win).
- **Never fewer than three aboard**: with three left, the sharks find nobody
  and nobody may abandon post.

**The deck (28 orders, ours)**: north-east: Steady ×6, Shore leave, Arms
locker ×2, Confiscated ×2; south-west: Steady ×6, Shore leave, Radio intercept
×2, Spotter ×2; south: Steady, Shore leave, Contraband ×4. Carried-out orders
are kept face up; discards face down. When the deck runs short, both piles
are shuffled back in.
- **Shore leave**: command passes to the player aboard (not the captain, not
  silenced) with the fewest orders carried out as captain; ties go round the
  table from the captain.
- **Radio intercept / Spotter**: the captain picks the player (anyone aboard,
  themselves included). The spotter's choice (left on top or discarded) is
  public; the card isn't.
- **Contraband**: everyone aboard is asked and answers ("Carry on"), so the
  Fixer isn't the only one with something to do. Bribe: anyone aboard not
  already Black Market and never inspected or interrogated. Cash stash: one
  to three new rounds to anyone aboard, the Fixer included; each recipient
  learns only that someone handed them rounds. Look at the bridge: this
  round's captain, first officer and helmsman.

**The charts**: sea areas on a slanted grid (north-east is up-right, south-west
down-left, south straight down). Short (5-7): 7 areas across × 5 down;
Plymouth or the rendezvous 4 steps east or west of the start, Lisbon 5 south.
Long (8-11): 9 × 6; 5 steps either way, Lisbon 6 south, and a resupply line
between the third and fourth rows (crossing it heading south tops everyone
aboard up to three rounds; more than three are kept). Chart actions are
spread over both (see `CHARTS`). Moves from an area always stay on the chart
or reach a port. In random-play simulations each port wins roughly a quarter
to a third of games; real tuning needs playtests.
- Chart actions use the captain at that moment; kit inspection, interrogation,
  radio silence and sharks can't pick the captain. Radio silence is a marker
  (the game can't mute the chat): the player is asked to keep quiet.

**Endings and leaving**
- Places: the winning faction (including players in the water) first, all
  scoring 3; everyone else, then players who resigned.
- A player who **resigns** can't win; their duties are played automatically
  (as if their time ran out) and they can still be picked or thrown over. If
  everyone still aboard has resigned, nobody wins.
- **Timeouts**: the captain's picks at random; a vote of 0; keep the first of
  two orders; the helmsman discards at random; a spotter leaves the card; the
  Fixer looks at the bridge; everyone else carries on.
- Replays show what a watcher saw: roles and secrets only in the last frame.

**Known tells**: who still has to act is public (the room's turn list), so in
a contraband round the Fixer may be the last to answer, as at a real table.
