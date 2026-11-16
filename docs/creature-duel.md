# Realm Duel: the creature card duel (design draft)

A two-player card battle: each player has a hand of fantasy creatures with
their own stats, and each round both secretly choose a creature and how it
attacks. Last player with creatures standing wins.

Based on the rules of [fantasy-card-game](https://github.com/EdwardAThomson/fantasy-card-game)
by Edward Thomson (MIT licence: rules and balance may be borrowed with
credit). Playhall's creatures, names and artwork are its own.

## Creatures

About 30 creatures, each with **Strength, Agility, Intelligence, Defence,
Magic** and **Health**, an **element** (Fire, Water, Earth, Air, Light,
Shadow) that is strong against two others and weak against two, and
sometimes a **special ability**:

| Ability | Effect |
|---|---|
| Stun | The target loses its next attack |
| Berserk | More damage, but takes some back |
| Poison bite | Damage over the next rounds |
| Shield | Halves the next hit |
| Swift | Always attacks first |

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

- **Quick battle**: random hands of 3 (or 5) from the pool.
- **Draft**: players take turns picking creatures from a shared pool of 10:
  a good show for watchers, and a skill of its own.

## In Playhall

- **Simultaneous secret choices** work like Sea Battle's placement: both
  pick, nothing is shown until both have.
- Cards in the kit's frame, with a creature illustration, stats and element
  icon. Illustrations are ours; until they're drawn, simple silhouettes.
- Move timer (a random choice is made for you), How to play, replays (the
  rounds are kept), leaderboard, as for the other games.
- A computer opponent is easy to add here (the original has one).

## Open points

- The name ("Realm Duel" is a placeholder).
- Balancing the 30 creatures: borrow the original's stat ranges, then tune by
  simulation.

## Pieces (mockups approved for now, 2026-11-15; may be improved later)

Canvas board 19. The kit's card frame (cream face), simple creature art in
the element's colour plus an element icon (readable without colour); a
violet card back with the logo's arch (distinct from the playing cards'
amber back).

- **Starters (draft, balance by simulation):** Emberfox (Fire; STR 6 AGI 9
  INT 5 DEF 4 MAG 6, HP 28, Swift: strikes first on a tie), Tidecaller (Water;
  4/6/8/5/8, 30, Undertow: Stun on a magic hit 1 in 3), Stonehorn (Earth;
  9/3/4/9/2, 40, Shield: half damage on its first round), Galewing (Air;
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

- **Deal:** each player draws their own three of the six starters at random
  (so the opponent's hand is a real secret, and mirror creatures can meet);
  the host can choose "All six" instead. Unfought cards stay face down to the
  opponent and to watchers; a creature turns face up once it has fought, and
  everything is shown when the game ends.
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
- **Move timer:** the timer is shared, so when it runs out it picks for every
  player still choosing: their healthiest creature with the style it hits
  hardest with (no peeking at the opponent's choice).
- **Balance check:** 20,000 simulated games (random creatures, each one's best
  average style) last about 11 rounds; hands holding Stonehorn win about 60%,
  the others 46-50%. Stonehorn is the first candidate for tuning.
- Not yet: the 30-creature pool, the draft mode, a computer opponent.
