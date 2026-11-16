import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Request, type Response } from 'express';
import type { Db } from './db';
import { Auth } from './auth';
import { adminChangeProblem, type AdminTarget } from './admin';
import { resetPlatformSettingsForTests } from './platform';
import { defaultPlatformSettings } from '../shared/platform';

const SECRET = 'test-only-secret-0123456789abcdef0123456789';
const ME = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

function fakeDb(adminIds: string[] = []) {
  return {
    query: async (sql: string) => {
      if (/FROM users WHERE kind = 'account' AND \(is_admin/.test(sql)) return { rows: adminIds.map((id) => ({ id })) };
      if (/INSERT INTO users/.test(sql)) return { rows: [{ id: OTHER }] };
      return { rows: [] };
    },
  } as unknown as Db;
}

test('who can make or remove an admin', () => {
  const acct = (id: string, admin: boolean, envAdmin = false): AdminTarget => ({ id, kind: 'account', admin, envAdmin });
  assert.equal(adminChangeProblem(ME, null, true, 1), 'No such account');
  assert.match(adminChangeProblem(ME, { id: OTHER, kind: 'guest', admin: false, envAdmin: false }, true, 1)!, /Guests/);
  assert.equal(adminChangeProblem(ME, acct(OTHER, false), true, 1), null, 'make another account admin');
  assert.equal(adminChangeProblem(ME, acct(OTHER, true), false, 2), null, 'remove another admin');
  assert.match(adminChangeProblem(ME, acct(ME, true), false, 1)!, /only admin/, 'not the last admin, yourself');
  assert.equal(adminChangeProblem(ME, acct(ME, true), false, 2), null, 'step down when there’s another admin');
  assert.match(adminChangeProblem(ME, acct(OTHER, true, true), false, 3)!, /ADMIN_USERNAMES/, 'admins from the environment stay');
  assert.equal(adminChangeProblem(ME, acct(OTHER, false), false, 1), null, 'removing a non-admin does nothing');
});

test('sessions say who is an admin, from the cache', async () => {
  const auth = new Auth(fakeDb([ME]), SECRET, ['Boss']);
  await auth.loadAdmins();
  assert.equal(auth.envAdmins.has('boss'), true, 'usernames are lower-cased');
  const mine = auth.verify(auth.sign({ id: ME, name: 'Me', guest: false, admin: false }));
  assert.equal(mine?.admin, true, 'from the database, not the token');
  assert.equal(auth.verify(auth.sign({ id: OTHER, name: 'Other', guest: false, admin: true }))?.admin, false, 'a token can’t claim it');
  auth.setAdmin(OTHER, true);
  assert.equal(auth.verify(auth.sign({ id: OTHER, name: 'Other', guest: false, admin: false }))?.admin, true, 'takes effect without signing in again');
  auth.setAdmin(ME, false);
  assert.equal(auth.verify(auth.sign({ id: ME, name: 'Me', guest: false, admin: true }))?.admin, false);
  assert.equal(auth.adminCount, 1);
});

function run(mw: (req: Request, res: Response, next: () => void) => void, token: string | null) {
  let status = 200, passed = false;
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} } as Request;
  const res = { status(n: number) { status = n; return this; }, json() { return this; } } as unknown as Response;
  mw(req, res, () => { passed = true; });
  return { status, passed, user: req.user };
}

test('requireAdmin lets admins through and nobody else', async () => {
  const auth = new Auth(fakeDb([ME]), SECRET);
  await auth.loadAdmins();
  assert.deepEqual(run(auth.requireAdmin, null), { status: 401, passed: false, user: undefined });
  assert.equal(run(auth.requireAdmin, auth.sign({ id: OTHER, name: 'O', guest: false, admin: false })).status, 403);
  assert.equal(run(auth.requireAdmin, auth.sign({ id: ME, name: 'G', guest: true, admin: false })).status, 403, 'a guest token is never an admin');
  const ok = run(auth.requireAdmin, auth.sign({ id: ME, name: 'Me', guest: false, admin: false }));
  assert.equal(ok.passed, true);
  assert.equal(ok.user?.admin, true);
});

test('sign-ups and guests follow the platform settings', async () => {
  const auth = new Auth(fakeDb(), SECRET, ['newboss']);
  const app = express();
  app.use(express.json());
  app.use('/auth', auth.routes());
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`;
  const post = (path: string, body: unknown) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    resetPlatformSettingsForTests({ ...defaultPlatformSettings(), signupsAllowed: false, guestsAllowed: false });
    assert.equal((await post('/register', { username: 'someone', password: 'long-enough-pw' })).status, 403);
    assert.equal((await post('/guest', { displayName: 'Kai' })).status, 403);
    assert.deepEqual(await (await fetch(url + '/options')).json(), { allowSignup: false, allowGuests: false });

    resetPlatformSettingsForTests();
    const g = await post('/guest', { displayName: 'Kai' });
    assert.equal(g.status, 201);
    assert.equal((await g.json()).user.admin, false);
    const r = await post('/register', { username: 'NewBoss', password: 'long-enough-pw' });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).user.admin, true, 'an ADMIN_USERNAMES account is an admin from the start');
  } finally {
    resetPlatformSettingsForTests();
    server.close();
  }
});
