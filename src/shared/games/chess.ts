import { Chess, type Square } from 'chess.js';
import type { GameModule, GameResult } from '../game';

export type ChessSide = 'white' | 'black';

export interface ChessConfig {
  /** 0 = no clock. */
  initialSeconds: number;
  incrementSeconds: number;
}

export interface ChessState {
  config: ChessConfig;
  /** Moves in UCI form (e2e4, e7e8q); the position is rebuilt from these so
   *  repetition and the 50-move rule are counted correctly. */
  moves: string[];
  /** Time left for each side as of turnStartedAt, in ms. */
  clocks: Record<ChessSide, number>;
  /** When the side to move's clock started; null while clocks aren't running
   *  (no clock, before both sides have moved, or after the game ends). */
  turnStartedAt: number | null;
  drawOfferBy: ChessSide | null;
  result: GameResult | null;
}

export type ChessAction =
  | { type: 'move'; from: string; to: string; promotion?: string }
  | { type: 'resign' }
  | { type: 'offer_draw' }
  | { type: 'accept_draw' }
  | { type: 'decline_draw' };

export interface ChessView {
  fen: string;
  san: string[];
  lastMove: [string, string] | null;
  turn: ChessSide;
  check: boolean;
  /** ms left for each side right now, or null when there's no clock. */
  clocks: Record<ChessSide, number> | null;
  clockRunning: ChessSide | null;
  drawOfferBy: ChessSide | null;
  result: GameResult | null;
  config: ChessConfig;
}

export const TIME_CONTROLS: { label: string; config: ChessConfig }[] = [
  { label: '1 min', config: { initialSeconds: 60, incrementSeconds: 0 } },
  { label: '3 min + 2 s', config: { initialSeconds: 180, incrementSeconds: 2 } },
  { label: '5 min + 3 s', config: { initialSeconds: 300, incrementSeconds: 3 } },
  { label: '10 min', config: { initialSeconds: 600, incrementSeconds: 0 } },
  { label: '15 min + 10 s', config: { initialSeconds: 900, incrementSeconds: 10 } },
  { label: 'No clock', config: { initialSeconds: 0, incrementSeconds: 0 } },
];

const other = (s: ChessSide): ChessSide => (s === 'white' ? 'black' : 'white');

function replay(moves: string[]): Chess {
  const c = new Chess();
  for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  return c;
}

function sideToMove(c: Chess): ChessSide {
  return c.turn() === 'w' ? 'white' : 'black';
}

function endOf(c: Chess, mover: ChessSide): GameResult | null {
  if (c.isCheckmate()) return { winner: mover, reason: 'checkmate' };
  if (c.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (c.isInsufficientMaterial()) return { winner: null, reason: 'insufficient material' };
  if (c.isThreefoldRepetition()) return { winner: null, reason: 'threefold repetition' };
  if (c.isDrawByFiftyMoves()) return { winner: null, reason: '50-move rule' };
  return null;
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;

export const chess: GameModule<ChessState, ChessConfig> = {
  id: 'chess',
  name: 'Chess',
  description: 'Two players. The server checks every move; clocks, draw offers and resigning.',
  seats: [
    { id: 'white', label: 'White' },
    { id: 'black', label: 'Black' },
  ],
  defaultConfig: { initialSeconds: 300, incrementSeconds: 3 },

  parseConfig(raw) {
    const r = (raw ?? {}) as Partial<ChessConfig>;
    return {
      initialSeconds: clamp(r.initialSeconds, 0, 3 * 3600, 300),
      incrementSeconds: clamp(r.incrementSeconds, 0, 180, 3),
    };
  },

  describeConfig(c) {
    if (c.initialSeconds === 0) return 'No clock';
    const min = c.initialSeconds % 60 === 0 ? `${c.initialSeconds / 60} min` : `${c.initialSeconds} s`;
    return c.incrementSeconds ? `${min} + ${c.incrementSeconds} s` : min;
  },

  create(config) {
    const ms = config.initialSeconds * 1000;
    return { config, moves: [], clocks: { white: ms, black: ms }, turnStartedAt: null, drawOfferBy: null, result: null };
  },

  act(state, seat, raw, now) {
    if (state.result) return { error: 'The game is over' };
    if (seat !== 'white' && seat !== 'black') return { error: 'Not a chess seat' };
    const me = seat as ChessSide;
    const action = raw as ChessAction;
    switch (action?.type) {
      case 'move': {
        const c = replay(state.moves);
        if (sideToMove(c) !== me) return { error: 'It isn’t your turn' };
        const promotion = action.promotion && /^[qrbn]$/.test(action.promotion) ? action.promotion : undefined;
        let made;
        try {
          made = c.move({ from: action.from as Square, to: action.to as Square, promotion });
        } catch {
          return { error: 'That move isn’t legal' };
        }
        const moves = [...state.moves, made.from + made.to + (made.promotion ?? '')];
        const clocks = { ...state.clocks };
        const timed = state.config.initialSeconds > 0;
        if (timed && state.turnStartedAt !== null) {
          clocks[me] = Math.max(0, clocks[me] - (now - state.turnStartedAt)) + state.config.incrementSeconds * 1000;
        }
        const result = endOf(c, me);
        return {
          state: {
            ...state,
            moves,
            clocks,
            // Clocks start once both sides have made a move.
            turnStartedAt: timed && !result && moves.length >= 2 ? now : null,
            drawOfferBy: state.drawOfferBy === me ? me : null,
            result,
          },
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
        return { error: 'Unknown chess action' };
    }
  },

  tick(state, now) {
    if (state.result || state.turnStartedAt === null) return null;
    const side = sideToMove(replay(state.moves));
    if (state.clocks[side] - (now - state.turnStartedAt) > 0) return null;
    return {
      ...state,
      clocks: { ...state.clocks, [side]: 0 },
      turnStartedAt: null,
      result: { winner: other(side), reason: 'time' },
    };
  },

  nextDeadline(state) {
    if (state.result || state.turnStartedAt === null) return null;
    const side = state.moves.length % 2 === 0 ? 'white' : 'black';
    return state.turnStartedAt + state.clocks[side];
  },

  result: (state) => state.result,

  view(state, now): ChessView {
    const c = replay(state.moves);
    const turn = sideToMove(c);
    const last = state.moves[state.moves.length - 1];
    let clocks: Record<ChessSide, number> | null = null;
    if (state.config.initialSeconds > 0) {
      clocks = { ...state.clocks };
      if (state.turnStartedAt !== null) clocks[turn] = Math.max(0, clocks[turn] - (now - state.turnStartedAt));
    }
    return {
      fen: c.fen(),
      san: c.history(),
      lastMove: last ? [last.slice(0, 2), last.slice(2, 4)] : null,
      turn,
      check: c.inCheck(),
      clocks,
      clockRunning: state.turnStartedAt !== null ? turn : null,
      drawOfferBy: state.drawOfferBy,
      result: state.result,
      config: state.config,
    };
  },
};

/** End the game now, charging the side to move for the time it has used. */
function stop(state: ChessState, now: number, result: GameResult): ChessState {
  const clocks = { ...state.clocks };
  if (state.turnStartedAt !== null) {
    const side: ChessSide = state.moves.length % 2 === 0 ? 'white' : 'black';
    clocks[side] = Math.max(0, clocks[side] - (now - state.turnStartedAt));
  }
  return { ...state, clocks, turnStartedAt: null, drawOfferBy: null, result };
}

