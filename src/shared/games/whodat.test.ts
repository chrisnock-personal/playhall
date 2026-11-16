import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAST, QUESTIONS, question, whoDat as g, type WhoState, type WhoView } from './whodat';

const ctx = { seats: ['amber', 'teal'], random: () => 0.5 };
const ok = (r: ReturnType<typeof g.act>): WhoState => { if ('error' in r) throw new Error(r.error); return r.state; };
const err = (r: ReturnType<typeof g.act>) => ('error' in r ? r.error : null);
const fixed = (amber: number, teal: number): WhoState => ({ ...g.create({}, 0, ctx), secret: { amber, teal } });
const idx = (name: string) => CAST.findIndex((f) => f.name === name);

test('the cast: 24 named faces, and every question splits them usefully', () => {
  assert.equal(CAST.length, 24);
  assert.equal(new Set(CAST.map((f) => f.name)).size, 24);
  for (const q of QUESTIONS) {
    const n = CAST.filter(q.test).length;
    assert.ok(n >= 3 && n <= 12, `${q.id}: ${n} faces`);
  }
});

test('a question is answered from the other secret face and flips down what it rules out', () => {
  let s = fixed(idx('Abe'), idx('Quin')); // Quin: red hair, long, hat, glasses
  assert.match(err(g.act(s, 'teal', { type: 'ask', q: 'hat' }, 0, ctx)) ?? '', /your turn/);
  s = ok(g.act(s, 'amber', { type: 'ask', q: 'hat' }, 0, ctx));
  assert.deepEqual(s.asked, [{ seat: 'amber', q: 'hat', yes: true }]);
  assert.equal(s.turn, 'teal');
  assert.deepEqual(CAST.filter((_, i) => s.up.amber[i]).map((f) => f.name), CAST.filter(question('hat').test).map((f) => f.name));
  assert.ok(s.up.teal.every(Boolean), 'the other board is untouched');
  s = ok(g.act(s, 'teal', { type: 'ask', q: 'beard' }, 0, ctx)); // Abe has a beard
  assert.equal(s.asked[1].yes, true);
  assert.match(err(g.act(s, 'amber', { type: 'ask', q: 'hat' }, 0, ctx)) ?? '', /haven’t asked/);
});

test('flipping by hand; naming the face: right wins, wrong loses', () => {
  let s = fixed(idx('Abe'), idx('Quin'));
  s = ok(g.act(s, 'teal', { type: 'flip', face: 3, up: false }, 0, ctx));
  assert.equal(s.up.teal[3], false, 'any time, your own board only');
  const right = ok(g.act(s, 'amber', { type: 'guess', face: idx('Quin') }, 0, ctx));
  assert.equal(right.result?.winner, 'amber');
  assert.match(right.result!.reason, /naming Quin/);
  const wrong = ok(g.act(s, 'amber', { type: 'guess', face: idx('Bea') }, 0, ctx));
  assert.equal(wrong.result?.winner, 'teal');
  assert.match(wrong.result!.reason, /wrong guess \(Bea\)/);
});

test('views: your own face and board only; watchers see the boards, not the faces; all at the end', () => {
  const s = ok(g.act(fixed(idx('Abe'), idx('Quin')), 'amber', { type: 'ask', q: 'glasses' }, 0, ctx));
  const a = g.view(s, 0, 'amber') as WhoView;
  assert.deepEqual(a.secret, { amber: idx('Abe') });
  assert.deepEqual(Object.keys(a.up), ['amber']);
  assert.ok(!JSON.stringify(a).includes(`"teal":${idx('Quin')}`));
  const w = g.view(s, 0, null) as WhoView;
  assert.deepEqual(w.secret, {});
  assert.deepEqual(Object.keys(w.up).sort(), ['amber', 'teal']);
  const done = ok(g.act(s, 'teal', { type: 'resign' }, 0, ctx));
  assert.deepEqual((g.view(done, 0, 'amber') as WhoView).secret, { amber: idx('Abe'), teal: idx('Quin') });
});

test('out of time: a good question is asked; with none left, a face still up is named', () => {
  let s = g.timeout!(fixed(0, 1), 'amber', 0, ctx);
  assert.equal(s.asked.length, 1);
  s = { ...fixed(0, 1), asked: QUESTIONS.map((q) => ({ seat: 'amber', q: q.id, yes: false })) };
  s = g.timeout!(s, 'amber', 0, ctx);
  assert.ok(s.result, 'a face was named');
});

test('replays: a frame per question, both faces shown', () => {
  let s = fixed(idx('Abe'), idx('Quin'));
  s = ok(g.act(s, 'amber', { type: 'ask', q: 'hat' }, 0, ctx));
  s = ok(g.act(s, 'teal', { type: 'ask', q: 'beard' }, 0, ctx));
  s = ok(g.act(s, 'amber', { type: 'guess', face: idx('Quin') }, 0, ctx));
  const frames = g.replay!(s) as WhoView[];
  assert.equal(frames.length, 4);
  assert.equal(frames[1].asked.length, 1);
  assert.deepEqual(frames[0].secret, { amber: idx('Abe'), teal: idx('Quin') });
});
