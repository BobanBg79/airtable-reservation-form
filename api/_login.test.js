import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeSql } from './_fakeSql.js';
import { INVALID, performLogin } from './_login.js';
import { hashPassword, verifyPassword } from './_password.js';

const IP = '203.0.113.7';
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

// A database where `user` exists (or not) and nobody is rate limited, unless `limited` says so.
function db({ user, limited = false } = {}) {
  return fakeSql([
    ['from login_attempts', [limited ? { pair_failures: 5, ip_failures: 5 } : { pair_failures: 0, ip_failures: 0 }]],
    ['from users u join roles r', user ? [user] : []],
    ['update sessions', [sessionRow]],
  ]);
}

// A verify function that records its calls (bcrypt itself is covered by _password.test.js).
function spyVerify(result) {
  const calls = [];
  const verify = async (password, hash) => {
    calls.push({ password, hash });
    return typeof result === 'function' ? result(password, hash) : result;
  };
  return { verify, calls };
}

const GOOD = { id: '5', password_hash: '$2b$12$realhash', can_login: true };

test('a missing or malformed email or password is a 400 and touches nothing', async () => {
  const sql = db();
  for (const input of [{}, { email: 'a@b.co' }, { password: 'x' }, { email: 42, password: 'x' }, { email: 'a@b.co', password: '' }]) {
    const r = await performLogin(sql, { ...input, ip: IP });
    assert.equal(r.status, 400);
  }
  assert.equal(sql.calls.length, 0);
});

test('a wrong password is a 401 with the standard message, and the failure is recorded', async () => {
  const sql = db({ user: GOOD });
  const { verify } = spyVerify(false);
  const r = await performLogin(sql, { email: ' Owner@Example.com ', password: 'wrong', ip: IP }, { verify });
  assert.deepEqual(r, { status: 401, body: { error: INVALID } });
  const attempt = sql.callsTo('insert into login_attempts');
  assert.equal(attempt.length, 1);
  assert.deepEqual(attempt[0].params, ['owner@example.com', IP, '5', false]); // email lowercased
  assert.equal(sql.callsTo('insert into sessions').length, 0);
});

test('an inactive user cannot sign in even with the right password; same message, failure recorded', async () => {
  const sql = db({ user: { ...GOOD, can_login: false } });
  const r = await performLogin(sql, { email: 'owner@example.com', password: 'right', ip: IP }, { verify: spyVerify(true).verify });
  assert.deepEqual(r, { status: 401, body: { error: INVALID } });
  assert.equal(sql.callsTo('insert into sessions').length, 0);
  assert.deepEqual(sql.callsTo('insert into login_attempts')[0].params.slice(2), ['5', false]);
});

test('an unknown email gets the same 401 and still pays for one bcrypt check (a dummy hash)', async () => {
  const sql = db();
  const spy = spyVerify(true); // even a "successful" check cannot log in a user that does not exist
  const r = await performLogin(sql, { email: 'nobody@example.com', password: 'whatever', ip: IP }, spy);
  assert.deepEqual(r, { status: 401, body: { error: INVALID } });
  assert.equal(spy.calls.length, 1);
  assert.match(spy.calls[0].hash, /^\$2b\$12\$.{53}$/); // a well-formed cost-12 bcrypt hash
  assert.deepEqual(sql.callsTo('insert into login_attempts')[0].params, ['nobody@example.com', IP, null, false]);
});

test('all failures look identical to the caller', async () => {
  const wrong = await performLogin(db({ user: GOOD }), { email: 'a@b.co', password: 'x', ip: IP }, { verify: spyVerify(false).verify });
  const inactive = await performLogin(db({ user: { ...GOOD, can_login: false } }), { email: 'a@b.co', password: 'x', ip: IP }, { verify: spyVerify(true).verify });
  const unknown = await performLogin(db(), { email: 'a@b.co', password: 'x', ip: IP }, { verify: spyVerify(false).verify });
  assert.deepEqual(wrong, inactive);
  assert.deepEqual(wrong, unknown);
});

