// Bounty Board (#95): chess with a bounty shop. The 8×8 starting array and
// checkmate are familiar, but gadgets change how pieces move and captures pay
// dollars. Everything here is pure and server-authoritative: clients get legal
// moves in their view, and every purchase and move is checked again in act().

import type { GameModule, GameResult, SeatId } from '../game';

export type BountySide = 'white' | 'black';
export type BountyKind = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type GadgetId =
  | 'spurs' | 'sidewinder' | 'longrifle' | 'ladder' | 'lasso'
  | 'ironhorse' | 'railswitch' | 'vest' | 'bountyhunter' | 'reward';

export interface BountyPiece {
  side: BountySide;
  kind: BountyKind;
  gadgets: GadgetId[];
  /** Rail switch can be used once per piece. */
  switchUsed?: boolean;
}

/** from/to are square indexes (row * 8 + col, row 0 is Black's home row).
 *  `via` is the first landing square of a rail switch; `pull` is where a
 *  lasso sends the enemy piece. */
export interface BountyMove {
  from: number;
  to: number;
  capture?: number;
  via?: number;
  pull?: number;
}

export interface BountyBuy { gadget: GadgetId; square: number }

export type BountyAction =
  | ({ type: 'move' } & BountyMove & { buy?: BountyBuy })
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'accept_draw' }
  | { type: 'decline_draw' };

export interface BountyConfig {
  /** 0 = no clock. */
  initialSeconds: number;
  incrementSeconds: number;
  /** Moves per side before the shop opens (0 or 4 in the room settings). */
  shopDelay: number;
}

export interface BountyRecord {
  seat: BountySide;
  move: BountyMove;
  buy?: BountyBuy;
  captured?: { kind: BountyKind; gadgets: GadgetId[]; value: number };
  vested?: boolean;
  promoted?: boolean;
  income: number;
  payout: number;
}

export interface BountyState {
  config: BountyConfig;
  board: (BountyPiece | null)[];
  turn: BountySide;
  /** One entry per completed turn, enough to replay purchases and bounties. */
  log: BountyRecord[];
  dollars: Record<BountySide, number>;
  clocks: Record<BountySide, number>;
  turnStartedAt: number | null;
  drawOfferBy: BountySide | null;
  /** Moves by either side since the last capture or Greenhorn move. */
  quiet: number;
  positions: Record<string, number>;
  result: GameResult | null;
}

export interface GadgetInfo {
  id: GadgetId;
  label: string;
  cost: number;
  who: BountyKind | 'any';
  text: string;
}

export interface BountyView {
  board: (BountyPiece | null)[];
  turn: BountySide;
  /** Only the viewer's own legal moves; watchers get none. */
  legal: BountyMove[];
  lastMove: BountyMove | null;
  dollars: Record<BountySide, number>;
  /** soon: before shopDelay; open: buying allowed; closed: at 40 moves each. */
  shop: 'soon' | 'open' | 'closed';
  menu: GadgetInfo[];
  check: boolean;
  clocks: Record<BountySide, number> | null;
  clockRunning: BountySide | null;
  drawOfferBy: BountySide | null;
  moveCount: number;
  log: BountyRecord[];
  result: GameResult | null;
  config: BountyConfig;
}

/** Fixed menu, no random offers: prices are part of the skill of the game. */
export const GADGETS: GadgetInfo[] = [
  { id: 'spurs', label: 'Spurs', cost: 4, who: 'pawn', text: 'Step one or two squares straight forward.' },
  { id: 'sidewinder', label: 'Sidewinder', cost: 8, who: 'pawn', text: 'Also step one square diagonally backwards.' },
  { id: 'longrifle', label: 'Long rifle', cost: 4, who: 'bishop', text: 'Shoot past the first piece in a diagonal.' },
  { id: 'ladder', label: 'Ladder', cost: 4, who: 'rook', text: 'Hop over one adjacent piece along a road.' },
  { id: 'lasso', label: 'Lasso', cost: 4, who: 'knight', text: 'Reel an enemy two squares away into the empty square between, instead of moving.' },
  { id: 'ironhorse', label: 'Iron horse', cost: 8, who: 'knight', text: 'Also jump two squares straight.' },
  { id: 'railswitch', label: 'Rail switch', cost: 8, who: 'queen', text: 'Once per game, slide one extra square after moving.' },
  { id: 'vest', label: 'Armoured vest', cost: 8, who: 'any', text: 'Block the first capture against this piece.' },
  { id: 'bountyhunter', label: 'Bounty hunter', cost: 4, who: 'any', text: '+2 payday while behind on piece value.' },
  { id: 'reward', label: 'Reward', cost: 4, who: 'any', text: '+3 whenever one of your pieces makes a capture.' },
];

