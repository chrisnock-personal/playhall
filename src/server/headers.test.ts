import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy, securityHeaders } from './headers';

test('the content security policy: own scripts, this host for connections, no framing', () => {
  const csp = contentSecurityPolicy('192.168.1.195:8450');
  assert.match(csp, /script-src 'self' blob:/);
  assert.match(csp, /connect-src 'self' wss:\/\/192\.168\.1\.195:8450 ws:\/\/192\.168\.1\.195:8450/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(contentSecurityPolicy('evil.com; script-src *'), /script-src \*/, 'a crafted Host header can’t add directives');
});

test('HSTS only over HTTPS; nosniff and no framing always', () => {
  const run = (secure: boolean) => {
    const h: Record<string, string> = {};
    securityHeaders({ secure, headers: { host: 'x' } } as never, { setHeader: (k: string, v: string) => { h[k] = v; } } as never, () => {});
    return h;
  };
  assert.equal(run(true)['Strict-Transport-Security'], 'max-age=15552000');
  assert.equal(run(false)['Strict-Transport-Security'], undefined);
  assert.equal(run(false)['X-Content-Type-Options'], 'nosniff');
  assert.equal(run(false)['X-Frame-Options'], 'DENY');
});

test('the /rtc proxy forwards only the LiveKit client’s validate checks (#66)', async () => {
  const { isRtcValidate } = await import('./http');
  assert.ok(isRtcValidate('/rtc/validate'));
  assert.ok(isRtcValidate('/rtc/v1/validate'));
  for (const p of ['/rtc', '/rtc/../twirp/livekit.RoomService/ListRooms', '/rtc/%2e%2e/twirp/x', '/rtc/v1/../../twirp', '/rtc/validate/x']) assert.ok(!isRtcValidate(p), p);
});
