import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrackSource } from 'livekit-server-sdk';
import { CAMERA_PREFIX, cameraPermission, cameraToken, mediaPermission, mediaRoomName, mediaToken, publishSources } from './media';
import { Auth } from './auth';

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

test('side voice tokens use a per-game room and carry the microphone only', async () => {
  const jwt = await mediaToken(cfg, {
    code: 'ABC123', channel: 'team-0', generation: 'game-7', userId: 'u1', name: 'Sam',
    listen: true, talk: true, video: false,
  });
  const grant = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).video;
  assert.equal(grant.room, 'ABC123:team-0:game-7');
  assert.notEqual(mediaRoomName('ABC123', 'team-0', 'game-7'), mediaRoomName('ABC123', 'team-0', 'game-8'), 'the next side gets another room');
  assert.equal(mediaRoomName('ABC123', 'team-0'), 'ABC123:team-0', 'no generation for an old-style token');
  assert.equal(grant.canSubscribe, true);
  assert.deepEqual(grant.canPublishSources, ['microphone'], 'no camera in a team voice room');
});

test('the table camera’s token: sends only its camera to the table; hears and sees nothing', async () => {
  const jwt = await cameraToken(cfg, { code: 'CAM123', cameraId: 'abc' });
  const body = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  assert.equal(body.sub, 'camera:abc');
  assert.equal(body.name, 'Table camera');
  assert.equal(body.video.room, 'CAM123:table', 'never the gallery');
  assert.equal(body.video.canSubscribe, false);
  assert.equal(body.video.canPublish, true);
  assert.deepEqual(body.video.canPublishSources, ['camera'], 'no microphone, no screen share');
  assert.equal(body.video.canPublishData, false);
  assert.ok(body.exp - Math.floor(Date.now() / 1000) <= 600, 'short-lived');
  assert.deepEqual(cameraPermission(), { canSubscribe: false, canPublish: true, canPublishSources: [TrackSource.CAMERA], canPublishData: false });
  assert.ok(!/^[0-9a-f-]+$/.test(CAMERA_PREFIX + 'abc'), 'can’t be mistaken for a user id');
});

test('table camera links: tied to the room and device, and not a session', () => {
  const auth = new Auth({} as never, 's'.repeat(40));
  const key = auth.signCameraKey('CAM123', 'dev1');
  assert.deepEqual(auth.verifyCameraKey(key), { code: 'CAM123', cameraId: 'dev1' });
  assert.equal(auth.verify(key), null, 'a camera link can’t be used to sign in');
  assert.equal(auth.verifyCameraKey(auth.sign({ id: 'u1', name: 'Sam', guest: false, admin: false })), null, 'a session isn’t a camera link');
  assert.equal(auth.verifyCameraKey(new Auth({} as never, 't'.repeat(40)).signCameraKey('CAM123', 'dev1')), null, 'signed by this server only');
  assert.equal(auth.verifyCameraKey(key.slice(0, -2) + 'xx'), null);
  assert.equal(auth.verifyCameraKey(42), null);
  const p = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  assert.ok(p.exp - p.iat <= 12 * 3600, 'works for a games night at most');
});
