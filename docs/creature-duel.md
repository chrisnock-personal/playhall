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
