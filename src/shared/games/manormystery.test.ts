import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  manorMystery as mm, deal, exits, ALL_CARDS, SUSPECTS, OBJECTS, ROOMS, CARDS,
  type CardId, type ManorState, type ManorView, type Solution,
} from './manormystery';
import { score } from '../scoring';

const SEATS3 = ['amber', 'teal', 'violet'];
const SEATS4 = ['amber', 'teal', 'violet', 'rose'];
const ctx = (seats = SEATS4, random = Math.random) => ({ seats, random });
const ok = (r: ReturnType<typeof mm.act>): ManorState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof mm.act>) => ('error' in r ? r.error : null);
const act = (s: ManorState, seat: string, a: unknown) => ok(mm.act(s, seat, a, 0, ctx(s.order)));
const view = (s: ManorState, viewer: string | null) => mm.view(s, 0, viewer) as ManorView;

/** A seeded random source, so fuzzed games can be repeated. */
function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}

const ENVELOPE: Solution = { suspect: 'hale', object: 'hatpin', room: 'observatory' };
/** A fixed four-player table: amber to play, everyone in the Chapel. */
function table(hands: Record<string, CardId[]>, extra: Partial<ManorState> = {}): ManorState {
  const order = Object.keys(hands);
  return {
    key: 'k', order, turn: 0, envelope: ENVELOPE, hands,
    positions: Object.fromEntries(order.map((p) => [p, 'chapel'])),
    moved: false, suggested: false, pending: null, out: [], resigned: [], log: [], result: null, ...extra,
  } as ManorState;
}
const HANDS: Record<string, CardId[]> = {
  amber: ['okafor', 'decanter', 'music', 'boathouse', 'maproom'],
  teal: ['vane', 'fireiron', 'chapel', 'greenhouse'],
  violet: ['pike', 'mallet', 'rope', 'armoury'],
  rose: ['rowe', 'ashby', 'telescope', 'cellar', 'nursery'],
};

