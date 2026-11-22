import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportProblem } from './reports';

const me = '11111111-1111-1111-1111-111111111111';
const them = '22222222-2222-2222-2222-222222222222';

test('a report needs a known reason, short details, and someone other than you', () => {
  assert.equal(reportProblem({ reason: 'rude' }, me), null);
  assert.equal(reportProblem({ reason: 'spam', details: 'kept posting links', userId: them }, me), null);
  assert.match(reportProblem({}, me) ?? '', /reason/);
  assert.match(reportProblem({ reason: 'boring' }, me) ?? '', /reason/);
  assert.match(reportProblem({ reason: 'other', details: 'x'.repeat(501) }, me) ?? '', /500/);
  assert.match(reportProblem({ reason: 'rude', userId: 'not-an-id' }, me) ?? '', /No such/);
  assert.match(reportProblem({ reason: 'rude', userId: me }, me) ?? '', /yourself/);
});
