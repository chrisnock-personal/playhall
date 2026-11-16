import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { checkPair, describeCert, ensureCert, replaceCert } from './tls';

test('a self-signed certificate is made once and kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhall-tls-'));
  try {
    const a = await ensureCert(dir, ['playhall.example', '192.0.2.7']);
    assert.equal(a.generated, true);
    const info = describeCert(a.cert);
    assert.equal(info.selfSigned, true);
    assert.equal(info.expired, false);
    assert.ok(new Date(info.validTo).getTime() > Date.now() + 9 * 365 * 86_400_000, 'good for about ten years');
    const sans = new (await import('node:crypto')).X509Certificate(a.cert).subjectAltName ?? '';
    for (const n of ['DNS:localhost', 'DNS:playhall.example', 'IP Address:192.0.2.7', 'IP Address:127.0.0.1']) assert.ok(sans.includes(n), `${n} in ${sans}`);
    if (process.platform !== 'win32') assert.equal((fs.statSync(path.join(dir, 'server.key')).mode & 0o777).toString(8), '600', 'the key is private');
    const b = await ensureCert(dir, []);
    assert.equal(b.generated, false);
    assert.equal(b.cert, a.cert, 'kept across restarts');

    // A pair that doesn't match is refused; a matching one is swapped in live.
    const other = await ensureCert(fs.mkdtempSync(path.join(os.tmpdir(), 'playhall-tls-')), []);
    assert.match(checkPair(a.cert, other.key) ?? '', /don’t match/);
    assert.match(checkPair('nope', a.key) ?? '', /isn’t a PEM certificate/);
    assert.equal(checkPair(other.cert, other.key), null);
    const server = https.createServer({ cert: a.cert, key: a.key });
    replaceCert(server, dir, other.cert, other.key);
    assert.equal(fs.readFileSync(path.join(dir, 'server.crt'), 'utf8'), other.cert);
    assert.throws(() => replaceCert(server, dir, a.cert, other.key), /don’t match/);
    assert.equal(fs.readFileSync(path.join(dir, 'server.crt'), 'utf8'), other.cert, 'a refused pair leaves the files alone');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