test('dealing: every card accounted for, one of each kind in the envelope', () => {
  for (const seats of [SEATS3, SEATS4, ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e', 'f']]) {
    const { envelope, hands } = deal(seats, Math.random);
    assert.equal(CARDS[envelope.suspect].kind, 'suspect');
    assert.equal(CARDS[envelope.object].kind, 'object');
    assert.equal(CARDS[envelope.room].kind, 'room');
    const all = [envelope.suspect, envelope.object, envelope.room, ...Object.values(hands).flat()];
    assert.equal(all.length, 21);
    assert.deepEqual(new Set(all), new Set(ALL_CARDS));
    const sizes = Object.values(hands).map((h) => h.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'dealt evenly, as near as it goes');
  }
  assert.equal(SUSPECTS.length + OBJECTS.length + ROOMS.length, 21);
  const s = mm.create({}, 0, ctx(SEATS3));
  assert.equal(s.order[s.turn], 'amber');
  assert.ok(Object.values(s.positions).every((r) => r === 'chapel'));
  assert.equal(mm.minPlayers, 3);
  assert.equal(mm.seats.length, 6);
});

test('the map: doors to neighbours, and two hidden passages', () => {
  assert.deepEqual(new Set(exits('chapel')), new Set(['music', 'maproom', 'greenhouse', 'cellar']));
  assert.deepEqual(new Set(exits('observatory')), new Set(['music', 'maproom', 'nursery']));
  assert.deepEqual(new Set(exits('nursery')), new Set(['greenhouse', 'cellar', 'observatory']));
  assert.deepEqual(new Set(exits('boathouse')), new Set(['music', 'greenhouse', 'armoury']));
  assert.deepEqual(new Set(exits('armoury')), new Set(['maproom', 'cellar', 'boathouse']));
  assert.deepEqual(new Set(exits('music')), new Set(['observatory', 'boathouse', 'chapel']));
  for (const r of ROOMS) for (const x of exits(r)) assert.ok(exits(x).includes(r), `${r} and ${x} join both ways`);
});

test('moving: once a turn, only to a connected room; suggest only after moving', () => {
  let s = table(HANDS);
  assert.match(err(mm.act(s, 'amber', { type: 'move', room: 'observatory' }, 0, ctx())) ?? '', /can’t get there/);
  assert.match(err(mm.act(s, 'teal', { type: 'move', room: 'music' }, 0, ctx())) ?? '', /your turn/);
  assert.match(err(mm.act(s, 'amber', { type: 'suggest', suspect: 'vane', object: 'rope' }, 0, ctx())) ?? '', /Move first/);
  assert.match(err(mm.act(s, 'amber', { type: 'end' }, 0, ctx())) ?? '', /Move first/);
  s = act(s, 'amber', { type: 'move', room: 'music' });
  assert.equal(s.positions.amber, 'music');
  assert.match(err(mm.act(s, 'amber', { type: 'move', room: 'chapel' }, 0, ctx())) ?? '', /already moved/);
  s = act(s, 'amber', { type: 'end' });
  assert.equal(s.order[s.turn], 'teal');
  // Through a passage.
  s = table(HANDS, { positions: { amber: 'observatory', teal: 'chapel', violet: 'chapel', rose: 'chapel' } });
  s = act(s, 'amber', { type: 'move', room: 'nursery' });
  assert.equal(s.positions.amber, 'nursery');
  s = table(HANDS, { positions: { amber: 'armoury', teal: 'chapel', violet: 'chapel', rose: 'chapel' } });
  assert.equal(act(s, 'amber', { type: 'move', room: 'boathouse' }).positions.amber, 'boathouse');
});

test('suggesting: asked in order after the suggester; one match is shown at once', () => {
  let s = act(table(HANDS), 'amber', { type: 'move', room: 'greenhouse' });
  // Pike, rope, greenhouse: teal holds the Greenhouse (only), so teal shows it.
  s = act(s, 'amber', { type: 'suggest', suspect: 'pike', object: 'rope' });
  assert.equal(s.pending, null);
  const last = s.log[s.log.length - 1];
  assert.deepEqual({ ...last, turn: undefined }, { seat: 'teal', kind: 'show', to: 'amber', card: 'greenhouse', turn: undefined });
  assert.match(err(mm.act(s, 'amber', { type: 'suggest', suspect: 'pike', object: 'rope' }, 0, ctx())) ?? '', /already made a suggestion/);
  s = act(s, 'amber', { type: 'end' });
  // Teal in the Wine Cellar suggests Hale + hatpin: violet passes, rose holds the cellar, amber isn't reached.
  s = act(s, 'teal', { type: 'move', room: 'cellar' });
  s = act(s, 'teal', { type: 'suggest', suspect: 'hale', object: 'hatpin' });
  const tail = s.log.slice(-3).map((e) => [e.seat, e.kind]);
  assert.deepEqual(tail, [['teal', 'suggest'], ['violet', 'pass'], ['rose', 'show']]);
  // Wrapping round: rose suggests in the Map Room; the order is amber (holds it) first.
  s = table(HANDS, { turn: 3 });
  s = act(s, 'rose', { type: 'move', room: 'maproom' });
  s = act(s, 'rose', { type: 'suggest', suspect: 'vane', object: 'mallet' });
  assert.equal(s.pending?.refuter, undefined);
  assert.deepEqual(s.log.slice(-1).map((e) => [e.seat, e.kind]), [['amber', 'show']]);
});

test('nobody can show: logged, and the turn carries on', () => {
  let s = table(HANDS, { positions: { amber: 'nursery', teal: 'chapel', violet: 'chapel', rose: 'chapel' } });
  s = act(s, 'amber', { type: 'move', room: 'observatory' });
  s = act(s, 'amber', { type: 'suggest', suspect: 'hale', object: 'hatpin' }); // the envelope itself
  assert.deepEqual(s.log.slice(-4).map((e) => e.kind), ['pass', 'pass', 'pass', 'nobody']);
  assert.equal(s.order[s.turn], 'amber');
  assert.deepEqual(mm.turn!(s), ['amber']);
});

test('the refuter chooses when holding more than one; turn() waits for them', () => {
  let s = act(table(HANDS), 'amber', { type: 'move', room: 'greenhouse' });
  s = act(s, 'amber', { type: 'suggest', suspect: 'vane', object: 'fireiron' }); // teal holds all three
  assert.deepEqual(s.pending && { r: s.pending.refuter, by: s.pending.suggester }, { r: 'teal', by: 'amber' });
  assert.deepEqual(mm.turn!(s), ['teal']);
  assert.deepEqual(new Set(view(s, 'teal').mustShow), new Set(['vane', 'fireiron', 'greenhouse']));
  assert.equal(view(s, 'amber').mustShow, null);
  assert.match(err(mm.act(s, 'amber', { type: 'end' }, 0, ctx())) ?? '', /Waiting/);
  assert.match(err(mm.act(s, 'violet', { type: 'show', card: 'rope' }, 0, ctx())) ?? '', /Nobody needs/);
  assert.match(err(mm.act(s, 'teal', { type: 'show', card: 'chapel' }, 0, ctx())) ?? '', /suggested cards/);
  s = act(s, 'teal', { type: 'show', card: 'fireiron' });
  assert.equal(s.pending, null);
  assert.deepEqual(mm.turn!(s), ['amber']);
  assert.equal(view(s, 'amber').notebook?.fireiron?.teal, 'yes');
});

test('privacy: hands, the envelope and the shown card', () => {
  let s = act(table(HANDS), 'amber', { type: 'move', room: 'greenhouse' });
  s = act(s, 'amber', { type: 'suggest', suspect: 'vane', object: 'fireiron' });
  s = act(s, 'teal', { type: 'show', card: 'vane' });
  for (const viewer of [null, 'violet', 'rose']) {
    const v = view(s, viewer);
    const text = JSON.stringify(v);
    assert.equal(v.envelope, null);
    assert.equal(v.hands, null);
    assert.ok(!text.includes('"envelope":{'), 'no envelope');
    const shown = v.log.find((e) => e.kind === 'show')!;
    assert.ok(!('card' in shown), `${viewer} can’t see which card`);
    // Only your own hand.
    for (const p of ['amber', 'teal']) for (const c of HANDS[p]) {
      if (viewer && HANDS[viewer].includes(c)) continue;
      assert.ok(!v.hand?.includes(c));
    }
    if (viewer) {
      assert.deepEqual(v.hand, HANDS[viewer]);
      // The notebook knows only what this viewer has seen: nothing about teal's Lady Vane.
      assert.notEqual(v.notebook?.vane?.teal, 'yes');
    } else {
      assert.equal(v.hand, null);
      assert.equal(v.notebook, null);
    }
  }
  const forAmber = view(s, 'amber');
  assert.equal((forAmber.log.find((e) => e.kind === 'show') as { card?: string }).card, 'vane');
  assert.equal(forAmber.notebook?.vane?.teal, 'yes');
  assert.equal(forAmber.notebook?.vane?.violet, 'no');
  assert.equal((view(s, 'teal').log.find((e) => e.kind === 'show') as { card?: string }).card, 'vane');
  assert.deepEqual(view(s, 'violet').counts, { amber: 5, teal: 4, violet: 4, rose: 5 });
  // The envelope's cards aren't anywhere in a player's view mid-game.
  const json = JSON.stringify(view(act(table(HANDS), 'amber', { type: 'move', room: 'music' }), null));
  assert.ok(!json.includes('"hale"') && !json.includes('"hatpin"'));
});

test('the notebook: your hand, cards shown to you, and who couldn’t show', () => {
  let s = table(HANDS, { turn: 1 });
  s = act(s, 'teal', { type: 'move', room: 'cellar' });
  s = act(s, 'teal', { type: 'suggest', suspect: 'hale', object: 'hatpin' }); // violet passes, rose shows the cellar
  const nb = view(s, 'amber').notebook!;
  assert.equal(nb.okafor?.amber, 'yes');
  assert.equal(nb.okafor?.teal, 'no');
  assert.equal(nb.vane?.amber, 'no');
  assert.equal(nb.hale?.violet, 'no', 'violet passed on Hale');
  assert.equal(nb.cellar?.violet, 'no');
  assert.equal(nb.cellar?.rose, undefined, 'amber didn’t see which card rose showed');
  assert.equal(view(s, 'teal').notebook!.cellar?.rose, 'yes');
});

test('accusing: right wins; wrong is out of the running but still shows cards', () => {
  let s = table(HANDS);
  const won = act(s, 'amber', { type: 'accuse', ...ENVELOPE });
  assert.equal(won.result?.winner, 'amber');
  assert.equal(won.result?.reason, 'solving the case');
  assert.deepEqual(won.result?.placings, [['amber'], ['teal', 'violet', 'rose']]);
  assert.deepEqual(view(won, 'teal').envelope, ENVELOPE);
  assert.deepEqual(view(won, null).hands, HANDS);
  assert.equal(score(won.result!, won.order).amber.points, 3);
  assert.match(err(mm.act(won, 'teal', { type: 'end' }, 0, ctx())) ?? '', /over/);

  s = act(s, 'amber', { type: 'accuse', suspect: 'vane', object: 'hatpin', room: 'observatory' });
  assert.equal(s.result, null);
  assert.deepEqual(s.out, ['amber']);
  assert.equal(s.order[s.turn], 'teal');
  assert.equal(view(s, 'amber').envelope, null, 'a wrong accuser doesn’t see the envelope');
  // Amber is skipped for turns...
  s = act(act(s, 'teal', { type: 'move', room: 'music' }), 'teal', { type: 'end' });
  s = act(act(s, 'violet', { type: 'move', room: 'music' }), 'violet', { type: 'end' });
  s = act(act(s, 'rose', { type: 'move', room: 'music' }), 'rose', { type: 'end' });
  assert.equal(s.order[s.turn], 'teal');
  // ...but still shows cards: rose suggests Okafor in the Music Room, amber holds both.
  s = act(act(act(s, 'teal', { type: 'move', room: 'chapel' }), 'teal', { type: 'end' }), 'violet', { type: 'move', room: 'chapel' });
  s = act(s, 'violet', { type: 'end' });
  s = act(s, 'rose', { type: 'move', room: 'observatory' });
  s = act(s, 'rose', { type: 'end' });
  s = act(s, 'teal', { type: 'move', room: 'music' });
  s = act(s, 'teal', { type: 'suggest', suspect: 'okafor', object: 'decanter' });
  // Violet and rose have none; amber, though out, must choose.
  assert.equal(s.pending?.refuter, 'amber');
  s = act(s, 'amber', { type: 'show', card: 'music' });
  assert.equal(view(s, 'teal').notebook?.music?.amber, 'yes');
});

test('everyone accusing wrongly: nobody wins and the envelope is opened', () => {
  let s = table(HANDS);
  const wrong = { type: 'accuse', suspect: 'pike', object: 'rope', room: 'chapel' };
  for (const p of ['amber', 'teal', 'violet']) s = act(s, p, wrong);
  assert.equal(s.result, null);
  assert.equal(s.order[s.turn], 'rose');
  s = act(s, 'rose', wrong);
  assert.equal(s.result?.winner, null);
  assert.equal(s.result?.reason, 'nobody solving the case');
  assert.deepEqual(view(s, null).envelope, ENVELOPE);
  assert.equal(view(s, null).turn, null);
  assert.deepEqual(mm.turn!(s), []);
});

test('placings: solver, then those still in, then wrong accusers, then resigned', () => {
  let s = table(HANDS);
  s = act(s, 'amber', { type: 'accuse', suspect: 'pike', object: 'rope', room: 'chapel' });
  s = act(s, 'violet', { type: 'resign' });
  s = act(s, 'teal', { type: 'accuse', ...ENVELOPE });
  assert.deepEqual(s.result?.placings, [['teal'], ['rose'], ['amber'], ['violet']]);
  const pts = score(s.result!, s.order);
  assert.deepEqual([pts.teal.points, pts.rose.points, pts.amber.points, pts.violet.points], [3, 1, 0, 0]);
});

test('timeout: the turn moves at random and ends; a refuter shows a card at random', () => {
  let s = table(HANDS);
  s = mm.timeout!(s, 'amber', 0, ctx());
  assert.ok(exits('chapel').includes(s.positions.amber));
  assert.equal(s.order[s.turn], 'teal');
  assert.deepEqual(s.log.map((e) => [e.kind, e.auto]), [['move', true], ['end', true]]);
  // After moving, a timeout just ends the turn.
  s = act(s, 'teal', { type: 'move', room: 'music' });
  s = mm.timeout!(s, 'teal', 0, ctx());
  assert.equal(s.positions.teal, 'music');
  assert.equal(s.order[s.turn], 'violet');
  // Someone else's timeout changes nothing.
  assert.equal(mm.timeout!(s, 'rose', 0, ctx()), s);
  // The refuter.
  let r = act(table(HANDS), 'amber', { type: 'move', room: 'greenhouse' });
  r = act(r, 'amber', { type: 'suggest', suspect: 'vane', object: 'fireiron' });
  assert.equal(mm.timeout!(r, 'amber', 0, ctx()), r, 'the suggester’s timer isn’t running');
  r = mm.timeout!(r, 'teal', 0, ctx());
  const shown = r.log[r.log.length - 1];
  assert.equal(shown.kind, 'show');
  assert.ok(['vane', 'fireiron', 'greenhouse'].includes((shown as { card: string }).card));
  assert.equal(r.pending, null);
  assert.deepEqual(mm.turn!(r), ['amber']);
});

test('resigning: cards go face up, skipped when asked, turn passes', () => {
  let s = table(HANDS);
  s = act(s, 'teal', { type: 'resign' });
  assert.deepEqual(view(s, 'rose').faceUp, { teal: HANDS.teal });
  assert.equal(view(s, 'rose').notebook?.chapel?.teal, 'yes');
  assert.equal(view(s, 'rose').notebook?.okafor?.teal, 'no');
  assert.equal(s.order[s.turn], 'amber');
  // Amber suggests teal's cards: teal is skipped (face up), violet and rose pass.
  s = act(s, 'amber', { type: 'move', room: 'greenhouse' });
  s = act(s, 'amber', { type: 'suggest', suspect: 'vane', object: 'fireiron' });
  assert.deepEqual(s.log.slice(-3).map((e) => [e.seat, e.kind]), [['violet', 'pass'], ['rose', 'pass'], ['amber', 'nobody']]);
  s = act(s, 'amber', { type: 'end' });
  assert.equal(s.order[s.turn], 'violet', 'teal is skipped');
  assert.match(err(mm.act(s, 'teal', { type: 'move', room: 'music' }, 0, ctx())) ?? '', /resigned/);

  // Resigning on your own turn passes it; resigning while you must show a card moves on to the next player.
  let r = act(table(HANDS), 'amber', { type: 'move', room: 'greenhouse' });
  r = act(r, 'amber', { type: 'suggest', suspect: 'vane', object: 'fireiron' });
  r = act(r, 'teal', { type: 'resign' });
  assert.equal(r.pending, null);
  assert.deepEqual(r.log.slice(-3).map((e) => [e.seat, e.kind]), [['violet', 'pass'], ['rose', 'pass'], ['amber', 'nobody']]);
  assert.deepEqual(mm.turn!(r), ['amber']);
  r = act(r, 'amber', { type: 'resign' });
  assert.equal(r.order[r.turn], 'violet');
  assert.equal(r.pending, null);
  // Down to one player: they win.
  r = act(r, 'violet', { type: 'resign' });
  assert.equal(r.result?.winner, 'rose');
  assert.equal(r.result?.reason, 'everyone else resigning');
});

test('replay: a watcher’s frames, with no hidden card until the end', () => {
  let s = mm.create({}, 0, ctx(SEATS3, seeded(7)));
  const hands = s.hands;
  // Play a few turns with suggestions, then the right accusation.
  for (let i = 0; i < 6; i++) {
    const p = s.order[s.turn];
    s = act(s, p, { type: 'move', room: exits(s.positions[p])[0] });
    s = act(s, p, { type: 'suggest', suspect: SUSPECTS[i % 6], object: OBJECTS[(i + 2) % 6] });
    while (s.pending) s = act(s, s.pending.refuter, { type: 'show', card: view(s, s.pending.refuter).mustShow![0] });
    s = act(s, p, { type: 'end' });
  }
  const mid = mm.replay!(s) as ManorView[];
  assert.equal(mid.length, s.log.length + 1);
  for (const f of mid) {
    assert.equal(f.envelope, null);
    assert.equal(f.hands, null);
    assert.equal(f.hand, null);
    assert.ok(f.log.every((e) => e.kind !== 'show' || !('card' in e)));
  }
  assert.deepEqual(mid[mid.length - 1].positions, s.positions);
  s = act(s, s.order[s.turn], { type: 'accuse', ...s.envelope });
  const frames = mm.replay!(s) as ManorView[];
  const end = frames[frames.length - 1];
  assert.deepEqual(end.envelope, s.envelope);
  assert.deepEqual(end.hands, hands);
  assert.ok(end.result);
  for (const f of frames.slice(0, -1)) assert.equal(f.envelope, null);
  // Whose turn it was is kept in the frames.
  const turns = new Set(frames.map((f) => f.turn));
  assert.ok(turns.size >= 3);
});

test('fuzz: many random games always end, with cards conserved and views private', () => {
  for (let g = 0; g < 300; g++) {
    const random = seeded(g + 1);
    const n = 3 + (g % 4);
    const seats = ['amber', 'teal', 'violet', 'rose', 'white', 'black'].slice(0, n);
    const c = ctx(seats, random);
    let s = mm.create({}, 0, c);
    const envelope = s.envelope;
    let steps = 0;
    while (!s.result) {
      assert.ok(++steps < 5000, `game ${g} doesn’t end`);
      const who = mm.turn!(s);
      assert.equal(who.length, 1);
      const p = who[0];
      const roll = random();
      let a: unknown;
      if (roll < 0.03) a = { type: 'resign' };
      else if (roll < 0.06) s = mm.timeout!(s, p, 0, c);
      else if (s.pending) a = { type: 'show', card: view(s, p).mustShow![Math.floor(random() * view(s, p).mustShow!.length)] };
      else if (!s.moved) a = { type: 'move', room: exits(s.positions[p])[Math.floor(random() * exits(s.positions[p]).length)] };
      else if (!s.suggested && random() < 0.8) a = { type: 'suggest', suspect: SUSPECTS[Math.floor(random() * 6)], object: OBJECTS[Math.floor(random() * 6)] };
      else if (random() < 0.08) a = { type: 'accuse', suspect: SUSPECTS[Math.floor(random() * 6)], object: OBJECTS[Math.floor(random() * 6)], room: ROOMS[Math.floor(random() * 9)] };
      else a = { type: 'end' };
      if (a) s = ok(mm.act(s, p, a, 0, c));
      // Invariants.
      assert.deepEqual(s.envelope, envelope);
      assert.equal(Object.values(s.hands).flat().length, 18);
      if (!s.result) {
        for (const q of seats) {
          const v = view(s, q);
          assert.equal(v.envelope, null);
          assert.deepEqual(v.hand, s.hands[q]);
          for (const e of v.log) if (e.kind === 'show' && 'card' in e) assert.ok(e.seat === q || e.to === q);
          // Everything the notebook says is true.
          for (const [card, row] of Object.entries(v.notebook!)) for (const [owner, mark] of Object.entries(row)) {
            assert.equal(s.hands[owner].includes(card as CardId), mark === 'yes', `${q}'s notebook: ${owner} ${mark} ${card}`);
          }
        }
      }
    }
    const placed = s.result.placings!.flat();
    assert.deepEqual(new Set(placed), new Set(seats));
    assert.equal(placed.length, seats.length);
    if (s.result.winner) {
      const last = s.log[s.log.length - 1];
      assert.ok((last.kind === 'accuse' && last.right) || s.result.reason === 'everyone else resigning');
    }
    const frames = mm.replay!(s) as ManorView[];
    assert.equal(frames.length, s.log.length + 1);
    for (const f of frames.slice(0, -1)) assert.equal(f.envelope, null);
  }
});
