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
