import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackSource } from 'livekit-server-sdk';
import { mediaPermission, mediaToken, publishSources } from './media';

const cfg = { url: 'http://livekit:7880', apiKey: 'key', apiSecret: 'x'.repeat(32) };
const grantOf = async (r: { listen: boolean; talk: boolean; video: boolean }) => {
  const jwt = await mediaToken(cfg, { code: 'ABC123', channel: 'table', userId: 'u1', name: 'Sam', ...r });
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).video;
};

test('publish sources: microphone when you may talk, the camera only with video', () => {
  assert.deepEqual(publishSources({ talk: false, video: false }), []);
  assert.deepEqual(publishSources({ talk: true, video: false }), [TrackSource.MICROPHONE], 'never empty when talking: LiveKit reads [] as anything');
  assert.deepEqual(publishSources({ talk: true, video: true }), [TrackSource.MICROPHONE, TrackSource.CAMERA]);
  assert.deepEqual(mediaPermission({ listen: true, talk: false, video: false }), { canSubscribe: true, canPublish: false, canPublishSources: [], canPublishData: false });
});

test('tokens carry the rights: a watcher can talk but not send the camera', async () => {
  const watcher = await grantOf({ listen: true, talk: true, video: false });
  assert.equal(watcher.room, 'ABC123:table');
  assert.equal(watcher.canPublish, true);
  assert.equal(watcher.canSubscribe, true);
  assert.deepEqual(watcher.canPublishSources, ['microphone']);
  const player = await grantOf({ listen: true, talk: true, video: true });
  assert.deepEqual(player.canPublishSources, ['microphone', 'camera']);
  const listener = await grantOf({ listen: true, talk: false, video: false });
  assert.equal(listener.canPublish, false);
});
