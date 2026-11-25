import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bountyBoard, legalMoves, moveKey, type BountyConfig, type BountyMove,
  type BountyPiece, type BountySide, type BountyKind, type BountyState, type BountyView, type GadgetId,
} from './bountyboard';
import { bountyBoardBot } from './bountyboard.bot';

const cfg: BountyConfig = { initialSeconds: 0, incrementSeconds: 0, shopDelay: 0 };
const ctx = { seats: ['white', 'black'], random: Math.random };
type Spec = [number, BountySide, BountyKind, GadgetId[]?];

function custom(spec: Spec[], turn: BountySide = 'white', dollars: Partial<Record<BountySide, number>> = {}, config = cfg): BountyState {
  const board: (BountyPiece | null)[] = Array(64).fill(null);
  for (const [sq, side, kind, gadgets = []] of spec) board[sq] = { side, kind, gadgets };
  return { ...bountyBoard.create(config, 0, ctx), board, turn, dollars: { white: 0, black: 0, ...dollars }, positions: {} };
}

function act(s: BountyState, seat: BountySide, action: unknown, now = 0): BountyState {
  const r = bountyBoard.act(s, seat, action, now, ctx);
  assert.ok(!('error' in r), 'error' in r ? r.error : '');
  return r.state;
}

function pick(s: BountyState, from: number, to: number, extra: Partial<BountyMove> = {}): BountyMove {
  const m = legalMoves(s.board, s.turn).find((x) => x.from === from && x.to === to
    && (extra.via === undefined || x.via === extra.via)
    && (extra.pull === undefined || x.pull === extra.pull));
  assert.ok(m, `no legal move ${from} -> ${to} ${JSON.stringify(extra)}`);
  return m;
}

test('the opening array, payday and a capture bounty', () => {
  const s = bountyBoard.create(cfg, 0, ctx);
  assert.equal(s.board.filter(Boolean).length, 32);
  assert.equal(s.board[60]?.kind, 'king');
  assert.deepEqual(s.dollars, { white: 2, black: 0 });
  // White rook e4 takes a black Greenhorn on e5.
  const board = s.board.map((p, i) => i === 60 || i === 4 ? p : null);
  board[28] = { side: 'white', kind: 'rook', gadgets: [] };
  board[36] = { side: 'black', kind: 'pawn', gadgets: [] };
  const before = { ...s, board };
  const after = act(before, 'white', { type: 'move', ...pick(before, 28, 36) });
  assert.equal(after.board[36]?.side, 'white');
  assert.equal(after.board[28], null);
  // Black is behind on material, so its payday is $3 rather than $2.
  assert.deepEqual(after.dollars, { white: 4, black: 3 });
  assert.equal(after.log[0].payout, 2);
  assert.equal(after.log[0].income, 3);
});

test('Spurs buys a two-step for a Greenhorn and costs the dollars', () => {
  const s = custom([[60, 'white', 'king'], [4, 'black', 'king'], [52, 'white', 'pawn']], 'white', { white: 4 });
  // The two-step exists only once the purchase has been applied (the server
  // checks the move after the gadget is on the piece).
  const after = act(s, 'white', { type: 'move', from: 52, to: 36, buy: { gadget: 'spurs', square: 52 } });
  assert.deepEqual(after.board[36]?.gadgets, ['spurs']);
  assert.equal(after.dollars.white, 0);
  assert.equal(after.log[0].buy?.gadget, 'spurs');
  // A gadget cannot go on the Mayor or on a piece that already has two.
  const bad = bountyBoard.act(s, 'white', { type: 'move', ...pick(s, 52, 44), buy: { gadget: 'vest', square: 60 } }, 0, ctx);
  assert.ok('error' in bad);
});

