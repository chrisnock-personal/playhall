// Manor Mystery AI players (#70): table talk is written from the move the
// model made, so it can't announce one suggestion and then choose another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manorAi } from './manormystery.ai';
import { CARDS, type ManorView } from './manormystery';

const view = { positions: { amber: 'chapel' } } as unknown as ManorView;
const describe = (action: unknown) => manorAi.describeChoice!(view, 'amber', action, { amber: 'Sam' });

test('a suggestion says exactly the suspect, object and room that were chosen', () => {
  const line = describe({ type: 'suggest', suspect: 'vane', object: 'rope' });
  assert.equal(line, 'I’m suggesting Lady Vane, with the rope, in the Chapel.');
  assert.ok(!line!.includes(CARDS.hale.name) && !line!.includes(CARDS.hatpin.name) && !line!.includes(CARDS.boathouse.name));
});

test('an accusation names all three cards in the action', () => {
  assert.equal(
    describe({ type: 'accuse', suspect: 'okafor', object: 'fireiron', room: 'cellar' }),
    'I’m accusing Dr Okafor, with the fire iron, in the Wine Cellar.',
  );
});

test('showing a card doesn’t tell the table which one it was', () => {
  const line = describe({ type: 'show', card: 'rope' });
  assert.equal(line, 'I’ll show you one of those.');
  assert.ok(!line!.includes(CARDS.rope.name));
});

test('there’s nothing to say about a move or the end of a turn', () => {
  assert.equal(describe({ type: 'move', room: 'music' }), null);
  assert.equal(describe({ type: 'end' }), null);
});
