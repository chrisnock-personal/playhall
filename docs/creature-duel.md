# Realm Duel: the creature card duel

A two-player card battle: players first draft creatures from a shared pool,
then each round both secretly choose one of theirs and how it attacks. Last
player with creatures standing wins. Realm Battle uses the same creatures and
the same draft.

Based on the rules of [fantasy-card-game](https://github.com/EdwardAThomson/fantasy-card-game)
by Edward Thomson (MIT licence: rules and balance may be borrowed with
credit). Playhall's creatures, names and artwork are its own.

## Creatures

30 creatures, five per element, each with **Strength, Agility, Intelligence,
Defence, Magic** and **Health**. An **element** (Fire, Water, Earth, Air,
Light, Shadow) is strong against two others and weak against two. All have a
**special ability**:

| Ability | Effect |
|---|---|
| Stun (Undertow, Gust) | The target loses its next attack |
| Poison bite | Damage over the next rounds |
| Shield | Halves the next hit |
| Swift | Attacks first on an Agility tie |
| Mend | Heals 4 after a round it fought |

The six starters are Emberfox, Tidecaller, Stonehorn, Galewing, Lumen Stag
and Duskmaw; the other 24 were added with the draft (#82) and use the same
ability set.

## A round

1. Both players **secretly** choose a creature from their hand and an attack
   style: **melee** (Strength), **ranged** (Agility) or **magic** (Magic).
   Choices are revealed together.
2. **Initiative**: Agility + Intelligence + a roll on the server decides who
   strikes first.
3. **Damage**: the attack stat against the defender's Defence, changed by the
   elements and abilities; creatures at 0 Health are out.
4. The game ends when a player has no creatures left.

## Modes

There is one mode: a **draft** from the full 30-creature pool, three creatures
each by default (the host can choose six). Picks are sequential, in snake
order, and a creature can be taken only once per match. The same draft opens
Realm Battle for two, three or four players.

## In Playhall

- **Simultaneous secret choices** work like Sea Battle's placement: both
  pick, nothing is shown until both have.
- Cards in the kit's frame, with a creature illustration, stats and element
  icon. The 24 newer creatures get a simple silhouette varied by id, in the
  element's colour.
- Move timer (a strong available creature is drafted for you, or a choice is
  made for you in a round), How to play, replays, leaderboard, as for the
  other games.
- A computer opponent drafts and fights from the public view only.

## Open points

- Balancing the 30 creatures: tune by simulation
  (`npx tsx scripts/realmduel-balance.ts`).

## Pieces (mockups approved for now, 2026-11-15; may be improved later)

Canvas board 19. The kit's card frame (cream face), simple creature art in
the element's colour plus an element icon (readable without colour); a
violet card back with the logo's arch (distinct from the playing cards'
amber back).

- **Starters (draft, balance by simulation):** Emberfox (Fire; STR 6 AGI 9
  INT 5 DEF 4 MAG 6, HP 28, Swift: strikes first on a tie), Tidecaller (Water;
  4/6/8/5/8, 30, Undertow: Stun on a magic hit 1 in 3), Stonehorn (Earth;
  9/3/4/9/2, 34 (was 40: balanced by simulation, 2026-11-16), Shield: half damage on its first round), Galewing (Air;
  5/8/6/3/6, 26, Gust: Stun on a ranged hit 1 in 4), Lumen Stag (Light;
  6/6/7/6/7, 32, Mend: heals 4 after each round), Duskmaw (Shadow;
  7/6/6/5/8, 30, Poison bite: poisons on a melee hit).
- **Elements:** Fire > Air > Earth > Water > Fire; Light and Shadow beat each
  other; +50% damage against the element you beat.
- **Attacks:** Melee (Strength), Ranged (Agility), Magic (Magic + Intellect).
  Agility decides who strikes first; Defence cuts melee and ranged, Intellect
  cuts magic.
- **Effects:** Poisoned (2 a round), Stunned (misses a round), Shielded (half
  damage). Health bar teal > 50%, amber < 50%, red < 25%; knocked out greys.

## Rules as built (2026-11-16, issue #14)

Where the design above left a rule open, the first version
(`src/shared/games/realmduel.ts`) settled it simply; all of it is open to
tuning.

- **Draft (added 2026-11-24, #82):** the game opens with a shared pool of all
  30 creatures in a fixed order, and players take turns picking three each
  (or six, if the host chose that). Turns run forward then backward through
  the seats — amber, teal, teal, amber, amber, teal — so the later seats get
  two picks in a row. Picks are open to everyone and shown on the table; only
  the seat whose turn it is can click a card. A creature that has been picked
  is dimmed and cannot be taken again. Bot picks and timer picks choose the
  strongest available creature by a simple value (Health and the attack
  stats); no hidden information is used. The fixed order keeps replays and
  saved games simple: only the picks are recorded.
- **Hands:** the drafted creatures become the deal. Unfought cards stay face
  down to the opponent and to watchers; a creature turns face up once it has
  fought, and everything is shown when the game ends.
- **A round:** both lock in a standing creature and a style; a locked choice
  can't be changed. Then the two creatures fight once each.
- **First strike:** higher Agility; a tie goes to Swift, otherwise a coin (the
  server's random). If the first hit knocks the other out, it never strikes.
  (The early "Agility + Intelligence + a roll" idea was dropped for the
  Pieces rule.)
- **Damage:** melee 2 × Strength − Defence; ranged 2 × Agility − Defence;
  magic (Magic + Intellect) − the defender's Intellect; at least 1. Element
  advantage then ×1.5 (rounded down); Shielded then halves (rounded up).
- **Stunned:** the creature loses its next attack, including later in the same
  round if it hasn't struck yet; resting doesn't clear it.
- **Shielded:** Stonehorn starts Shielded; the shield lasts for its first fight.
- **Poisoned:** 2 a round at the end of the round for 3 rounds, even resting;
  a new bite resets it to 3 rounds (no stacking). Poison can knock out.
- **Mend:** Lumen Stag heals 4 (to its maximum) at the end of a round it
  fought in, after poison.
- **End:** last player with creatures standing wins; both sides out at once is
  a draw. A safety limit of 50 rounds decides on creatures standing, then
  total Health (a draw if equal).
- **Move timer:** during the draft it picks one strong available creature for
  the seat whose turn it is. In a round it picks for everyone still choosing:
  their healthiest creature with the style it hits hardest with (no peeking at
  the opponent's choice).
- **Resigning:** ends the duel at once; during the draft hands are empty, so a
  resignation hands the win to the other player without dealing cards.
- **Old saves:** a game saved before the draft has no `phase` and plays as a
  fight; old Realm Battle replays rebuild their draft from the creature kinds
  still in the hands.
- **Balance check:** `scripts/realmduel-balance.ts` now drafts before each
  simulated game, so it can be rerun against the 30-creature pool.
- **Realm Battle:** the same 30-creature pool, drafted by two, three or four
  players in the same snake order. Team mates can plan in their private chat
  during the draft; a resignation mid-draft skips that seat's remaining turns.