test('Long rifle shoots past the first piece; Ladder hops over one', () => {
  const rifle = custom([
    [60, 'white', 'king'], [4, 'black', 'king'], [27, 'white', 'bishop', ['longrifle']], [36, 'white', 'pawn'],
  ]);
  assert.ok(pick(rifle, 27, 54), 'the bishop reaches g7 past its own pawn');
  const plain = custom([
    [60, 'white', 'king'], [4, 'black', 'king'], [27, 'white', 'bishop'], [36, 'white', 'pawn'],
  ]);
  assert.ok(!legalMoves(plain.board, 'white').some((m) => m.from === 27 && m.to === 54));
  const ladder = custom([[60, 'white', 'king'], [4, 'black', 'king'], [28, 'white', 'rook', ['ladder']], [29, 'black', 'pawn']]);
  assert.ok(pick(ladder, 28, 30));
});

test('a Lasso pulls an enemy rather than moving the Mustang', () => {
  const s = custom([[60, 'white', 'king'], [4, 'black', 'king'], [28, 'white', 'knight', ['lasso']], [30, 'black', 'pawn']]);
  const m = pick(s, 28, 30, { pull: 29 });
  const after = act(s, 'white', { type: 'move', ...m });
  assert.equal(after.board[28]?.kind, 'knight');
  assert.equal(after.board[30], null);
  assert.equal(after.board[29]?.kind, 'pawn');
  assert.equal(after.log[0].payout, 0);
});

test('Rail switch slides one extra square and is spent', () => {
  const s = custom([[60, 'white', 'king'], [4, 'black', 'king'], [26, 'white', 'queen', ['railswitch']]]);
  const m = pick(s, 26, 28, { via: 27 });
  const after = act(s, 'white', { type: 'move', ...m });
  assert.equal(after.board[28]?.kind, 'queen');
  assert.equal(after.board[27], null);
  assert.equal(after.board[28]?.switchUsed, true);
  assert.ok(!legalMoves(after.board, 'white').some((x) => x.from === 28 && x.to === 30 && x.via === 29),
    'the extra slide is gone once used');
});

test('an armoured vest blocks the capture and is discarded', () => {
  const s = custom([
    [60, 'white', 'king'], [4, 'black', 'king'], [28, 'white', 'rook'], [36, 'black', 'pawn', ['vest']],
  ]);
  const after = act(s, 'white', { type: 'move', ...pick(s, 28, 36) });
  assert.equal(after.board[28]?.kind, 'rook');
  assert.deepEqual(after.board[36]?.gadgets, []);
  assert.equal(after.log[0].vested, true);
  assert.equal(after.dollars.white, 0);
});

test('a Greenhorn promotes to Rail Baron and drops its pawn gadgets', () => {
  const s = custom([[60, 'white', 'king'], [4, 'black', 'king'], [8, 'white', 'pawn', ['spurs']]]);
  const after = act(s, 'white', { type: 'move', ...pick(s, 8, 0) });
  assert.equal(after.board[0]?.kind, 'queen');
  assert.deepEqual(after.board[0]?.gadgets, []);
});

test('checkmate and stalemate are found after the move that makes them', () => {
  // Fool's mate: 1. f3 e5 2. g4 Qh4#.
  // White has played f3 and g4, Black e5; now Qh4# from h6.
  let s = custom([
    [60, 'white', 'king'], [59, 'white', 'queen'], [61, 'white', 'bishop'],
    [51, 'white', 'pawn'], [52, 'white', 'pawn'], [45, 'white', 'pawn'], [38, 'white', 'pawn'],
    [4, 'black', 'king'], [28, 'black', 'pawn'], [23, 'black', 'queen'],
  ], 'black');
  s = act(s, 'black', { type: 'move', ...pick(s, 23, 39) });
  assert.deepEqual(s.result, { winner: 'black', reason: 'checkmate' });

  // Black king a8, white queen e4 -> c7, white king c6: no move, not in check.
  s = custom([[0, 'black', 'king'], [18, 'white', 'king'], [28, 'white', 'queen']], 'white');
  s = act(s, 'white', { type: 'move', ...pick(s, 28, 10) });
  assert.deepEqual(s.result, { winner: null, reason: 'stalemate' });
});

