import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db } from './db';
import { checkPlatformPatch, defaultPlatformSettings, mergePlatformSettings } from '../shared/platform';
import { getPlatformSettings, loadPlatformSettings, resetPlatformSettingsForTests, updatePlatformSettings } from './platform';

/** A stand-in for the database: answers SELECTs with `rows`, records the rest. */
function fakeDb(rows: { key: string; value: unknown }[] = []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: sql.trim().startsWith('SELECT') ? rows : [] };
    },
  } as unknown as Db;
  return { db, calls };
}

test('the defaults are today’s behaviour', () => {
  const d = defaultPlatformSettings();
  assert.deepEqual(d, {
    signupsAllowed: true, guestsAllowed: true, voiceVideoAllowed: true, transcriptsAllowed: true,
    roomDefaults: { moveSeconds: 0, watcherDelay: 0, ranked: true }, letterworksWordList: 'full',
    aiPlayers: { enabled: false, url: '', model: 'llama3.1:8b', seconds: 15 },
  });
  assert.equal(defaultPlatformSettings({ signupsAllowed: false }).signupsAllowed, false, 'ALLOW_SIGNUP=false is the starting value');
});

test('patches are checked: unknown keys and values off the lists are refused', () => {
  assert.deepEqual(checkPlatformPatch({ guestsAllowed: false }), { patch: { guestsAllowed: false } });
  assert.deepEqual(checkPlatformPatch({ roomDefaults: { moveSeconds: 60 } }), { patch: { roomDefaults: { moveSeconds: 60 } } });
  for (const bad of [null, [], 'x', { guestsAllowed: 'no' }, { nope: true }, { roomDefaults: { moveSeconds: 7 } },
    { roomDefaults: { watcherDelay: 300 } }, { roomDefaults: { ranked: 1 } }, { roomDefaults: { other: 1 } },
    { letterworksWordList: 'family' }, { roomDefaults: [] }]) {
    assert.ok('error' in checkPlatformPatch(bad), JSON.stringify(bad));
  }
});

test('stored values win over the defaults; bad stored values are skipped', () => {
  const s = mergePlatformSettings(defaultPlatformSettings({ signupsAllowed: true }), {
    signupsAllowed: false,
    roomDefaults: { watcherDelay: 30, moveSeconds: 9999 },
    letterworksWordList: 'klingon',
    retired: true,
  });
  assert.equal(s.signupsAllowed, false);
  assert.deepEqual(s.roomDefaults, { moveSeconds: 0, watcherDelay: 30, ranked: true });
  assert.equal(s.letterworksWordList, 'full');
  assert.ok(!('retired' in s));
});

test('load, read and update through the cache', async () => {
  try {
    const { db, calls } = fakeDb([{ key: 'guestsAllowed', value: false }]);
    await loadPlatformSettings(db, { signupsAllowed: false });
    assert.equal(getPlatformSettings().guestsAllowed, false);
    assert.equal(getPlatformSettings().signupsAllowed, false, 'from the environment while nothing is stored');

    const before = getPlatformSettings();
    const after = await updatePlatformSettings({ signupsAllowed: true, roomDefaults: { ranked: false } }, '00000000-0000-0000-0000-000000000001');
    assert.equal(after.signupsAllowed, true);
    assert.deepEqual(after.roomDefaults, { moveSeconds: 0, watcherDelay: 0, ranked: false });
    assert.equal(getPlatformSettings(), after);
    assert.equal(before.roomDefaults.ranked, true, 'the old object isn’t changed under anyone holding it');
    const write = calls.at(-1)!;
    assert.match(write.sql, /INSERT INTO platform_settings/);
    assert.deepEqual(JSON.parse(write.params[0] as string), { signupsAllowed: true, roomDefaults: { moveSeconds: 0, watcherDelay: 0, ranked: false } }, 'roomDefaults is stored whole');
  } finally {
    resetPlatformSettingsForTests();
  }
});

test('AI player settings: off by default; the address, model and time limit are checked', () => {
  assert.deepEqual(defaultPlatformSettings().aiPlayers, { enabled: false, url: '', model: 'llama3.1:8b', seconds: 15 });
  assert.deepEqual(checkPlatformPatch({ aiPlayers: { enabled: true, url: 'http://host.containers.internal:11434/', model: 'qwen2.5:7b', seconds: 30 } }),
    { patch: { aiPlayers: { enabled: true, url: 'http://host.containers.internal:11434', model: 'qwen2.5:7b', seconds: 30 } } });
  assert.match((checkPlatformPatch({ aiPlayers: { url: 'ftp://x' } }) as { error: string }).error, /http/);
  assert.match((checkPlatformPatch({ aiPlayers: { model: 'rm -rf /' } }) as { error: string }).error, /model/);
  assert.match((checkPlatformPatch({ aiPlayers: { seconds: 7 } }) as { error: string }).error, /time limit/);
  assert.match((checkPlatformPatch({ aiPlayers: { key: 'x' } }) as { error: string }).error, /Unknown AI setting/);
  // A stored row with one bad field keeps the good ones.
  const merged = mergePlatformSettings(defaultPlatformSettings(), { aiPlayers: { enabled: true, seconds: 7 } });
  assert.equal(merged.aiPlayers.enabled, true);
  assert.equal(merged.aiPlayers.seconds, 15);
});