export const BOUNTY: Record<BountyKind, number> = {
  king: 0, queen: 8, rook: 5, bishop: 3, knight: 3, pawn: 2,
};

const KIND_NAME: Record<BountyKind, string> = {
  king: 'Mayor', queen: 'Rail Baron', rook: 'Stagecoach',
  bishop: 'Sharpshooter', knight: 'Mustang', pawn: 'Greenhorn',
};

const other = (s: BountySide): BountySide => (s === 'white' ? 'black' : 'white');
const rc = (i: number) => [Math.floor(i / 8), i % 8] as const;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const LEAPS: [number, number][] = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;

export function startBoard(): (BountyPiece | null)[] {
  const back: BountyKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  const board: (BountyPiece | null)[] = Array(64).fill(null);
  back.forEach((kind, c) => {
    board[c] = { side: 'black', kind, gadgets: [] };
    board[7 * 8 + c] = { side: 'white', kind, gadgets: [] };
  });
  for (let c = 0; c < 8; c++) {
    board[8 + c] = { side: 'black', kind: 'pawn', gadgets: [] };
    board[6 * 8 + c] = { side: 'white', kind: 'pawn', gadgets: [] };
  }
  return board;
}

export function pieceValue(p: BountyPiece): number {
  return BOUNTY[p.kind] + p.gadgets.length * 2;
}

export function moveKey(m: BountyMove): string {
  return `${m.from}:${m.to}:${m.via ?? ''}:${m.pull ?? ''}`;
}

function add(out: BountyMove[], m: BountyMove): void {
  const key = moveKey(m);
  const i = out.findIndex((x) => moveKey(x) === key);
  if (i < 0) out.push(m);
  // A plain slide and a rail-switch slide can share a destination: keep the
  // plain one (the extra slide then stays an option, not an extra click).
  else if (m.via === undefined && out[i].via !== undefined) out[i] = m;
}

/** Can this enemy be taken? The Mayor is never captured; in attack-only mode
 *  we also count it, so check can be detected without allowing the capture. */
function enemy(occ: BountyPiece | null, side: BountySide, attacks: boolean): boolean {
  return !!occ && occ.side !== side && (occ.kind !== 'king' || attacks);
}

function slide(board: (BountyPiece | null)[], from: number, dirs: [number, number][], piece: BountyPiece, out: BountyMove[], attacks: boolean): void {
  const [r, c] = rc(from);
  for (const [dr, dc] of dirs) {
    let skipped = false;
    for (let n = 1; n <= 7; n++) {
      const nr = r + dr * n, nc = c + dc * n;
      if (!on(nr, nc)) break;
      const to = nr * 8 + nc;
      const occ = board[to];
      if (occ) {
        if (skipped) break;
        if (piece.gadgets.includes('longrifle')) { skipped = true; continue; }
        if (enemy(occ, piece.side, attacks)) add(out, { from, to, capture: to });
        break;
      }
      add(out, { from, to });
      if (piece.gadgets.includes('railswitch') && !piece.switchUsed && !skipped) {
        const er = nr + dr, ec = nc + dc;
        if (on(er, ec)) {
          const extra = er * 8 + ec;
          const beyond = board[extra];
          if (!beyond || enemy(beyond, piece.side, attacks)) {
            add(out, { from, to: extra, via: to, ...(beyond ? { capture: extra } : {}) });
          }
        }
      }
    }
  }
}