test('the shop shuts after 40 moves each, 50 quiet moves draw', () => {
  const late = custom([[60, 'white', 'king'], [4, 'black', 'king'], [28, 'white', 'rook']], 'white', { white: 20 });
  late.log = Array.from({ length: 80 }, () => ({ seat: 'white' as BountySide, move: { from: 60, to: 60 }, income: 0, payout: 0 }));
  const blocked = bountyBoard.act(late, 'white', { type: 'move', ...pick(late, 28, 29), buy: { gadget: 'vest', square: 28 } }, 0, ctx);
  assert.ok('error' in blocked);
  assert.equal((bountyBoard.view(late, 0, 'white') as BountyView).shop, 'closed');

  const quiet = custom([[60, 'white', 'king'], [4, 'black', 'king'], [52, 'white', 'pawn']], 'white');
  quiet.quiet = 99;
  assert.deepEqual(act(quiet, 'white', { type: 'move', ...pick(quiet, 60, 59) }).result, { winner: null, reason: '50-move rule' });
});

test('clocks charge only the side to move and time losses settle the game', () => {
  const config: BountyConfig = { initialSeconds: 60, incrementSeconds: 3, shopDelay: 0 };
  let s = bountyBoard.create(config, 0, ctx);
  assert.equal(s.turnStartedAt, null);
  s = act(s, 'white', { type: 'move', ...pick(s, 52, 36) }, 0);
  assert.equal(s.turnStartedAt, null, 'clocks start after both sides have moved');
  s = act(s, 'black', { type: 'move', ...pick(s, 12, 28) }, 1000);
  assert.equal(s.turnStartedAt, 1000);
  s = act(s, 'white', { type: 'move', ...pick(s, 51, 35) }, 2000);
  assert.equal(s.clocks.white, 60000 - 1000 + 3000);
  const deadline = bountyBoard.nextDeadline(s);
  assert.equal(deadline, 2000 + s.clocks.black);
  const expired = bountyBoard.tick(s, deadline! + 1)!;
  assert.deepEqual(expired.result, { winner: 'white', reason: 'time' });
});

test('replays rebuild purchases and bounties, and views round-trip through JSON', () => {
  let s = bountyBoard.create(cfg, 0, ctx);
  for (const [seat, from, to] of [
    ['white', 52, 36], ['black', 12, 28], ['white', 51, 35], ['black', 11, 27],
  ] as [BountySide, number, number][]) {
    s = act(s, seat, { type: 'move', ...pick(s, from, to) });
  }
  // White has saved dollars: a Spurs purchase on c2 is part of this move.
  s = act(s, 'white', { type: 'move', from: 50, to: 34, buy: { gadget: 'spurs', square: 50 } });
  const saved = JSON.parse(JSON.stringify(s)) as BountyState;
  const frames = bountyBoard.replay!(saved) as BountyView[];
  assert.equal(frames.length, saved.log.length + 1);
  assert.equal(frames[frames.length - 1].log[4].buy?.gadget, 'spurs');
  assert.deepEqual(frames[frames.length - 1].dollars, saved.dollars);
});

test('the bot only picks legal moves and can buy a gadget it can afford', () => {
  const s = custom([[60, 'white', 'king'], [4, 'black', 'king'], [52, 'white', 'pawn'], [28, 'white', 'rook']], 'white', { white: 20 });
  const view = bountyBoard.view(s, 0, 'white') as BountyView;
  const random = () => 0.5;
  const action = bountyBoardBot(view, 'white', random) as { type: string; buy?: { gadget: GadgetId; square: number }; from: number; to: number };
  assert.equal(action.type, 'move');
  assert.ok(view.legal.some((m) => moveKey(m) === moveKey(action as BountyMove)));
  assert.ok(action.buy, 'a bot with dollars buys something');
  const r = bountyBoard.act(s, 'white', action, 0, ctx);
  assert.ok(!('error' in r), 'error' in r ? r.error : '');
});
