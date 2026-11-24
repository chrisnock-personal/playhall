import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { frontHandler } from './front';

test('the front drops a connection that never sends anything, and hands on one that does (#67)', async () => {
  const handed: string[] = [];
  const server = net.createServer(frontHandler(
    { emit: (_e, s) => { handed.push('tls'); s.end(); } },
    { emit: (_e, s) => { handed.push('plain'); s.end(); } },
    150,
  ));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  const closedAfter = await new Promise<number>((resolve) => {
    const t = Date.now();
    const c = net.connect(port, '127.0.0.1');
    c.on('close', () => resolve(Date.now() - t));
  });
  assert.ok(closedAfter < 1000, `a silent connection closed after ${closedAfter} ms`);
  await new Promise<void>((resolve) => {
    const c = net.connect(port, '127.0.0.1', () => c.write('GET / HTTP/1.1\r\n\r\n'));
    c.on('close', () => resolve());
  });
  assert.deepEqual(handed, ['plain']);
  server.close();
});
