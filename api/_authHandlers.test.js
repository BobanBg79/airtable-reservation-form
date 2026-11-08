import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleLogin, handleLogout, handleMe } from './_authHandlers.js';
import { fakeRes, fakeSql } from './_fakeSql.js';
import { generateToken } from './_sessions.js';

const sessionRow = {
  session_id: '11',
  expires_at: new Date('2026-12-08T10:00:00Z'),
  user_id: '5',
  email: 'owner@example.com',
  first_name: 'Ana',
  last_name: 'Petrovic',
  role: 'admin',
  permissions: ['can_view_user'],
};
const withToken = () => ({ headers: { authorization: `Bearer ${generateToken().token}` } });

// ---- /api/auth/login ----

test('login: only POST (405 with Allow otherwise)', async () => {
  const res = fakeRes();
  await handleLogin({ method: 'GET', headers: {} }, res, fakeSql());
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

test('login: a wrong password gives 401 "Invalid email or password"; the IP comes from x-forwarded-for', async () => {
  const sql = fakeSql([
    ['from login_attempts', [{ pair_failures: 0, ip_failures: 0 }]],
    ['from users u join roles r', []],
  ]);
  const res = fakeRes();
  await handleLogin({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.7' }, body: { email: 'a@b.co', password: 'x' } }, res, sql);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Invalid email or password' });
  assert.equal(sql.callsTo('insert into login_attempts')[0].params[1], '203.0.113.7');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('login: 429 carries Retry-After', async () => {
  const sql = fakeSql([['from login_attempts', [{ pair_failures: 5, ip_failures: 5 }]]]);
  const res = fakeRes();
  await handleLogin({ method: 'POST', headers: {}, body: { email: 'a@b.co', password: 'x' } }, res, sql);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '900');
});

test('login: a JSON string body is parsed, and a missing body is a 400', async () => {
  const sql = fakeSql([
    ['from login_attempts', [{ pair_failures: 0, ip_failures: 0 }]],
    ['from users u join roles r', []],
  ]);
  const res1 = fakeRes();
  await handleLogin({ method: 'POST', headers: {}, body: JSON.stringify({ email: 'a@b.co', password: 'x' }) }, res1, sql);
  assert.equal(res1.statusCode, 401);
  const res2 = fakeRes();
  await handleLogin({ method: 'POST', headers: {} }, res2, fakeSql());
  assert.equal(res2.statusCode, 400);
});

test('login: a database failure is a generic 500 that leaks nothing', async () => {
  const sql = { query: async () => { throw new Error('connection to postgres://user:secret@host failed'); } };
  const res = fakeRes();
  const original = console.error;
  console.error = () => {};
  try {
    await handleLogin({ method: 'POST', headers: {}, body: { email: 'a@b.co', password: 'x' } }, res, sql);
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /secret|postgres/);
});

// ---- /api/auth/me ----

test('me: no token is 401', async () => {
  const res = fakeRes();
  await handleMe({ method: 'GET', headers: {} }, res, fakeSql());
  assert.equal(res.statusCode, 401);
});

test('me: an unknown, expired or inactive session is 401 (the statement finds nothing)', async () => {
  const res = fakeRes();
  await handleMe({ method: 'GET', ...withToken() }, res, fakeSql([['update sessions', []]]));
  assert.equal(res.statusCode, 401);
});

test('me: a valid session returns the user, permissions and expiry', async () => {
  const res = fakeRes();
  await handleMe({ method: 'GET', ...withToken() }, res, fakeSql([['update sessions', [sessionRow]]]));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    user: { id: '5', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic', role: 'admin' },
    permissions: ['can_view_user'],
    expiresAt: '2026-12-08T10:00:00.000Z',
  });
});

test('me: only GET', async () => {
  const res = fakeRes();
  await handleMe({ method: 'POST', headers: {} }, res, fakeSql());
  assert.equal(res.statusCode, 405);
});

// ---- /api/auth/logout ----

test('logout: needs a session (401 without one)', async () => {
  const res = fakeRes();
  await handleLogout({ method: 'POST', headers: {} }, res, fakeSql());
  assert.equal(res.statusCode, 401);
});

test('logout: sets is_active = false on the current session and nothing else', async () => {
  const sql = fakeSql([['update sessions s', [sessionRow]]]);
  const res = fakeRes();
  await handleLogout({ method: 'POST', ...withToken() }, res, sql);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  const revoke = sql.callsTo('set is_active = false');
  assert.equal(revoke.length, 1);
  assert.deepEqual(revoke[0].params, ['11', '5']);
  assert.ok(sql.calls.every((c) => !/delete/i.test(c.text)));
});

test('logout: only POST', async () => {
  const res = fakeRes();
  await handleLogout({ method: 'GET', headers: {} }, res, fakeSql());
  assert.equal(res.statusCode, 405);
});
