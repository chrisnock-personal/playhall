// Bots and AI players answering "what orders did you have?" (Ship2Shore).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ship2shoreTalk as talk } from './ship2shore.talk';
import type { ShipView } from './ship2shore';

const names = { amber: 'Sam', teal: 'Ada (bot)', violet: 'Kai' };
function view(faction: 'navy' | 'spy' | 'bm', secret: NonNullable<ShipView['you']>['secrets'][number], extra: Partial<ShipView> = {}): ShipView {
  return {
    order: ['amber', 'teal', 'violet'], round: 2, phase: 'pick', captain: 'violet', officer: null, helm: null, silenced: [], overboard: [], result: null,
    log: [{ k: 'round', n: 1, captain: 'amber' }, { k: 'pick', seat: 'amber', officer: 'teal', helm: 'violet' }, { k: 'round', n: 2, captain: 'violet' }],
    you: { seat: 'teal', role: faction === 'navy' ? 'navy' : faction === 'spy' ? 'spy' : 'smuggler', faction, ammo: 3, spies: null, partners: [], hand: null, helmCards: null, spotCard: null, toAct: false, vote: null, fixerMove: false, bribable: [], secrets: [secret] },
    ...extra,
  } as unknown as ShipView;
}
const drew = { round: 1, k: 'drew' as const, cards: ['navy.steady', 'spy.steady'] as ['navy.steady', 'spy.steady'], kept: 'spy.steady' as const };

test('who is being asked: by name, or by the job they held last round, as a question', () => {
  const v = view('navy', drew);
  assert.equal(talk.asked(v, 'teal', 'Ada, what did you have?', names), true);
  assert.equal(talk.asked(v, 'teal', 'first officer, which orders?', names), true);
  assert.equal(talk.asked(v, 'teal', 'What did the bridge get?', names), true);
  assert.equal(talk.asked(v, 'teal', 'helmsman, what did you sail on?', names), false, 'Ada was first officer, not helmsman');
  assert.equal(talk.asked(v, 'teal', 'Ada is great', names), false, 'not a question');
  assert.equal(talk.asked(view('navy', drew, { log: [] }), 'teal', 'Kai, what did you have?', names), false, 'asked someone else');
  assert.equal(talk.asked(v, 'teal', 'Kai, you were on the bridge: what did you have?', names), false, 'someone else named: only they answer');
});

test('a Navy bot tells the truth; anyone else lies only when they passed over a Navy order', () => {
  const r = () => 0;
  assert.match(talk.answer(view('navy', drew), 'teal', r)!, /Navy order and a U-boat order/);
  assert.match(talk.answer(view('spy', drew), 'teal', r)!, /two U-boat orders/i, 'the spy hides that it passed on the Navy order');
  const honest = { ...drew, cards: ['bm.steady', 'spy.steady'] as ['bm.steady', 'spy.steady'] };
  assert.match(talk.answer(view('spy', honest), 'teal', r)!, /Lisbon order and a U-boat order/, 'nothing to hide: the truth');
  assert.match(talk.truth(view('spy', drew), 'teal')!, /drew a Navy order and a U-boat order, and kept the U-boat one/);
});

test('no talking on the bridge while plotting, under radio silence or in the water', () => {
  assert.equal(talk.canTalk(view('navy', drew), 'teal'), true);
  assert.equal(talk.canTalk(view('navy', drew, { phase: 'draw', officer: 'teal' }), 'teal'), false);
  assert.equal(talk.canTalk(view('navy', drew, { phase: 'draw' }), 'teal'), true, 'off the bridge you may talk while they plot');
  assert.equal(talk.canTalk(view('navy', drew, { silenced: ['teal'] }), 'teal'), false);
  assert.equal(talk.canTalk(view('navy', drew, { overboard: ['teal'] }), 'teal'), false);
});
