// Progression (#50): an admin can turn it on for a player (a child's account,
// say). That player can then play and host only the games their ladder has
// unlocked; they can still watch any room. The admin orders games into tiers;
// wins in the unlocked games open the next tier. Wins against computer
// players count, so a player can climb by practising alone.

export interface LadderTier {
  games: string[];
  /** Wins needed, in this tier's games and the ones before it, to open the next tier. */
  wins: number;
}
export interface Ladder { tiers: LadderTier[] }

export const MAX_TIERS = 8;
export const MAX_WINS = 200;

export const DEFAULT_LADDER: Ladder = {
  tiers: [
    { games: ['fourinarow', 'snakes', 'ludo', 'colourclash', 'whodat', 'bingo'], wins: 3 },
    { games: ['checkers', 'seabattle', 'hearts', 'poophead', 'thirtyone', 'chinesecheckers'], wins: 8 },
    { games: ['chess', 'bountyboard', 'letterworks', 'spades', 'ginrummy', 'blackjack', 'whatami', 'filltheblank'], wins: 15 },
    { games: ['poker', 'roulette', 'craps', 'bridge', 'realmduel', 'realmbattle', 'cluewords', 'manormystery', 'ship2shore', 'cameratable'], wins: 25 },
  ],
};

/** Check a ladder from the admin page against the games there are; returns it tidied, or a reason. */
export function checkLadder(v: unknown, gameIds: string[]): { ladder: Ladder } | { error: string } {
  const tiers = (v as Ladder | null)?.tiers;
  if (!Array.isArray(tiers) || !tiers.length) return { error: 'The ladder needs at least one tier' };
  if (tiers.length > MAX_TIERS) return { error: `The ladder can have at most ${MAX_TIERS} tiers` };
  const seen = new Set<string>();
  const out: LadderTier[] = [];
  for (const [i, t] of tiers.entries()) {
    if (!t || !Array.isArray(t.games)) return { error: `Tier ${i + 1} needs a list of games` };
    for (const g of t.games) {
      if (typeof g !== 'string' || !gameIds.includes(g)) return { error: `Tier ${i + 1} has a game that doesn’t exist` };
      if (seen.has(g)) return { error: 'A game can be in only one tier' };
      seen.add(g);
    }
    if (!Number.isInteger(t.wins) || t.wins < 1 || t.wins > MAX_WINS) return { error: `Tier ${i + 1}: wins to go up must be from 1 to ${MAX_WINS}` };
    out.push({ games: [...t.games], wins: t.wins });
  }
  if (!out[0].games.length) return { error: 'The first tier needs at least one game, or there’s nothing to play' };
  for (let i = 1; i < out.length; i++) {
    if (out[i].wins <= out[i - 1].wins) return { error: `Tier ${i + 1} must need more wins than tier ${i} (wins add up as you go)` };
  }
  return { ladder: { tiers: out } };
}

export interface LadderProgress {
  /** How many tiers are open (at least 1). */
  open: number;
  /** Games a player on the ladder can play and host. */
  allowed: string[];
  /** Wins so far in the open tiers' games. */
  wins: number;
  /** Wins needed to open the next tier, or null at the top. */
  next: number | null;
}

/** Where a player is on the ladder, from their wins in each game. Wins in games
 *  not yet open (from before progression was turned on) don't count. */
export function ladderProgress(ladder: Ladder, winsByGame: Record<string, number>): LadderProgress {
  let open = 1;
  let wins = 0;
  for (;;) {
    wins = ladder.tiers.slice(0, open).flatMap((t) => t.games).reduce((n, g) => n + (winsByGame[g] ?? 0), 0);
    if (open < ladder.tiers.length && wins >= ladder.tiers[open - 1].wins) open++;
    else break;
  }
  return {
    open,
    allowed: ladder.tiers.slice(0, open).flatMap((t) => t.games),
    wins,
    next: open < ladder.tiers.length ? ladder.tiers[open - 1].wins : null,
  };
}

/** What a player sees: on or off, and where they are. */
export interface MyProgression {
  on: boolean;
  ladder: Ladder;
  progress: LadderProgress | null;
}
