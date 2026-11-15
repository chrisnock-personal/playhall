import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chess, type ChessState, type ChessView } from './chess';

const cfg = { initialSeconds: 60, incrementSeconds: 2 };

function play(state: ChessState, moves: string[], start = 0, step = 1000): ChessState {
  let t = start;
  moves.forEach((m, i) => {
    t += step;
    const r = chess.act(state, i % 2 === 0 ? 'white' : 'black', { type: 'move', from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }, t);
    if ('error' in r) throw new Error(`${m}: ${r.error}`);
    state = r.state;
  });
  return state;
}

test('legal moves are applied and illegal ones refused', () => {
  let s = chess.create(cfg, 0);
  s = play(s, ['e2e4']);
  assert.deepEqual(s.moves, ['e2e4']);
  assert.ok('error' in chess.act(s, 'white', { type: 'move', from: 'd2', to: 'd4' }, 2000), 'not white’s turn');
  assert.ok('error' in chess.act(s, 'black', { type: 'move', from: 'e7', to: 'e4' }, 2000), 'illegal');
});

test('fool’s mate ends the game by checkmate', () => {
  const s = play(chess.create(cfg, 0), ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.deepEqual(s.result, { winner: 'black', reason: 'checkmate' });
  assert.ok('error' in chess.act(s, 'white', { type: 'resign' }, 9999));
});

test('clocks start after both sides move, charge the mover and add the increment', () => {
  let s = play(chess.create(cfg, 0), ['e2e4', 'e7e5'], 0, 1000);
  assert.equal(s.turnStartedAt, 2000);
  assert.equal(s.clocks.white, 60_000);
  const r = chess.act(s, 'white', { type: 'move', from: 'g1', to: 'f3' }, 12_000);
  assert.ok(!('error' in r));
  s = r.state;
  assert.equal(s.clocks.white, 60_000 - 10_000 + 2000);
  assert.equal(chess.nextDeadline(s), 12_000 + 60_000);
  const v = chess.view(s, 22_000) as ChessView;
  assert.equal(v.clockRunning, 'black');
  assert.equal(v.clocks!.black, 50_000);
});

test('running out of time loses', () => {
  const s = play(chess.create(cfg, 0), ['e2e4', 'e7e5'], 0, 1000);
  assert.equal(chess.tick(s, 30_000), null);
  const out = chess.tick(s, 2000 + 60_000);
  assert.deepEqual(out?.result, { winner: 'black', reason: 'time' });
});

test('no clock means no deadline', () => {
  const s = play(chess.create({ initialSeconds: 0, incrementSeconds: 0 }, 0), ['e2e4', 'e7e5']);
  assert.equal(chess.nextDeadline(s), null);
  assert.equal((chess.view(s, 0) as ChessView).clocks, null);
});

test('draw offers: accept, decline, and a crossing offer agrees', () => {
  let s = chess.create(cfg, 0);
  let r = chess.act(s, 'white', { type: 'offer_draw' }, 1);
  assert.ok(!('error' in r)); s = r.state;
  assert.ok('error' in chess.act(s, 'white', { type: 'accept_draw' }, 2), 'can’t accept your own offer');
  r = chess.act(s, 'black', { type: 'decline_draw' }, 2);
  assert.ok(!('error' in r)); assert.equal(r.state.drawOfferBy, null);
  r = chess.act(r.state, 'black', { type: 'offer_draw' }, 3);
  assert.ok(!('error' in r));
  r = chess.act(r.state, 'white', { type: 'offer_draw' }, 4);
  assert.ok(!('error' in r));
  assert.deepEqual(r.state.result, { winner: null, reason: 'agreement' });
});

test('promotion', () => {
  const s = play(chess.create(cfg, 0), ['a2a4', 'h7h6', 'a4a5', 'h6h5', 'a5a6', 'h5h4', 'a6b7', 'h4h3', 'b7a8n']);
  assert.equal(s.moves.at(-1), 'b7a8n');
  assert.ok((chess.view(s, 0) as ChessView).fen.startsWith('Nnbqkbnr'));
});

test('parseConfig clamps junk', () => {
  assert.deepEqual(chess.parseConfig({ initialSeconds: -5, incrementSeconds: 'x' }), { initialSeconds: 0, incrementSeconds: 3 });
  assert.equal(chess.describeConfig({ initialSeconds: 300, incrementSeconds: 3 }), '5 min + 3 s');
});