function pawnMoves(board: (BountyPiece | null)[], from: number, piece: BountyPiece, out: BountyMove[], attacks: boolean): void {
  const [r, c] = rc(from);
  const dr = piece.side === 'white' ? -1 : 1;
  const one = (r + dr) * 8 + c;
  if (on(r + dr, c) && !board[one]) {
    add(out, { from, to: one });
    // The usual opening double-step, or Spurs' extra step from anywhere.
    const homeRow = piece.side === 'white' ? 6 : 1;
    if (r === homeRow || piece.gadgets.includes('spurs')) {
      const two = (r + 2 * dr) * 8 + c;
      if (on(r + 2 * dr, c) && !board[two]) add(out, { from, to: two });
    }
  }
  for (const dc of [-1, 1]) {
    if (!on(r + dr, c + dc)) continue;
    const to = (r + dr) * 8 + c + dc;
    const occ = board[to];
    if (enemy(occ, piece.side, attacks)) add(out, { from, to, capture: to });
    else if (attacks && !occ) add(out, { from, to });
  }
  // A Sidewinder step backwards is a step, not a capture.
  if (piece.gadgets.includes('sidewinder')) {
    const back = (r - dr) * 8 + c;
    if (on(r - dr, c) && !board[back]) add(out, { from, to: back });
    for (const dc of [-1, 1]) {
      if (!on(r - dr, c + dc)) continue;
      const to = (r - dr) * 8 + c + dc;
      if (!board[to]) add(out, { from, to });
    }
  }
}

/** Moves a piece could make ignoring whether its own Mayor is left in check.
 *  With `attacks` true, empty pawn diagonals count for check detection. */
export function movesFrom(board: (BountyPiece | null)[], from: number, attacks = false): BountyMove[] {
  const p = board[from];
  if (!p) return [];
  const [r, c] = rc(from);
  const out: BountyMove[] = [];
  const jump = (dirs: [number, number][], distance = 1) => {
    for (const [dr, dc] of dirs) {
      const nr = r + dr * distance, nc = c + dc * distance;
      if (!on(nr, nc)) continue;
      const to = nr * 8 + nc;
      const occ = board[to];
      if (!occ) add(out, { from, to });
      else if (enemy(occ, p.side, attacks)) add(out, { from, to, capture: to });
    }
  };
  switch (p.kind) {
    case 'pawn': pawnMoves(board, from, p, out, attacks); break;
    case 'knight':
      jump(LEAPS);
      if (p.gadgets.includes('ironhorse')) jump(ORTHO, 2);
      if (p.gadgets.includes('lasso') && !attacks) {
        // Reel in a piece two squares away into the empty square between.
        for (const [dr, dc] of [...ORTHO, ...DIAG]) {
          const gapR = r + dr, gapC = c + dc;
          const targetR = r + 2 * dr, targetC = c + 2 * dc;
          if (!on(targetR, targetC) || board[gapR * 8 + gapC]) continue;
          const to = targetR * 8 + targetC;
          const target = board[to];
          if (!enemy(target, p.side, false) || target!.kind === 'king') continue;
          add(out, { from, to, pull: gapR * 8 + gapC });
        }
      }
      break;
    case 'bishop': slide(board, from, DIAG, p, out, attacks); break;
    case 'rook':
      slide(board, from, ORTHO, p, out, attacks);
      if (p.gadgets.includes('ladder')) {
        for (const [dr, dc] of ORTHO) {
          const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
          if (!on(tr, tc) || !board[mr * 8 + mc]) continue;
          const to = tr * 8 + tc;
          const occ = board[to];
          if (!occ) add(out, { from, to });
          else if (enemy(occ, p.side, attacks)) add(out, { from, to, capture: to });
        }
      }
      break;
    case 'queen': slide(board, from, [...ORTHO, ...DIAG], p, out, attacks); break;
    case 'king': jump([...ORTHO, ...DIAG]); break;
  }
  return out;
}