test('over the limit: 429 with Retry-After, the password is NOT checked and no attempt is recorded', async () => {
  const sql = db({ user: GOOD, limited: true });
  const spy = spyVerify(true);
  const r = await performLogin(sql, { email: 'owner@example.com', password: 'right', ip: IP }, spy);
  assert.equal(r.status, 429);
  assert.equal(r.headers['Retry-After'], '900');
  assert.equal(spy.calls.length, 0);
  assert.equal(sql.callsTo('from users').length, 0);
  assert.equal(sql.callsTo('insert into login_attempts').length, 0);
});

test('the limits are checked BEFORE the user is looked up', async () => {
  const sql = db({ user: GOOD });
  await performLogin(sql, { email: 'owner@example.com', password: 'right', ip: IP }, { verify: spyVerify(true).verify });
  const order = sql.calls.map((c) => (c.text.includes('from login_attempts') ? 'limits' : c.text.includes('from users u') ? 'user' : 'other'));
  assert.ok(order.indexOf('limits') < order.indexOf('user'));
});

test('success: one transaction records the attempt, sets last_login_at and creates the session; returns token, user, permissions', async () => {
  const sql = db({ user: GOOD });
  const r = await performLogin(sql, { email: 'Owner@Example.com', password: 'right', ip: IP }, { verify: spyVerify(true).verify });

  assert.equal(r.status, 200);
  assert.match(r.body.token, /^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
  assert.deepEqual(r.body.user, { id: '5', email: 'owner@example.com', firstName: 'Ana', lastName: 'Petrovic', role: 'admin' });
  assert.deepEqual(r.body.permissions, ['can_view_user']);
  assert.equal(r.body.expiresAt, '2026-12-08T10:00:00.000Z');

  assert.deepEqual(sql.callsTo('insert into login_attempts')[0].params, ['owner@example.com', IP, '5', true]);
  assert.match(sql.callsTo('update users set last_login_at = now()')[0].text, /last_login_at = now\(\)/);
  const created = sql.callsTo('insert into sessions');
  assert.equal(created.length, 1);
  const revoked = sql.callsTo('update sessions set is_active = false');
  assert.equal(revoked.length, 1, 'the older sessions of the user are ended');
  assert.deepEqual(revoked[0].params, ['5', '5']);
  assert.ok(sql.calls.indexOf(revoked[0]) < sql.calls.indexOf(created[0]), 'the old sessions end before the new one is made');
  assert.ok(!created[0].params.includes(r.body.token), 'only the hash of the token is stored');
});

test('the response never contains a password or a hash', async () => {
  const r = await performLogin(db({ user: GOOD }), { email: 'owner@example.com', password: 'right', ip: IP }, { verify: spyVerify(true).verify });
  assert.doesNotMatch(JSON.stringify(r), /password|\$2b\$|realhash/i);
});

test('the system user dev-seed cannot sign in: no password matches its hash, like any wrong login', async () => {
  // The hash migration 0005 gives dev-seed is not a bcrypt hash, so the real check is always false.
  assert.equal(await verifyPassword('anything at all 12345', '!no-login'), false);
  assert.equal(await verifyPassword('!no-login', '!no-login'), false);

  const sql = db({ user: { id: '6', password_hash: '!no-login', can_login: false } });
  const r = await performLogin(sql, { email: 'dev-seed@system.local', password: '!no-login', ip: IP });
  assert.deepEqual(r, { status: 401, body: { error: INVALID } });
});

test('a real bcrypt round trip signs in', async () => {
  const hash = await hashPassword('correct horse battery');
  const sql = db({ user: { id: '5', password_hash: hash, can_login: true } });
  const ok = await performLogin(sql, { email: 'owner@example.com', password: 'correct horse battery', ip: IP });
  assert.equal(ok.status, 200);
  const bad = await performLogin(db({ user: { id: '5', password_hash: hash, can_login: true } }), { email: 'owner@example.com', password: 'wrong horse battery', ip: IP });
  assert.equal(bad.status, 401);
});