export interface AppliedMove {
  board: (BountyPiece | null)[];
  captured: BountyPiece | null;
  vested: boolean;
  promoted: boolean;
}

/** Apply a generated move. A vest stops the capture and leaves the attacker
 *  where it was; a lasso moves the victim, not the Mustang. */
export function applyMove(board: (BountyPiece | null)[], from: number, m: BountyMove): AppliedMove {
  const next = [...board];
  if (m.pull !== undefined) {
    const victim = next[m.to];
    if (!victim) return { board: next, captured: null, vested: false, promoted: false };
    next[m.to] = null;
    next[m.pull] = victim;
    return { board: next, captured: null, vested: false, promoted: false };
  }
  const mover = next[from];
  if (!mover) return { board: next, captured: null, vested: false, promoted: false };
  const captured = m.capture === undefined ? null : next[m.capture];
  if (captured?.gadgets.includes('vest')) {
    next[m.capture!] = { ...captured, gadgets: captured.gadgets.filter((g) => g !== 'vest') };
    return { board: next, captured: null, vested: true, promoted: false };
  }
  const lastRow = mover.side === 'white' ? 0 : 7;
  const promoted = mover.kind === 'pawn' && Math.floor(m.to / 8) === lastRow;
  next[from] = null;
  next[m.to] = promoted
    ? { side: mover.side, kind: 'queen', gadgets: mover.gadgets.filter((g) => g !== 'spurs' && g !== 'sidewinder') }
    : { ...mover, switchUsed: mover.switchUsed || m.via !== undefined };
  return { board: next, captured, vested: false, promoted };
}

export function inCheck(board: (BountyPiece | null)[], side: BountySide): boolean {
  const king = board.findIndex((p) => p?.side === side && p.kind === 'king');
  if (king < 0) return true;
  for (let i = 0; i < 64; i++) {
    if (!board[i] || board[i]!.side === side) continue;
    for (const m of movesFrom(board, i, true)) {
      if (m.capture === king || (m.to === king && m.capture !== undefined)) return true;
    }
  }
  return false;
}

export function legalMoves(board: (BountyPiece | null)[], side: BountySide): BountyMove[] {
  const out: BountyMove[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.side !== side) continue;
    for (const m of movesFrom(board, i)) {
      if (!inCheck(applyMove(board, i, m).board, side)) add(out, m);
    }
  }
  return out;
}

function material(board: (BountyPiece | null)[], side: BountySide): number {
  return board.reduce((sum, p) => sum + (p?.side === side ? pieceValue(p) : 0), 0);
}

function hasGadget(board: (BountyPiece | null)[], side: BountySide, id: GadgetId): boolean {
  return board.some((p) => p?.side === side && p.gadgets.includes(id));
}

function payday(board: (BountyPiece | null)[], side: BountySide): number {
  let pay = 2;
  const diff = material(board, side) - material(board, other(side));
  if (diff <= -8) pay += 2;
  else if (diff <= -2) pay += 1;
  if (diff < 0 && hasGadget(board, side, 'bountyhunter')) pay += 2;
  return pay;
}

function bountyFor(victim: BountyPiece, attackerBoard: (BountyPiece | null)[], side: BountySide): number {
  return BOUNTY[victim.kind] + victim.gadgets.length * 2 + (hasGadget(attackerBoard, side, 'reward') ? 3 : 0);
}

function positionKey(board: (BountyPiece | null)[], side: BountySide, dollars: Record<BountySide, number>): string {
  const cells = board.map((p) => p
    ? `${p.side[0]}${p.kind}-${p.gadgets.join('.')}${p.switchUsed ? '*' : ''}` : '.');
  return `${side}/${dollars.white}/${dollars.black}/${cells.join(',')}`;
}

function insufficient(board: (BountyPiece | null)[]): boolean {
  return board.every((p) => !p || p.kind === 'king');
}

export function gadgetInfo(id: GadgetId): GadgetInfo | undefined {
  return GADGETS.find((g) => g.id === id);
}

function gadgetFits(g: GadgetId, p: BountyPiece): boolean {
  const info = gadgetInfo(g);
  return !!info && p.kind !== 'king' && p.gadgets.length < 2 && !p.gadgets.includes(g)
    && (info.who === 'any' || info.who === p.kind);
}

function shopPhase(state: BountyState): 'soon' | 'open' | 'closed' {
  if (state.log.length >= 80) return 'closed';
  return state.log.length >= state.config.shopDelay * 2 ? 'open' : 'soon';
}

function stop(state: BountyState, now: number, result: GameResult): BountyState {
  const clocks = { ...state.clocks };
  if (state.turnStartedAt !== null) {
    clocks[state.turn] = Math.max(0, clocks[state.turn] - (now - state.turnStartedAt));
  }
  return { ...state, clocks, turnStartedAt: null, drawOfferBy: null, result };
}

const nameOf = (ctx: { names?: Record<string, string> }, side: BountySide) => ctx.names?.[side] ?? (side === 'white' ? 'White' : 'Black');

export const bountyBoard: GameModule<BountyState, BountyConfig> = {
  id: 'bountyboard',
  name: 'Bounty Board',
  description: 'Chess with a Wild West shop: captures pay dollars, dollars buy gadgets that change how your pieces move.',
  howToPlay: {
    goal: 'Checkmate the other Mayor. Captures earn dollars, and dollars buy gadgets that change how your pieces move.',
    sections: [
      { title: 'A turn', points: [
        'You collect $2 payday at the start of each turn, more when you are behind on piece value.',
        'Buy at most one gadget before moving: pick the gadget, then the piece it goes on, then where the piece moves. Dollars carry over.',
        'The shop opens on the first turn by default (or after four moves each, if the host set that). It shuts after 40 moves each.',
      ] },
      { title: 'The posse', points: [
        'The Mayor moves one square and must never be captured. The Rail Baron moves any distance in straight lines or diagonals.',
        'The Stagecoach moves along roads (straight), the Sharpshooter along diagonals, the Mustang jumps in an L, the Greenhorn steps forward and takes diagonally.',
        'Captures pay $2 for a Greenhorn, $3 for a Mustang or Sharpshooter, $5 for a Stagecoach and $8 for a Rail Baron, plus $2 per gadget on the victim.',
      ] },
      { title: 'Gadgets', points: [
        'Spurs let a Greenhorn step two squares; a Sidewinder steps backwards. A Long rifle shoots past the first piece; a Ladder hops over one.',
        'A Lasso reels in an enemy two squares away into the empty square between; an Iron horse jumps two squares straight. A Rail switch gives the Rail Baron one extra slide, once per game.',
        'An Armoured vest blocks the first capture against a piece. Bounty hunter adds $2 payday while behind; Reward adds $3 on each capture. At most two gadgets per piece; the Mayor gets none.',
      ] },
      { title: 'How a game ends', points: [
        'Checkmate wins: the other Mayor is attacked and has no legal answer. Stalemate, a draw offer accepted, threefold repetition, 50 moves without a capture or a Greenhorn move, and bare Mayors are draws.',
        'Resigning or running out of time loses. Guns and gadgets never capture a Mayor directly.',
      ] },
    ],
  },
  seats: [
    { id: 'white', label: 'White’s posse' },
    { id: 'black', label: 'Black’s posse' },
  ],
  defaultConfig: { initialSeconds: 300, incrementSeconds: 3, shopDelay: 0 },

  parseConfig(raw) {
    const r = (raw ?? {}) as Partial<BountyConfig>;
    return {
      initialSeconds: clamp(r.initialSeconds, 0, 3 * 3600, 300),
      incrementSeconds: clamp(r.incrementSeconds, 0, 180, 3),
      shopDelay: clamp(r.shopDelay, 0, 10, 0),
    };
  },

  describeConfig(c) {
    const min = c.initialSeconds === 0 ? 'No clock' : c.initialSeconds % 60 === 0
      ? `${c.initialSeconds / 60} min` : `${c.initialSeconds} s`;
    return `${min}${c.incrementSeconds ? ` + ${c.incrementSeconds} s` : ''} · shop ${c.shopDelay ? `after ${c.shopDelay} moves each` : 'from move 1'}`;
  },

  create(config) {
    const ms = config.initialSeconds * 1000;
    const board = startBoard();
    const dollars: Record<BountySide, number> = { white: 2, black: 0 };
    return {
      config, board, turn: 'white', log: [], dollars,
      clocks: { white: ms, black: ms }, turnStartedAt: null, drawOfferBy: null,
      quiet: 0, positions: { [positionKey(board, 'white', dollars)]: 1 }, result: null,
    };
  },

  act(state, seat, raw, now, ctx) {
    if (state.result) return { error: 'The game is over' };
    if (seat !== 'white' && seat !== 'black') return { error: 'Not a Bounty Board seat' };
    const me = seat as BountySide;
    const action = raw as BountyAction;
    switch (action?.type) {
      case 'move': {
        if (state.turn !== me) return { error: 'It isn’t your turn' };
        let board = state.board;
        const dollars: Record<BountySide, number> = { ...state.dollars };
        const say: string[] = [];
        let bought: BountyBuy | undefined;
        if (action.buy) {
          if (shopPhase(state) !== 'open') return { error: 'The shop is not open' };
          const info = gadgetInfo(action.buy.gadget);
          if (!info) return { error: 'Unknown gadget' };
          const target = board[action.buy.square];
          if (!target || target.side !== me || !gadgetFits(action.buy.gadget, target)) {
            return { error: 'That piece cannot take this gadget' };
          }
          if (dollars[me] < info.cost) return { error: 'Not enough dollars' };
          bought = { gadget: action.buy.gadget, square: action.buy.square };
          board = [...board];
          board[bought.square] = { ...target, gadgets: [...target.gadgets, bought.gadget] };
          dollars[me] -= info.cost;
          say.push(`${nameOf(ctx, me)} buys ${info.label} for $${info.cost}`);
        }
        const from = action.from, to = action.to;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) {
          return { error: 'That move isn’t legal' };
        }
        const wanted: BountyMove = { from, to, ...(action.via !== undefined ? { via: action.via } : {}), ...(action.pull !== undefined ? { pull: action.pull } : {}) };
        const move = legalMoves(board, me).find((m) => moveKey(m) === moveKey(wanted));
        if (!move) return { error: 'That move isn’t legal' };
        const mover = board[move.from]!;
        const applied = applyMove(board, move.from, move);
        let payout = 0;
        if (applied.captured) {
          payout = bountyFor(applied.captured, board, me);
          dollars[me] += payout;
          say.push(`${nameOf(ctx, me)} collects $${payout} for the ${KIND_NAME[applied.captured.kind]}`);
        } else if (applied.vested) {
          say.push(`An armoured vest turns the shot away`);
        }
        if (applied.promoted) say.push(`A Greenhorn becomes a Rail Baron`);
        const next = other(me);
        const income = payday(applied.board, next);
        dollars[next] += income;
        const quiet = applied.captured || mover.kind === 'pawn' ? 0 : state.quiet + 1;
        const clocks = { ...state.clocks };
        const timed = state.config.initialSeconds > 0;
        if (timed && state.turnStartedAt !== null) {
          clocks[me] = Math.max(0, clocks[me] - (now - state.turnStartedAt)) + state.config.incrementSeconds * 1000;
        }
        const positions = { ...state.positions };
        const key = positionKey(applied.board, next, dollars);
        positions[key] = (positions[key] ?? 0) + 1;
        const answers = legalMoves(applied.board, next);
        let result: GameResult | null = null;
        if (!answers.length) {
          result = inCheck(applied.board, next)
            ? { winner: me, reason: 'checkmate' }
            : { winner: null, reason: 'stalemate' };
        } else if (quiet >= 100) result = { winner: null, reason: '50-move rule' };
        else if (insufficient(applied.board)) result = { winner: null, reason: 'insufficient material' };
        else if (positions[key] >= 3) result = { winner: null, reason: 'threefold repetition' };
        const record: BountyRecord = {
          seat: me, move, ...(bought ? { buy: bought } : {}),
          ...(applied.captured ? { captured: { kind: applied.captured.kind, gadgets: applied.captured.gadgets, value: payout } } : {}),
          ...(applied.vested ? { vested: true } : {}),
          ...(applied.promoted ? { promoted: true } : {}),
          income, payout,
        };
        return {
          state: {
            ...state, board: applied.board, turn: next, log: [...state.log, record], dollars, clocks,
            // Clocks start once both sides have made a move.
            turnStartedAt: timed && !result && state.log.length >= 1 ? now : null,
            drawOfferBy: state.drawOfferBy === me ? me : null,
            quiet, positions, result,
          },
          say,
        };
      }
      case 'resign':
        return { state: stop(state, now, { winner: other(me), reason: 'resignation' }) };
      case 'offer_draw':
        if (state.drawOfferBy === other(me)) return { state: stop(state, now, { winner: null, reason: 'agreement' }) };
        return { state: { ...state, drawOfferBy: me } };
      case 'accept_draw':
        if (state.drawOfferBy !== other(me)) return { error: 'There’s no draw offer to accept' };
        return { state: stop(state, now, { winner: null, reason: 'agreement' }) };
      case 'decline_draw':
        if (state.drawOfferBy !== other(me)) return { error: 'There’s no draw offer to decline' };
        return { state: { ...state, drawOfferBy: null } };
      default:
        return { error: 'Unknown Bounty Board action' };
    }
  },

  tick(state, now) {
    if (state.result || state.turnStartedAt === null) return null;
    if (state.clocks[state.turn] - (now - state.turnStartedAt) > 0) return null;
    return {
      ...state, clocks: { ...state.clocks, [state.turn]: 0 }, turnStartedAt: null,
      result: { winner: other(state.turn), reason: 'time' },
    };
  },

  nextDeadline(state) {
    if (state.result || state.turnStartedAt === null) return null;
    return state.turnStartedAt + state.clocks[state.turn];
  },

  pause(state, ms) {
    if (state.result || state.turnStartedAt === null || ms <= 0) return state;
    return { ...state, turnStartedAt: state.turnStartedAt + ms };
  },

  result: (state) => state.result,

  replay(state) {
    const ctx = { seats: ['white', 'black'], random: Math.random };
    let s = this.create({ ...state.config, initialSeconds: 0, incrementSeconds: 0 }, 0, ctx);
    const frames: unknown[] = [this.view(s, 0, null)];
    for (const rec of state.log) {
      const r = this.act(s, rec.seat, {
        type: 'move', ...rec.move, ...(rec.buy ? { buy: rec.buy } : {}),
      }, 0, ctx);
      if ('error' in r) break;
      s = r.state;
      frames.push(this.view(s, 0, null));
    }
    if (state.result && frames.length) frames[frames.length - 1] = this.view({ ...s, result: state.result }, 0, null);
    return frames;
  },

  // No turn(): the clocks time the game. For computer players (#18):
  waitingFor: (s) => (s.result ? [] : [s.turn as SeatId]),

  view(state, now, viewer): BountyView {
    let clocks: Record<BountySide, number> | null = null;
    if (state.config.initialSeconds > 0) {
      clocks = { ...state.clocks };
      if (state.turnStartedAt !== null) {
        clocks[state.turn] = Math.max(0, clocks[state.turn] - (now - state.turnStartedAt));
      }
    }
    return {
      board: state.board,
      turn: state.turn,
      legal: viewer === state.turn && !state.result ? legalMoves(state.board, state.turn) : [],
      lastMove: state.log[state.log.length - 1]?.move ?? null,
      dollars: state.dollars,
      shop: shopPhase(state),
      menu: GADGETS,
      check: inCheck(state.board, state.turn),
      clocks,
      clockRunning: state.turnStartedAt !== null ? state.turn : null,
      drawOfferBy: state.drawOfferBy,
      moveCount: state.log.length,
      log: state.log,
      result: state.result,
      config: state.config,
    };
  },
};
